import Fastify from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  checksSchema,
  defaultChecks,
  graphSchema,
  jobSchema,
  planInputSchema,
  projectInputSchema,
  runSchema,
  type Job,
  type TestRun,
} from '../../frontend/src/core/model.ts';
import { buildPlan, planExecutionProblem } from '../../frontend/src/core/cascade.ts';
import { BrowserEngine, type RunnerConfig } from './engine.js';
import { parseSpecification } from './openapi.js';
import { networkPolicy } from './policy.js';
import { InputError } from './types.js';

interface AppConfig extends RunnerConfig {
  dataDirectory: string;
  clientOrigins: string[];
}
const idSchema = z.uuid();
const imageSchema = z.string().regex(/^\d+-(baseline|fault|final)\.jpg$/);

export async function createApp(config: AppConfig) {
  const app = Fastify({ bodyLimit: 2_000_000, logger: false });
  const engine = new BrowserEngine(config);
  const policy = networkPolicy(config.targetOrigins);
  const directory = resolve(config.dataDirectory);
  await mkdir(directory, { recursive: true });
  const jobs = new Map<string, Job>();
  const runs = new Map<string, TestRun>();
  const controllers = new Map<string, AbortController>();
  const tasks = new Set<Promise<void>>();
  await app.register(cors, { origin: config.clientOrigins, methods: ['GET', 'POST', 'DELETE'] });
  app.addHook('onRequest', async (request, reply) => {
    if (request.headers.origin && !config.clientOrigins.includes(request.headers.origin)) {
      await reply.code(403).send({ message: 'Этот адрес интерфейса не разрешён.' });
    }
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
  });
  app.setErrorHandler((error, _request, reply) => {
    const status =
      error instanceof InputError ? error.statusCode : error instanceof z.ZodError ? 400 : 500;
    void reply
      .code(status)
      .send({ message: error instanceof Error ? error.message : 'Ошибка проверки.' });
  });

  function reserve(id: string) {
    if (controllers.size)
      throw new InputError('Дождитесь завершения текущей браузерной проверки.', 'RUNNER_BUSY', 409);
    const controller = new AbortController();
    controllers.set(id, controller);
    return controller;
  }
  function launch(id: string, task: () => Promise<void>) {
    const promise = task()
      .catch((error: unknown) => {
        app.log.error(error);
      })
      .finally(() => {
        controllers.delete(id);
        tasks.delete(promise);
      });
    tasks.add(promise);
  }
  async function save(kind: 'jobs' | 'runs', id: string, value: Job | TestRun) {
    const file = resolve(directory, `${kind}-${id}.json`);
    await writeFile(`${file}.tmp`, JSON.stringify(value));
    await rename(`${file}.tmp`, file);
  }
  async function load(kind: 'jobs', id: string): Promise<Job>;
  async function load(kind: 'runs', id: string): Promise<TestRun>;
  async function load(kind: 'jobs' | 'runs', id: string): Promise<Job | TestRun> {
    idSchema.parse(id);
    const cached = kind === 'jobs' ? jobs.get(id) : runs.get(id);
    if (cached) return cached;
    try {
      const raw: unknown = JSON.parse(
        await readFile(resolve(directory, `${kind}-${id}.json`), 'utf8'),
      );
      const value = kind === 'jobs' ? jobSchema.parse(raw) : runSchema.parse(raw);
      if (value.status === 'running' || value.status === 'queued') value.status = 'cancelled';
      return value;
    } catch {
      throw new InputError('Результат не найден на этом сервере.', 'NOT_FOUND', 404);
    }
  }
  app.get('/health', () => ({ status: 'ok', source: 'playwright' }));
  app.post('/discoveries', async (request, reply) => {
    const input = projectInputSchema
      .pick({ frontendUrl: true, specification: true, maxPages: true })
      .parse(request.body);
    policy.assert(input.frontendUrl);
    const catalog = await parseSpecification(input.specification, input.frontendUrl);
    const id = randomUUID();
    const controller = reserve(id);
    const job: Job = {
      id,
      source: 'playwright',
      createdAt: new Date().toISOString(),
      status: 'running',
      progress: { completed: 0, discovered: 1 },
    };
    jobs.set(id, job);
    launch(id, async () => {
      try {
        await save('jobs', id, job);
        job.graph = await engine.discover({ ...input, catalog }, controller.signal, (progress) => {
          job.progress = progress;
        });
        job.status = 'completed';
      } catch (error) {
        job.status = controller.signal.aborted ? 'cancelled' : 'failed';
        if (!controller.signal.aborted)
          job.error = {
            code: 'DISCOVERY_FAILED',
            message: error instanceof Error ? error.message : 'Не удалось обследовать страницы.',
          };
      }
      await save('jobs', id, job);
    });
    return reply.code(202).send(job);
  });
  app.get<{ Params: { id: string } }>('/discoveries/:id', (request) =>
    load('jobs', request.params.id),
  );
  app.delete<{ Params: { id: string } }>('/discoveries/:id', async (request) => {
    const job = await load('jobs', request.params.id);
    controllers.get(request.params.id)?.abort();
    return { ...job, status: job.status === 'running' ? 'cancelled' : job.status };
  });
  app.post('/runs', async (request, reply) => {
    const { graph, plan, checks } = z
      .object({
        graph: graphSchema,
        plan: planInputSchema,
        checks: checksSchema.default(defaultChecks),
      })
      .parse(request.body);
    for (const route of graph.routes) policy.assert(route.url);
    const prepared = buildPlan(graph, plan);
    const problem = planExecutionProblem(prepared);
    if (problem) throw new InputError(problem.message, problem.code);
    const id = randomUUID();
    const controller = reserve(id);
    const run: TestRun = {
      id,
      remoteId: id,
      source: 'playwright',
      checks,
      createdAt: new Date().toISOString(),
      status: 'running',
      plan,
      progress: { completed: 0, total: prepared.cases.length },
      results: [],
      warnings: [...graph.warnings, ...prepared.warnings],
    };
    runs.set(id, run);
    launch(id, async () => {
      let imageBytes = 0;
      try {
        await mkdir(resolve(directory, id), { recursive: true });
        await save('runs', id, run);
        await engine.execute(
          graph,
          plan,
          checks,
          controller.signal,
          async (key, image) => {
            imageSchema.parse(`${key}.jpg`);
            if (imageBytes + image.length > 50 * 1024 * 1024) {
              if (!run.warnings.includes('Достигнут лимит скриншотов 50 МБ за прогон.'))
                run.warnings.push('Достигнут лимит скриншотов 50 МБ за прогон.');
              return false;
            }
            await writeFile(resolve(directory, id, `${key}.jpg`), image);
            imageBytes += image.length;
            return true;
          },
          async (result) => {
            run.results.push(result);
            run.progress.completed = run.results.length;
            await save('runs', id, run);
          },
        );
        run.status = 'completed';
      } catch (error) {
        run.status = controller.signal.aborted ? 'cancelled' : 'failed';
        if (!controller.signal.aborted)
          run.error = {
            code: 'RUN_FAILED',
            message: error instanceof Error ? error.message : 'Ошибка браузерной проверки.',
          };
      }
      await save('runs', id, run);
    });
    return reply.code(202).send(run);
  });
  app.get<{ Params: { id: string } }>('/runs/:id', (request) => load('runs', request.params.id));
  app.delete<{ Params: { id: string } }>('/runs/:id', async (request) => {
    const run = await load('runs', request.params.id);
    controllers.get(request.params.id)?.abort();
    return { ...run, status: run.status === 'running' ? 'cancelled' : run.status };
  });
  app.get<{ Params: { id: string; image: string } }>(
    '/runs/:id/screenshots/:image',
    async (request, reply) => {
      const { id, image } = request.params;
      idSchema.parse(id);
      imageSchema.parse(image);
      try {
        const data = await readFile(resolve(directory, id, image));
        return reply.type('image/jpeg').send(data);
      } catch {
        return reply.code(404).send({ message: 'Скриншот не найден. Повторите проверку.' });
      }
    },
  );
  app.addHook('onClose', async () => {
    for (const controller of controllers.values()) controller.abort();
    await Promise.allSettled([...tasks]);
    await engine.close();
  });
  return app;
}
