import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  checksSchema,
  projectInputSchema,
  type Project,
} from '../../../frontend/src/core/model.ts';
import { parseSpecification } from '../openapi.js';
import { InputError } from '../types.js';
import type { createAuth } from './auth.js';
import { transaction } from './db.js';

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
  revision: number;
  settings: Settings;
  created_at: Date;
};

export const notFound = () => new InputError('Ресурс не найден.', 'NOT_FOUND', 404);

export async function ownedProject(db: Pool | PoolClient, owner: string, id: string, lock = false) {
  const result = await db.query<ProjectRow>(
    'SELECT id, owner_id, revision, settings, created_at FROM projects WHERE owner_id = $1 AND id = $2' +
      (lock ? ' FOR UPDATE' : ''),
    [owner, id],
  );
  const row = result.rows[0];
  if (!row) throw notFound();
  return row;
}

function toProject(row: ProjectRow): Project {
  return {
    ...row.settings,
    id: row.id,
    createdAt: row.created_at.toISOString(),
    jobs: [],
    plans: [],
    runs: [],
  };
}

export function registerProjects(
  app: FastifyInstance,
  pool: Pool,
  auth: ReturnType<typeof createAuth>,
) {
  app.get('/api/v1/projects', async (request) => {
    const user = await auth.requireUser(request);
    const { rows } = await pool.query<ProjectRow>(
      'SELECT id, owner_id, revision, settings, created_at FROM projects WHERE owner_id = $1 ORDER BY created_at DESC, id',
      [user.id],
    );
    return rows.map(toProject);
  });

  app.post('/api/v1/projects', async (request, reply) => {
    const user = await auth.requireUser(request);
    const settings = createSchema.parse(request.body);
    await parseSpecification(settings.specification, settings.frontendUrl);
    const row = await transaction(pool, async (client) => {
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      const count = await client.query<{ total: number }>(
        'SELECT count(*)::integer AS total FROM projects WHERE owner_id = $1',
        [user.id],
      );
      if ((count.rows[0]?.total ?? 0) >= 30)
        throw new InputError('Можно сохранить до 30 проектов.', 'PROJECT_LIMIT', 409);
      const result = await client.query<ProjectRow>(
        'INSERT INTO projects (id, owner_id, settings) VALUES ($1, $2, $3) RETURNING *',
        [randomUUID(), user.id, settings],
      );
      return result.rows[0]!;
    });
    return reply
      .header('Location', '/api/v1/projects/' + row.id)
      .code(201)
      .send(toProject(row));
  });

  app.get<{ Params: { projectId: string } }>('/api/v1/projects/:projectId', async (request) => {
    const user = await auth.requireUser(request);
    const id = z.uuid().parse(request.params.projectId);
    return toProject(await ownedProject(pool, user.id, id));
  });

  app.patch<{ Params: { projectId: string } }>('/api/v1/projects/:projectId', async (request) => {
    const user = await auth.requireUser(request);
    const id = z.uuid().parse(request.params.projectId);
    const update = updateSchema.parse(request.body);
    return transaction(pool, async (client) => {
      const row = await ownedProject(client, user.id, id, true);
      const settings = { ...row.settings, ...update };
      const changed =
        settings.specification !== row.settings.specification ||
        settings.frontendUrl !== row.settings.frontendUrl ||
        settings.maxPages !== row.settings.maxPages;
      if (changed) {
        await parseSpecification(settings.specification, settings.frontendUrl);
        settings.excludedRouteIds = [];
      }
      const result = await client.query<ProjectRow>(
        'UPDATE projects SET settings = $3, revision = revision + $4, updated_at = now() WHERE owner_id = $1 AND id = $2 RETURNING *',
        [user.id, id, settings, Number(changed)],
      );
      return toProject(result.rows[0]!);
    });
  });

  app.delete<{ Params: { projectId: string } }>(
    '/api/v1/projects/:projectId',
    async (request, reply) => {
      const user = await auth.requireUser(request);
      const id = z.uuid().parse(request.params.projectId);
      const result = await pool.query('DELETE FROM projects WHERE owner_id = $1 AND id = $2', [
        user.id,
        id,
      ]);
      if (!result.rowCount) throw notFound();
      return reply.code(204).send();
    },
  );
}
