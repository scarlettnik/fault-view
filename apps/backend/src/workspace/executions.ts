import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { BrowserEngine, type RunnerConfig } from '../engine.js';
import { parseSpecification } from '../openapi.js';
import { networkPolicy } from '../policy.js';
import { InputError, notFound } from '../types.js';
import { planExecutionProblem } from '../../../frontend/src/core/cascade.ts';
import {
  defaultChecks,
  type Job,
  type PlanInput,
  type TestRun,
} from '../../../frontend/src/core/model.ts';
import { transaction } from './db.js';
import { preparePlan } from './history.js';
import { assertIdle, ownedProject, type ProjectRow } from './projects.js';
import { imageLimit, screenshotName, type ScreenshotStorage } from './screenshots.js';

export interface ExecutionConfig {
  targetOrigins: string[];
  demoOnly: boolean;
  chromiumSandbox?: boolean;
  executablePath?: string;
  storage?: ScreenshotStorage;
}

type Operation = Job | TestRun;
type Table = 'discoveries' | 'runs';
type Work<T extends Operation> = { state: T; work: (signal: AbortSignal) => Promise<void> };
const workerLock = 196214016;

export class WorkspaceExecutions {
  private readonly engine: BrowserEngine;
  private readonly policy: ReturnType<typeof networkPolicy>;
  private active?: { id: string; controller: AbortController; done?: Promise<void> };
  private worker?: PoolClient;
  private cleanup?: Promise<void>;
  private timer?: NodeJS.Timeout;

  constructor(
    private pool: Pool,
    private config: ExecutionConfig,
  ) {
    const runner: RunnerConfig = {
      targetOrigins: config.targetOrigins,
      allowDemoAdapters: false,
      chromiumSandbox: config.chromiumSandbox,
      executablePath: config.executablePath,
    };
    this.engine = new BrowserEngine(runner);
    this.policy = networkPolicy(config.targetOrigins);
  }

  async start() {
    if (!this.config.targetOrigins.length) return;
    const worker = await this.pool.connect();
    try {
      const { rows } = await worker.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1, hashtext(current_schema())) AS locked',
        [workerLock],
      );
      if (!rows[0]?.locked) throw new Error('One FaultView browser worker is already active.');
      for (const table of ['discoveries', 'runs'] as const) {
        await worker.query(
          `UPDATE ${table} SET state = state || $1::jsonb WHERE state->>'status' IN ('queued', 'running')`,
          [
            {
              status: 'failed',
              error: {
                code: 'INTERRUPTED',
                message: 'Сервер перезапустился. Запустите проверку снова.',
              },
            },
          ],
        );
      }
      this.worker = worker;
    } catch (error) {
      worker.release(true);
      throw error;
    }
    // The reserved connection owns the worker lock. Stop work if the lock is lost.
    worker.on('error', this.workerLost);
    if (this.config.storage) {
      this.sweep();
      this.timer = setInterval(() => this.sweep(), 30_000);
      this.timer.unref();
    }
  }

  private workerLost = () => {
    const worker = this.worker;
    this.worker = undefined;
    worker?.release(true);
    this.active?.controller.abort();
    clearInterval(this.timer);
  };

  private sweep() {
    if (this.cleanup) return;
    this.cleanup = this.deleteObjects()
      .catch(() => undefined)
      .finally(() => {
        this.cleanup = undefined;
      });
  }

  private async deleteObjects() {
    const storage = this.config.storage;
    if (!storage) return;
    const { rows } = await this.pool.query<{ object_key: string }>(
      'SELECT object_key FROM screenshot_deletions ORDER BY created_at LIMIT 20',
    );
    for (const { object_key: key } of rows) {
      await storage.delete(key);
      await this.pool.query('DELETE FROM screenshot_deletions WHERE object_key = $1', [key]);
    }
  }

  async close() {
    clearInterval(this.timer);
    this.active?.controller.abort();
    await this.active?.done;
    await this.cleanup;
    await this.engine.close();
    const worker = this.worker;
    this.worker = undefined;
    if (worker) {
      worker.off('error', this.workerLost);
      // End the dedicated session so PostgreSQL releases the advisory lock.
      worker.release(true);
    }
    this.config.storage?.close();
  }

  private assertTarget(project: ProjectRow) {
    if (!this.worker)
      throw new InputError('Браузерный runner не настроен.', 'RUNNER_UNAVAILABLE', 503);
    if (this.config.demoOnly && !project.is_demo)
      throw new InputError(
        'Публичный runner запускает проверки только на демостенде.',
        'TARGET_NOT_ALLOWED',
        403,
      );
    this.policy.assert(project.settings.frontendUrl);
  }

  private async persist(table: Table, state: Operation) {
    await this.pool.query(`UPDATE ${table} SET state = $2 WHERE id = $1`, [state.id, state]);
  }

  private async submit<T extends Operation>(
    table: Table,
    prepare: (id: string) => Promise<Work<T>>,
  ): Promise<T> {
    if (this.active)
      throw new InputError(
        'Runner занят. Повторите попытку после завершения текущей проверки.',
        'RUNNER_BUSY',
        409,
      );
    const active: NonNullable<WorkspaceExecutions['active']> = {
      id: randomUUID(),
      controller: new AbortController(),
    };
    this.active = active;
    try {
      const { state, work } = await prepare(active.id);
      const initial = structuredClone(state);
      const timeout = setTimeout(
        () => active.controller.abort('timeout'),
        table === 'runs' ? 240_000 : 75_000,
      );
      timeout.unref();
      active.done = (async () => {
        try {
          await work(active.controller.signal);
          active.controller.signal.throwIfAborted();
          state.status = 'completed';
        } catch {
          const timedOut = active.controller.signal.reason === 'timeout';
          state.status = active.controller.signal.aborted && !timedOut ? 'cancelled' : 'failed';
          if (state.status === 'failed') {
            state.error = timedOut
              ? { code: 'RUN_TIMEOUT', message: 'Превышено время браузерной проверки.' }
              : {
                  code: 'EXECUTION_FAILED',
                  message:
                    'Браузерная проверка завершилась ошибкой. Проверьте настройки и повторите запуск.',
                };
          }
        } finally {
          clearTimeout(timeout);
          try {
            await this.persist(table, state);
          } finally {
            if (this.active === active) this.active = undefined;
            this.sweep();
          }
        }
      })().catch(() => console.error('Failed to persist final FaultView operation status.'));
      return initial;
    } catch (error) {
      if (this.active === active) this.active = undefined;
      throw error;
    }
  }

  discover(userId: string, projectId: string) {
    return this.submit('discoveries', (id) =>
      transaction(this.pool, async (client) => {
        const row = await ownedProject(client, userId, projectId, true);
        const { settings } = row;
        this.assertTarget(row);
        await assertIdle(client, projectId);
        const catalog = await parseSpecification(settings.specification, settings.frontendUrl);
        const maxPages = this.config.demoOnly ? Math.min(settings.maxPages, 4) : settings.maxPages;
        const state: Job = {
          id,
          source: 'playwright',
          status: 'running',
          createdAt: new Date().toISOString(),
          progress: { completed: 0, discovered: 1 },
        };
        await client.query(
          'INSERT INTO discoveries (id, project_id, revision, state) VALUES ($1, $2, $3, $4)',
          [id, projectId, row.revision, state],
        );
        await client.query(
          `DELETE FROM discoveries WHERE id IN (
            SELECT id FROM discoveries WHERE project_id = $1 ORDER BY created_at DESC, id OFFSET 20
          )`,
          [projectId],
        );
        return {
          state,
          work: async (signal) => {
            state.graph = await this.engine.discover(
              { frontendUrl: settings.frontendUrl, maxPages, catalog },
              signal,
              async (progress) => {
                state.progress = progress;
                await this.persist('discoveries', state);
              },
            );
            if (state.graph.routes.every((route) => route.status === 'error'))
              throw new InputError(
                'Демостенд или приложение недоступно.',
                'TARGET_UNAVAILABLE',
                422,
              );
          },
        };
      }),
    );
  }

  execute(userId: string, projectId: string, plan: PlanInput) {
    return this.submit('runs', (id) =>
      transaction(this.pool, async (client) => {
        const row = await ownedProject(client, userId, projectId, true);
        this.assertTarget(row);
        const storage = this.config.storage;
        if (!storage)
          throw new InputError(
            'Хранилище скриншотов не настроено.',
            'SCREENSHOTS_UNAVAILABLE',
            503,
          );
        await assertIdle(client, projectId);
        const { graph, input, result } = await preparePlan(client, row, plan);
        const problem = planExecutionProblem(result);
        if (problem) throw new InputError(problem.message, problem.code);
        if (this.config.demoOnly && result.cases.length > 24)
          throw new InputError(
            'Для публичного runner выберите до 24 проверок в одном прогоне.',
            'CASE_LIMIT',
            400,
          );
        for (const route of graph.routes) this.policy.assert(route.url);
        const state: TestRun = {
          id,
          source: 'playwright',
          status: 'running',
          createdAt: new Date().toISOString(),
          plan: input,
          checks: row.settings.checks ?? defaultChecks,
          progress: { completed: 0, total: result.cases.length },
          results: [],
          warnings: [...graph.warnings, ...result.warnings],
        };
        await client.query('INSERT INTO runs (id, project_id, state) VALUES ($1, $2, $3)', [
          id,
          projectId,
          state,
        ]);
        await client.query(
          `DELETE FROM runs WHERE id IN (SELECT id FROM runs WHERE project_id = $1 ORDER BY created_at DESC, id OFFSET 5)`,
          [projectId],
        );
        const usage = await client.query<{ bytes: number }>(
          `SELECT COALESCE(sum(s.bytes),0)::integer AS bytes FROM screenshots s
         JOIN runs r ON s.run_id = r.id JOIN projects p ON p.id = r.project_id WHERE p.owner_id = $1`,
          [userId],
        );
        let remaining = Math.max(0, Math.min(8_000_000, 64_000_000 - (usage.rows[0]?.bytes ?? 0)));
        const imageWarning = (message: string) => {
          if (!state.warnings.includes(message)) state.warnings.push(message);
        };
        return {
          state,
          work: async (signal) => {
            await this.engine.execute(
              graph,
              input,
              state.checks!,
              signal,
              async (name, image) => {
                signal.throwIfAborted();
                if (!image.length || image.length > imageLimit || image.length > remaining) {
                  imageWarning('Достигнут лимит размера скриншотов.');
                  return false;
                }
                screenshotName.parse(name);
                const key = `faultview/${userId}/${projectId}/${id}/${name}.jpg`;
                await this.pool.query(
                  'INSERT INTO screenshots (run_id, name, object_key, bytes) VALUES ($1, $2, $3, $4)',
                  [id, name, key, image.length],
                );
                remaining -= image.length;
                try {
                  await storage.put(key, image, signal);
                  await this.pool.query(
                    'UPDATE screenshots SET ready = true WHERE run_id = $1 AND name = $2',
                    [id, name],
                  );
                  return true;
                } catch {
                  imageWarning('Часть снимков недоступна из-за ошибки хранилища.');
                  return false;
                }
              },
              async (item) => {
                state.results.push(item);
                state.progress.completed = state.results.length;
                await this.persist('runs', state);
              },
            );
          },
        };
      }),
    );
  }

  async cancel(id: string) {
    const active = this.active;
    if (active?.id !== id) return;
    active.controller.abort();
    await active.done;
  }

  async screenshot(projectId: string, runId: string, name: string) {
    const { rows } = await this.pool.query<{ object_key: string }>(
      `SELECT s.object_key FROM screenshots s JOIN runs r ON s.run_id = r.id
       WHERE r.project_id = $1 AND r.id = $2 AND s.name = $3 AND s.ready`,
      [projectId, runId, name],
    );
    if (!rows[0]) throw notFound();
    if (!this.config.storage)
      throw new InputError('Хранилище скриншотов не настроено.', 'SCREENSHOTS_UNAVAILABLE', 503);
    return this.config.storage.get(rows[0].object_key);
  }
}
