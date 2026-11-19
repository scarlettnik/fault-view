import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { createLocalGraph, simulateCase } from '../core/localEngine';
import { buildPlan, planExecutionProblem } from '../core/cascade';
import { latestDiscovery, type Job, type PlanInput, type TestRun } from '../core/model';
import { jobReceived, runReceived, type Workspace } from './workspace';
import {
  browserChecksEnabled,
  parseRemoteJob,
  parseRemoteRun,
  runnerRequest,
  runnerUrl,
} from '../core/runner';

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
      source: browserChecksEnabled ? 'playwright' : 'simulation',
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
    let remoteId: string | undefined;
    try {
      if (browserChecksEnabled) {
        let remote = parseRemoteJob(
          await runnerRequest('/discoveries', {
            method: 'POST',
            body: JSON.stringify(project),
            signal: controller.signal,
          }),
        );
        remoteId = remote.id;
        while (true) {
          job = { ...remote, id: api.requestId };
          api.dispatch(jobReceived({ projectId, job }));
          if (remote.status !== 'running' && remote.status !== 'queued') break;
          await wait(400, controller.signal);
          remote = parseRemoteJob(
            await runnerRequest(`/discoveries/${remoteId}`, { signal: controller.signal }),
          );
        }
        if (job.status === 'failed')
          throw new Error(job.error?.message ?? 'Не удалось обследовать страницы.');
        return job;
      }
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
      if (controller.signal.aborted && remoteId)
        await runnerRequest(`/discoveries/${remoteId}`, { method: 'DELETE' }).catch(
          () => undefined,
        );
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
  if (browserChecksEnabled && job.graph.coverage.scope !== 'public-linked-pages') {
    throw new Error(
      'Обновите граф проекта: для Playwright нужны страницы и запросы, найденные браузером.',
    );
  }
  if (!browserChecksEnabled && job.graph.coverage.scope === 'public-linked-pages') {
    throw new Error(
      'Этот граф построен Playwright. Откройте локальный проект через npm run dev:all для браузерной проверки.',
    );
  }
  let run: TestRun = {
    id: api.requestId,
    source: browserChecksEnabled ? 'playwright' : 'simulation',
    createdAt: new Date().toISOString(),
    status: 'running',
    plan,
    progress: { completed: 0, total: prepared.cases.length },
    results: [],
    warnings: browserChecksEnabled
      ? []
      : [
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
  let remoteId: string | undefined;
  try {
    if (browserChecksEnabled) {
      let remote = parseRemoteRun(
        await runnerRequest('/runs', {
          method: 'POST',
          body: JSON.stringify({ graph: job.graph, plan, checks: project.checks }),
          signal: controller.signal,
        }),
      );
      remoteId = remote.id;
      while (true) {
        run = { ...remote, id: api.requestId, remoteId, runnerUrl };
        api.dispatch(runReceived({ projectId, run }));
        if (remote.status !== 'running' && remote.status !== 'queued') break;
        await wait(400, controller.signal);
        remote = parseRemoteRun(
          await runnerRequest(`/runs/${remoteId}`, { signal: controller.signal }),
        );
      }
      if (run.status === 'failed')
        throw new Error(run.error?.message ?? 'Ошибка браузерной проверки.');
      return run;
    }
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
          error: controller.signal.aborted
            ? undefined
            : {
                code: 'RUN_FAILED',
                message: error instanceof Error ? error.message : 'Ошибка проверки.',
              },
        },
      }),
    );
    throw error;
  } finally {
    if (controller.signal.aborted && remoteId)
      await runnerRequest(`/runs/${remoteId}`, { method: 'DELETE' }).catch(() => undefined);
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
