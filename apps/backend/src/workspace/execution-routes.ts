import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { compareRuns } from '../../../frontend/src/core/comparison.ts';
import {
  planInputSchema,
  profileSchema,
  type Job,
  type SavedPlan,
  type TestRun,
} from '../../../frontend/src/core/model.ts';
import { InputError } from '../types.js';
import type { createAuth } from './auth.js';
import { transaction } from './db.js';
import type { WorkspaceExecutions } from './executions.js';
import { preparePlan, readRecord } from './history.js';
import { assertIdle, ownedProject } from './projects.js';
import { screenshotName } from './screenshots.js';

const base = '/api/v1/projects/:projectId';
const id = z.uuid();
const planRequest = planInputSchema
  .extend({
    discoveryId: id,
    targetId: z.string().min(1).max(4096),
    profiles: z.array(profileSchema).min(1).max(7),
    excludedRouteIds: z.array(z.string().max(4096)).max(20),
  })
  .strict();
const compareRequest = z
  .strictObject({ baseline: id, candidate: id })
  .refine((input) => input.baseline !== input.candidate, 'Выберите два разных прогона.');
type ProjectParams = { projectId: string };
type JobParams = ProjectParams & { jobId: string };
type RunParams = ProjectParams & { runId: string };

export function registerExecutionRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: ReturnType<typeof createAuth>,
  execution: WorkspaceExecutions,
) {
  const expensive = { config: { rateLimit: { max: 12, timeWindow: '10 minutes' } } };
  async function project(request: FastifyRequest<{ Params: ProjectParams }>) {
    const user = await auth.requireUser(request);
    return ownedProject(pool, user.id, id.parse(request.params.projectId));
  }

  app.post<{ Params: ProjectParams }>(base + '/discoveries', expensive, async (request, reply) => {
    const row = await project(request);
    const record = await execution.discover(row.owner_id, row.id);
    return reply
      .header('Location', `/api/v1/projects/${row.id}/discoveries/${record.id}`)
      .code(202)
      .send(record);
  });

  app.get<{ Params: JobParams }>(base + '/discoveries/:jobId', async (request) => {
    const row = await project(request);
    return (await readRecord<Job>(pool, 'discoveries', row.id, id.parse(request.params.jobId)))
      .state;
  });

  app.post<{ Params: JobParams }>(base + '/discoveries/:jobId/cancel', async (request) => {
    const row = await project(request);
    const jobId = id.parse(request.params.jobId);
    await readRecord<Job>(pool, 'discoveries', row.id, jobId);
    await execution.cancel(jobId);
    return (await readRecord<Job>(pool, 'discoveries', row.id, jobId)).state;
  });

  app.post<{ Params: ProjectParams }>(base + '/plans/preview', async (request) => {
    const row = await project(request);
    const { input, result } = await preparePlan(pool, row, planRequest.parse(request.body));
    return { input, result };
  });

  app.post<{ Params: ProjectParams }>(base + '/plans', async (request, reply) => {
    const user = await auth.requireUser(request);
    const projectId = id.parse(request.params.projectId);
    const requested = planRequest.parse(request.body);
    const saved = await transaction(pool, async (client) => {
      const row = await ownedProject(client, user.id, projectId, true);
      await assertIdle(client, projectId);
      const { input, result } = await preparePlan(client, row, requested);
      const plan: SavedPlan = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        input,
        result,
      };
      await client.query(
        'INSERT INTO plans (id, project_id, revision, state) VALUES ($1, $2, $3, $4)',
        [plan.id, row.id, row.revision, plan],
      );
      await client.query(
        'DELETE FROM plans WHERE id IN (SELECT id FROM plans WHERE project_id = $1 ORDER BY created_at DESC, id OFFSET 20)',
        [row.id],
      );
      return plan;
    });
    return reply.code(201).send(saved);
  });

  app.post<{ Params: ProjectParams }>(base + '/runs', expensive, async (request, reply) => {
    const row = await project(request);
    const run = await execution.execute(row.owner_id, row.id, planRequest.parse(request.body));
    return reply
      .header('Location', `/api/v1/projects/${row.id}/runs/${run.id}`)
      .code(202)
      .send(run);
  });

  app.get<{ Params: ProjectParams }>(base + '/runs/compare', async (request) => {
    const row = await project(request);
    const { baseline, candidate } = compareRequest.parse(request.query);
    const [before, after] = await Promise.all([
      readRecord<TestRun>(pool, 'runs', row.id, baseline),
      readRecord<TestRun>(pool, 'runs', row.id, candidate),
    ]);
    if (before.state.status !== 'completed' || after.state.status !== 'completed')
      throw new InputError('Для сравнения выберите завершённые прогоны.', 'RUN_NOT_COMPLETE', 409);
    return compareRuns(before.state, after.state);
  });

  app.get<{ Params: RunParams }>(base + '/runs/:runId', async (request) => {
    const row = await project(request);
    return (await readRecord<TestRun>(pool, 'runs', row.id, id.parse(request.params.runId))).state;
  });

  app.post<{ Params: RunParams }>(base + '/runs/:runId/cancel', async (request) => {
    const row = await project(request);
    const runId = id.parse(request.params.runId);
    await readRecord<TestRun>(pool, 'runs', row.id, runId);
    await execution.cancel(runId);
    return (await readRecord<TestRun>(pool, 'runs', row.id, runId)).state;
  });

  app.get<{ Params: RunParams & { name: string } }>(
    base + '/runs/:runId/screenshots/:name',
    async (request, reply) => {
      const row = await project(request);
      const image = await execution.screenshot(
        row.id,
        id.parse(request.params.runId),
        screenshotName.parse(request.params.name),
      );
      return reply.type('image/jpeg').send(image);
    },
  );
}
