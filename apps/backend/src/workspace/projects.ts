import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  checksSchema,
  projectInputSchema,
  type Project,
  type ProjectSummary,
} from '../../../frontend/src/core/model.ts';
import { parseSpecification } from '../openapi.js';
import { InputError, notFound } from '../types.js';
import type { createAuth } from './auth.js';
import { transaction } from './db.js';
import { readHistory } from './history.js';

const settingsFields = projectInputSchema
  .extend({
    description: projectInputSchema.shape.description.removeDefault(),
    checks: checksSchema.optional(),
    excludedRouteIds: z.array(z.string().max(4096)).max(20),
  })
  .strict();
const createSchema = settingsFields.extend({
  description: projectInputSchema.shape.description,
  excludedRouteIds: settingsFields.shape.excludedRouteIds.default([]),
});
const updateSchema = settingsFields
  .partial()
  .refine((settings) => Object.keys(settings).length > 0, 'Укажите хотя бы одно изменяемое поле.');
export type Settings = z.infer<typeof createSchema>;
export type ProjectRow = {
  id: string;
  owner_id: string;
  is_demo: boolean;
  revision: number;
  settings: Settings;
  created_at: Date;
};

export async function ownedProject(db: Pool | PoolClient, owner: string, id: string, lock = false) {
  const result = await db.query<ProjectRow>(
    'SELECT id, owner_id, is_demo, revision, settings, created_at FROM projects WHERE owner_id = $1 AND id = $2' +
      (lock ? ' FOR UPDATE' : ''),
    [owner, id],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return row;
}

async function toProject(db: Pool | PoolClient, row: ProjectRow): Promise<Project> {
  return {
    ...row.settings,
    id: row.id,
    createdAt: row.created_at.toISOString(),
    isDemo: row.is_demo,
    ...(await readHistory(db, row)),
  };
}

export async function assertIdle(db: PoolClient, id: string) {
  const { rows } = await db.query<{ busy: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM discoveries WHERE project_id = $1 AND state->>'status' = 'running')
      OR EXISTS (SELECT 1 FROM runs WHERE project_id = $1 AND state->>'status' = 'running') AS busy`,
    [id],
  );
  if (rows[0]?.busy)
    throw new InputError('Дождитесь завершения проверки или отмените её.', 'PROJECT_BUSY', 409);
}

async function insertProject(pool: Pool, userId: string, settings: Settings, demo = false) {
  return transaction(pool, async (client) => {
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (demo) {
      const existing = await client.query<ProjectRow>(
        'SELECT * FROM projects WHERE owner_id = $1 AND is_demo',
        [userId],
      );
      if (existing.rows[0]) return { row: existing.rows[0], created: false };
    }
    const count = await client.query<{ total: number }>(
      'SELECT count(*)::integer AS total FROM projects WHERE owner_id = $1',
      [userId],
    );
    if ((count.rows[0]?.total ?? 0) >= 30)
      throw new InputError('Можно сохранить до 30 проектов.', 'PROJECT_LIMIT', 409);
    const result = await client.query<ProjectRow>(
      'INSERT INTO projects (id, owner_id, settings, is_demo) VALUES ($1, $2, $3, $4) RETURNING *',
      [randomUUID(), userId, settings, demo],
    );
    return { row: result.rows[0]!, created: true };
  });
}

export function registerProjects(
  app: FastifyInstance,
  pool: Pool,
  auth: ReturnType<typeof createAuth>,
  demo?: Settings,
) {
  const settingsWriteLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  app.get('/api/v1/projects', async (request): Promise<ProjectSummary[]> => {
    const user = await auth.requireUser(request);
    const { rows } = await pool.query<
      Omit<ProjectRow, 'settings'> & {
        settings: Omit<Settings, 'specification'>;
        status: ProjectSummary['latestDiscoveryStatus'] | null;
      }
    >(
      `SELECT p.id, p.is_demo, p.settings - 'specification' AS settings, p.created_at,
        (SELECT d.state->>'status' FROM discoveries d WHERE d.project_id = p.id AND d.revision = p.revision
         ORDER BY d.created_at DESC, d.id LIMIT 1) AS status
       FROM projects p WHERE owner_id = $1 ORDER BY created_at DESC, id`,
      [user.id],
    );
    return rows.map((row) => ({
      ...row.settings,
      id: row.id,
      isDemo: row.is_demo,
      createdAt: row.created_at.toISOString(),
      latestDiscoveryStatus: row.status ?? undefined,
    }));
  });

  app.post('/api/v1/projects', settingsWriteLimit, async (request, reply) => {
    const user = await auth.requireUser(request);
    const settings = createSchema.parse(request.body);
    await parseSpecification(settings.specification, settings.frontendUrl);
    const { row } = await insertProject(pool, user.id, settings);
    return reply
      .header('Location', '/api/v1/projects/' + row.id)
      .code(201)
      .send(await toProject(pool, row));
  });

  app.post('/api/v1/projects/demo', async (request, reply) => {
    const user = await auth.requireUser(request);
    if (!demo) throw new InputError('Демостенд пока недоступен.', 'DEMO_UNAVAILABLE', 503);
    const { row, created } = await insertProject(pool, user.id, demo, true);
    return reply
      .header('Location', '/api/v1/projects/' + row.id)
      .code(created ? 201 : 200)
      .send(await toProject(pool, row));
  });

  app.get<{ Params: { projectId: string } }>('/api/v1/projects/:projectId', async (request) => {
    const user = await auth.requireUser(request);
    const id = z.uuid().parse(request.params.projectId);
    return toProject(pool, await ownedProject(pool, user.id, id));
  });

  app.patch<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId',
    settingsWriteLimit,
    async (request) => {
      const user = await auth.requireUser(request);
      const id = z.uuid().parse(request.params.projectId);
      const update = updateSchema.parse(request.body);
      return transaction(pool, async (client) => {
        const row = await ownedProject(client, user.id, id, true);
        await assertIdle(client, id);
        const settings = { ...row.settings, ...update };
        const changed =
          settings.specification !== row.settings.specification ||
          settings.frontendUrl !== row.settings.frontendUrl ||
          settings.maxPages !== row.settings.maxPages;
        if (changed) {
          if (row.is_demo)
            throw new InputError(
              'Параметры подключения демостенда фиксированы.',
              'DEMO_SETTINGS_FIXED',
              409,
            );
          await parseSpecification(settings.specification, settings.frontendUrl);
          settings.excludedRouteIds = [];
        }
        const result = await client.query<ProjectRow>(
          'UPDATE projects SET settings = $3, revision = revision + $4, updated_at = now() WHERE owner_id = $1 AND id = $2 RETURNING *',
          [user.id, id, settings, Number(changed)],
        );
        return toProject(client, result.rows[0]!);
      });
    },
  );

  app.delete<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId',
    async (request, reply) => {
      const user = await auth.requireUser(request);
      const id = z.uuid().parse(request.params.projectId);
      await transaction(pool, async (client) => {
        await ownedProject(client, user.id, id, true);
        await assertIdle(client, id);
        await client.query('DELETE FROM projects WHERE owner_id = $1 AND id = $2', [user.id, id]);
      });
      return reply.code(204).send();
    },
  );
}
