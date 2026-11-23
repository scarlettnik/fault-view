import type { Pool, PoolClient } from 'pg';
import type {
  Graph,
  Job,
  PlanInput,
  SavedPlan,
  TestRun,
} from '../../../frontend/src/core/model.ts';
import { buildPlan } from '../../../frontend/src/core/cascade.ts';
import { InputError, notFound } from '../types.js';
import type { ProjectRow } from './projects.js';

type Db = Pool | PoolClient;
type Table = 'discoveries' | 'plans' | 'runs';

export async function readRecord<T>(db: Db, table: Table, projectId: string, id: string) {
  const result = await db.query<{ state: T; revision?: number }>(
    `SELECT state, ${table === 'runs' ? 'NULL AS revision' : 'revision'} FROM ${table} WHERE project_id = $1 AND id = $2`,
    [projectId, id],
  );
  if (!result.rows[0]) throw notFound();
  return result.rows[0];
}

export async function readHistory(db: Db, project: ProjectRow) {
  const jobs = await db.query<{ state: Job }>(
    'SELECT state FROM discoveries WHERE project_id = $1 AND revision = $2 ORDER BY created_at DESC, id LIMIT 20',
    [project.id, project.revision],
  );
  const plans = await db.query<{ state: SavedPlan }>(
    'SELECT state FROM plans WHERE project_id = $1 AND revision = $2 ORDER BY created_at DESC, id LIMIT 20',
    [project.id, project.revision],
  );
  const runs = await db.query<{ state: TestRun; failure_count: number; warning_count: number }>(
    `SELECT state || '{"results":[]}'::jsonb AS state,
        jsonb_array_length(jsonb_path_query_array(state, '$.results[*] ? (@.verdict == "FAIL")')) AS failure_count,
        jsonb_array_length(jsonb_path_query_array(state, '$.results[*] ? (@.verdict == "WARN")')) AS warning_count
       FROM runs WHERE project_id = $1 ORDER BY created_at DESC, id LIMIT 5`,
    [project.id],
  );
  return {
    jobs: jobs.rows.map((row) => row.state),
    plans: plans.rows.map((row) => row.state),
    runs: runs.rows.map((row) => ({
      ...row.state,
      summary: { failures: row.failure_count, warnings: row.warning_count },
    })),
  };
}

export async function preparePlan(
  db: Db,
  project: ProjectRow,
  input: PlanInput,
): Promise<{ graph: Graph; input: PlanInput; result: ReturnType<typeof buildPlan> }> {
  const { state, revision } = await readRecord<Job>(
    db,
    'discoveries',
    project.id,
    input.discoveryId,
  );
  if (revision !== project.revision || state.status !== 'completed' || !state.graph)
    throw new InputError('Постройте граф для текущих настроек проекта.', 'GRAPH_NOT_READY', 409);
  const effective = {
    ...input,
    excludedRouteIds: [
      ...new Set([...project.settings.excludedRouteIds, ...input.excludedRouteIds]),
    ],
  };
  return { graph: state.graph, input: effective, result: buildPlan(state.graph, effective) };
}
