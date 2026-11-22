import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  Job,
  TestRun,
  Graph,
  PlanInput,
  UiChecks,
  CaseResult,
} from '../../frontend/src/core/model.ts';
import { buildPlan, planExecutionProblem } from '../../frontend/src/core/cascade.ts';
import { BrowserEngine, type RunnerConfig } from './engine.js';
import { InputError, type DiscoveryInput } from './types.js';

type Entry = { controller: AbortController; done: Promise<void> };
export class RunnerStore {
  private entries = new Map<string, Entry>();
  private active?: string;
  private engine: BrowserEngine;
  private directory: string;
  constructor(config: RunnerConfig & { dataDir?: string }) {
    this.engine = new BrowserEngine(config);
    this.directory = resolve(config.dataDir ?? 'apps/backend/.runtime');
    mkdirSync(this.directory, { recursive: true });
  }
  get busy() {
    return !!this.active;
  }
  private ensureIdle() {
    if (this.busy)
      throw new InputError(
        'Дождитесь завершения текущей операции или отмените её.',
        'RUNNER_BUSY',
        409,
      );
  }
  private id(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id))
      throw new InputError('Некорректный идентификатор.', 'INVALID_ID');
    return id;
  }
  private write(kind: 'job' | 'run', value: Job | TestRun) {
    const file = join(this.directory, `${kind}-${this.id(value.id)}.json`);
    writeFileSync(`${file}.tmp`, JSON.stringify(value));
    renameSync(`${file}.tmp`, file);
  }
  private read<T extends Job | TestRun>(kind: 'job' | 'run', id: string): T {
    const file = join(this.directory, `${kind}-${this.id(id)}.json`);
    if (!existsSync(file))
      throw new InputError(
        'Запуск не найден. Постройте граф или запустите проверку заново.',
        'NOT_FOUND',
        404,
      );
    const value = JSON.parse(readFileSync(file, 'utf8')) as T;
    if (!this.entries.has(id) && ['queued', 'running'].includes(value.status)) {
      value.status = 'cancelled';
      this.write(kind, value);
    }
    return value;
  }
  private cleanup(kind: 'job' | 'run', limit: number) {
    const files = readdirSync(this.directory).filter(
      (name) => name.startsWith(`${kind}-`) && name.endsWith('.json'),
    );
    const entries = files
      .map((file) => ({
        file,
        value: JSON.parse(readFileSync(join(this.directory, file), 'utf8')) as Job | TestRun,
      }))
      .sort((a, b) => b.value.createdAt.localeCompare(a.value.createdAt));
    for (const entry of entries.slice(limit - 1)) {
      if (this.entries.has(entry.value.id)) continue;
      rmSync(join(this.directory, entry.file));
      if (kind === 'run')
        rmSync(join(this.directory, entry.value.id), { recursive: true, force: true });
    }
  }
  private launch(id: string, kind: 'job' | 'run', work: (signal: AbortSignal) => Promise<void>) {
    const controller = new AbortController();
    const entry = { controller, done: Promise.resolve() };
    this.active = id;
    this.entries.set(id, entry);
    entry.done = (async () => {
      const timer = setTimeout(
        () => controller.abort(new Error('Превышено время выполнения.')),
        kind === 'job' ? 120_000 : 600_000,
      );
      timer.unref();
      try {
        await work(controller.signal);
      } catch (error) {
        const value = this.read(kind, id);
        const cancelled =
          controller.signal.aborted &&
          controller.signal.reason?.message !== 'Превышено время выполнения.';
        value.status = cancelled ? 'cancelled' : 'failed';
        value.error = cancelled
          ? undefined
          : {
              code: 'EXECUTION_ERROR',
              message:
                error instanceof Error
                  ? error.message.slice(0, 400)
                  : 'Ошибка браузерного запуска.',
            };
        this.write(kind, value);
      } finally {
        clearTimeout(timer);
        this.entries.delete(id);
        if (this.active === id) this.active = undefined;
      }
    })();
  }
  discover(input: DiscoveryInput): Job {
    this.ensureIdle();
    this.cleanup('job', 20);
    const job: Job = {
      id: randomUUID(),
      source: 'playwright',
      createdAt: new Date().toISOString(),
      status: 'running',
      progress: { completed: 0, discovered: 1 },
    };
    this.write('job', job);
    this.launch(job.id, 'job', async (signal) => {
      job.graph = await this.engine.discover(input, signal, (progress) => {
        job.progress = progress;
        this.write('job', job);
      });
      job.status = 'completed';
      this.write('job', job);
    });
    return structuredClone(job);
  }
  job(id: string) {
    return this.read<Job>('job', id);
  }
  graph(id: string): Graph {
    const job = this.job(id);
    if (job.status !== 'completed' || !job.graph)
      throw new InputError('Сначала завершите живое построение графа.', 'GRAPH_NOT_READY', 409);
    return job.graph;
  }
  execute(input: { plan: PlanInput; checks: UiChecks }): TestRun {
    this.ensureIdle();
    const graph = this.graph(input.plan.discoveryId);
    const plan = buildPlan(graph, input.plan);
    const problem = planExecutionProblem(plan);
    if (problem) throw new InputError(problem.message, problem.code);
    this.cleanup('run', 20);
    const run: TestRun = {
      id: randomUUID(),
      source: 'playwright',
      createdAt: new Date().toISOString(),
      status: 'running',
      plan: input.plan,
      checks: input.checks,
      progress: { completed: 0, total: plan.cases.length },
      results: [],
      warnings: [],
    };
    const directory = join(this.directory, run.id);
    mkdirSync(directory, { recursive: true });
    let bytes = 0;
    this.write('run', run);
    this.launch(run.id, 'run', async (signal) => {
      await this.engine.execute(
        graph,
        input.plan,
        input.checks,
        signal,
        async (key, image) => {
          if (signal.aborted || image.length > 1_000_000 || bytes + image.length > 32_000_000) {
            if (!run.warnings.includes('Достигнут лимит размера скриншотов.'))
              run.warnings.push('Достигнут лимит размера скриншотов.');
            return false;
          }
          writeFileSync(join(directory, `${key}.jpg`), image);
          bytes += image.length;
          return true;
        },
        async (result: CaseResult) => {
          run.results.push(result);
          run.progress.completed = run.results.length;
          this.write('run', run);
        },
      );
      run.status = 'completed';
      this.write('run', run);
    });
    return structuredClone(run);
  }
  run(id: string) {
    return this.read<TestRun>('run', id);
  }
  image(id: string, key: string) {
    this.id(id);
    if (!/^\d+-(baseline|fault|final)$/.test(key))
      throw new InputError('Некорректный ключ изображения.');
    const file = join(this.directory, id, `${key}.jpg`);
    if (!existsSync(file))
      throw new InputError(
        'Скриншот недоступен: запуск удалён из архива runner.',
        'NOT_FOUND',
        404,
      );
    return readFileSync(file);
  }
  async cancel(kind: 'job' | 'run', id: string) {
    const value = this.read(kind, id);
    const entry = this.entries.get(id);
    if (entry) {
      entry.controller.abort(new Error('Операция отменена.'));
      await entry.done;
    }
    return entry ? this.read(kind, id) : value;
  }
  async close() {
    await Promise.all(
      [...this.entries].map(async ([, entry]) => {
        entry.controller.abort(new Error('Операция отменена.'));
        await entry.done;
      }),
    );
    await this.engine.close();
  }
}
