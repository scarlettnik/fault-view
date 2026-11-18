import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { createLocalGraph, simulateCase } from '../core/localEngine';
import { buildPlan, planExecutionProblem } from '../core/cascade';
import { latestDiscovery, type Job, type PlanInput, type TestRun } from '../core/model';
import { jobReceived, runReceived, type Workspace } from './workspace';

type State = { workspace: Workspace };
const controllers = new Map<string, AbortController>();
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new Error('Операция отменена.'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
function findProject(state: State, id: string) {
  const project = state.workspace.projects.find((project) => project.id === id);
  if (!project) throw new Error('Проект не найден.');
  return project;
}
export const discoverProject = createAsyncThunk<Job, string, { state: State }>(
  'operations/discover',
  async (projectId, api) => {
    const project = findProject(api.getState(), projectId);
    if (api.getState().workspace.active || api.getState().workspace.activeRun)
      throw new Error('Дождитесь завершения текущей операции.');
    let job: Job = {
      id: api.requestId,
      createdAt: new Date().toISOString(),
      status: 'running',
      progress: { completed: 0, discovered: project.maxPages },
    };
    const controller = new AbortController();
    const key = `discovery:${projectId}`;
    controllers.set(key, controller);
    const cancel = () => {
      controller.abort();
      api.dispatch(jobReceived({ projectId, job: { ...job, status: 'cancelled' } }));
    };
    api.signal.addEventListener('abort', cancel, { once: true });
    controller.signal.addEventListener(
      'abort',
      () => api.dispatch(jobReceived({ projectId, job: { ...job, status: 'cancelled' } })),
      { once: true },
    );
    api.dispatch(jobReceived({ projectId, job }));
    try {
      await wait(200, controller.signal);
      const graph = createLocalGraph(project.specification, project.maxPages);
      for (let i = 1; i <= graph.routes.length; i++) {
        await wait(100, controller.signal);
        job = { ...job, progress: { completed: i, discovered: graph.routes.length } };
        api.dispatch(jobReceived({ projectId, job: { ...job } }));
      }
      const completed: Job = { ...job, status: 'completed', graph };
      api.dispatch(jobReceived({ projectId, job: completed }));
      return completed;
    } catch (error) {
      const cancelled = controller.signal.aborted;
      api.dispatch(
        jobReceived({
          projectId,
          job: {
            ...job,
            status: cancelled ? 'cancelled' : 'failed',
            error: cancelled
              ? undefined
              : {
                  code: 'INVALID_SPECIFICATION',
                  message: error instanceof Error ? error.message : 'Не удалось построить граф.',
                },
          },
        }),
      );
      throw error;
    } finally {
      api.signal.removeEventListener('abort', cancel);
      controllers.delete(key);
    }
  },
);

export const prepareLocalPlan = createAsyncThunk(
  'operations/plan',
  async ({ projectId, input }: { projectId: string; input: PlanInput }, api) => {
    const project = findProject(api.getState() as State, projectId);
    const job =
      project.jobs.find((job) => job.id === input.discoveryId && job.graph) ??
      latestDiscovery(project);
    if (!job?.graph) throw new Error('Сначала постройте локальный граф.');
    const effective = {
      ...input,
      discoveryId: job.id,
      excludedRouteIds: [...new Set([...input.excludedRouteIds, ...project.excludedRouteIds])],
    };
    return { input: effective, result: buildPlan(job.graph, effective) };
  },
);
export const executePlan = createAsyncThunk<
  TestRun,
  { projectId: string; plan: PlanInput },
  { state: State }
>('operations/execute', async ({ projectId, plan }, api) => {
  const project = findProject(api.getState(), projectId);
  if (api.getState().workspace.active || api.getState().workspace.activeRun)
    throw new Error('Дождитесь завершения текущей операции.');
  const job = project.jobs.find((job) => job.id === plan.discoveryId && job.graph);
  if (!job?.graph) throw new Error('Граф не найден. Постройте его повторно.');
  const prepared = buildPlan(job.graph, plan);
  const problem = planExecutionProblem(prepared);
  if (problem) throw new Error(problem.message);
  let run: TestRun = {
    id: api.requestId,
    source: 'simulation',
    createdAt: new Date().toISOString(),
    status: 'running',
    plan,
    progress: { completed: 0, total: prepared.cases.length },
    results: [],
    warnings: [
      'Локальная симуляция: результаты заданы учебным сценарием, сетевые запросы не выполнялись.',
    ],
  };
  const controller = new AbortController();
  const key = `run:${projectId}`;
  controllers.set(key, controller);
  const cancel = () => {
    controller.abort();
  };
  api.signal.addEventListener('abort', cancel, { once: true });
  controller.signal.addEventListener(
    'abort',
    () =>
      api.dispatch(
        runReceived({ projectId, run: { ...run, status: 'cancelled', results: [...run.results] } }),
      ),
    { once: true },
  );
  api.dispatch(runReceived({ projectId, run }));
  try {
    for (const [index, test] of prepared.cases.entries()) {
      await wait(90, controller.signal);
      run = {
        ...run,
        results: [...run.results, simulateCase(test, String(index))],
        progress: { ...run.progress, completed: index + 1 },
      };
      api.dispatch(runReceived({ projectId, run: { ...run, results: [...run.results] } }));
    }
    const completed: TestRun = { ...run, status: 'completed', results: [...run.results] };
    api.dispatch(runReceived({ projectId, run: completed }));
    return completed;
  } catch (error) {
    api.dispatch(
      runReceived({
        projectId,
        run: {
          ...run,
          status: controller.signal.aborted ? 'cancelled' : 'failed',
          results: [...run.results],
        },
      }),
    );
    throw error;
  } finally {
    api.signal.removeEventListener('abort', cancel);
    controllers.delete(key);
  }
});
export const cancelOperation = createAsyncThunk(
  'operations/cancel',
  async ({ projectId, kind }: { projectId: string; kind: 'discovery' | 'run' }) => {
    controllers.get(`${kind}:${projectId}`)?.abort();
  },
);

const slice = createSlice({
  name: 'operations',
  initialState: {
    status: 'idle' as 'idle' | 'loading' | 'succeeded' | 'failed' | 'cancelled',
    error: '',
  },
  reducers: {},
  extraReducers: (builder) => {
    for (const thunk of [discoverProject, prepareLocalPlan, executePlan, cancelOperation]) {
      builder.addCase(thunk.pending, (state) => {
        state.status = 'loading';
        state.error = '';
      });
      builder.addCase(thunk.fulfilled, (state) => {
        state.status = 'succeeded';
      });
      builder.addCase(thunk.rejected, (state, action) => {
        state.status =
          action.meta.aborted || action.error.message?.includes('отменена')
            ? 'cancelled'
            : 'failed';
        state.error = action.error.message ?? 'Операция не выполнена.';
      });
    }
  },
});
export const operationsReducer = slice.reducer;
