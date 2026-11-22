import { createAction, createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { z } from 'zod';
import { apiFetch, ApiError, projectPath } from '../core/workspaceApi';
import {
  projectSchema,
  projectSummarySchema,
  runSchema,
  savedPlanSchema,
  type PlanInput,
  type Project,
  type ProjectInput,
  type ProjectSummary,
  type UiChecks,
} from '../core/model';
import { runComparisonSchema } from '../core/comparison';

const userSchema = z.object({ id: z.uuid(), email: z.email() });
const capabilitiesSchema = z.object({ demo: z.boolean(), demoOnly: z.boolean() });
type User = z.infer<typeof userSchema>;
export interface ServerState {
  user: User | null;
  auth: 'idle' | 'loading' | 'ready' | 'error';
  authError?: string;
  capabilities?: z.infer<typeof capabilitiesSchema>;
  projects: ProjectSummary[];
  list: 'idle' | 'loading' | 'ready' | 'error';
  listError?: string;
  listRequest?: string;
}
type State = { server: ServerState; workspace: { projects: Project[] } };
type Credentials = { email: string; password: string };
type Settings = ProjectInput & { checks?: UiChecks; excludedRouteIds?: string[] };
const initial = (): ServerState => ({ user: null, auth: 'idle', projects: [], list: 'idle' });
export const sessionExpired = createAction('server/sessionExpired');
const thunk = createAsyncThunk.withTypes<{ state: State }>();

export const checkSession = thunk(
  'server/checkSession',
  async (_: void, { signal }) => {
    return apiFetch('auth/session', userSchema, { signal }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    });
  },
  { condition: (_, { getState }) => getState().server.auth !== 'loading' },
);

const signedIn = createAction<User>('server/signedIn');

export function authenticate(mode: 'login' | 'register', credentials: Credentials) {
  // Keep the password in the thunk closure. Redux actions and DevTools only see the user.
  return thunk('server/authenticate', async (_: void, { dispatch, signal }) => {
    const user = await apiFetch('auth/' + mode, userSchema, {
      method: 'POST',
      body: credentials,
      signal,
    });
    dispatch(signedIn(user));
  })();
}

export const signOut = thunk('server/signOut', async (_: void, { signal }) =>
  apiFetch('auth/logout', z.undefined(), { method: 'POST', signal }),
);

export const loadCapabilities = thunk('server/loadCapabilities', async (_: void, { signal }) =>
  apiFetch('capabilities', capabilitiesSchema, { signal }),
);

type SessionAction = ReturnType<typeof sessionExpired>;
type RequestScope = {
  getState: () => { server: ServerState };
  dispatch: (action: SessionAction) => unknown;
  signal: AbortSignal;
};

export async function workspaceRequest<T>(
  scope: RequestScope,
  path: string,
  schema: z.ZodType<T>,
  options?: Parameters<typeof apiFetch>[2],
): Promise<T> {
  const sessionUser = scope.getState().server.user?.id;
  if (!sessionUser) throw new Error('Войдите в аккаунт, чтобы продолжить.');
  try {
    const value = await apiFetch(path, schema, { ...options, signal: scope.signal });
    if (scope.getState().server.user?.id !== sessionUser)
      throw new Error('Сессия изменилась. Повторите действие.');
    return value;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      scope.getState().server.user?.id === sessionUser
    )
      scope.dispatch(sessionExpired());
    throw error;
  }
}

export const loadProjects = thunk(
  'server/loadProjects',
  async (_: void, scope) => workspaceRequest(scope, 'projects', z.array(projectSummarySchema)),
  { condition: (_, { getState }) => getState().server.list !== 'loading' },
);

export const loadProject = thunk('server/loadProject', (id: string, scope) =>
  workspaceRequest(scope, projectPath(id), projectSchema),
);

export const createProject = thunk('server/createProject', (settings: Settings, scope) =>
  workspaceRequest(scope, 'projects', projectSchema, { method: 'POST', body: settings }),
);

export const openDemo = thunk('server/openDemo', (_: void, scope) =>
  workspaceRequest(scope, 'projects/demo', projectSchema, { method: 'POST' }),
);

export const updateProject = thunk(
  'server/updateProject',
  ({ id, settings }: { id: string; settings: Partial<Settings> }, scope) =>
    workspaceRequest(scope, projectPath(id), projectSchema, { method: 'PATCH', body: settings }),
);

export const deleteProject = thunk('server/deleteProject', async (id: string, scope) => {
  await workspaceRequest(scope, projectPath(id), z.undefined(), { method: 'DELETE' });
  return id;
});

export const saveServerPlan = thunk(
  'server/savePlan',
  async ({ projectId, input }: { projectId: string; input: PlanInput }, scope) => ({
    projectId,
    plan: await workspaceRequest(scope, projectPath(projectId) + '/plans', savedPlanSchema, {
      method: 'POST',
      body: input,
    }),
  }),
);

export const loadRun = thunk(
  'server/loadRun',
  ({ projectId, runId }: { projectId: string; runId: string }, scope) =>
    workspaceRequest(
      scope,
      projectPath(projectId) + '/runs/' + encodeURIComponent(runId),
      runSchema,
    ),
);

export const compareServerRuns = thunk(
  'server/compareRuns',
  (
    { projectId, baseline, candidate }: { projectId: string; baseline: string; candidate: string },
    scope,
  ) =>
    workspaceRequest(
      scope,
      projectPath(projectId) + '/runs/compare?' + new URLSearchParams({ baseline, candidate }),
      runComparisonSchema,
    ),
);

export const serverReducer = createSlice({
  name: 'server',
  initialState: initial(),
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(checkSession.pending, (state) => {
        state.auth = 'loading';
        state.authError = undefined;
      })
      .addCase(checkSession.fulfilled, (state, { payload }) => {
        state.user = payload;
        state.auth = 'ready';
      })
      .addCase(checkSession.rejected, (state, { error }) => {
        state.auth = 'error';
        state.authError = error.message;
      })
      .addCase(signedIn, (state, { payload }) => {
        state.user = payload;
      })
      .addCase(loadCapabilities.fulfilled, (state, { payload }) => {
        state.capabilities = payload;
      })
      .addCase(loadProjects.pending, (state, { meta }) => {
        state.list = 'loading';
        state.listError = undefined;
        state.listRequest = meta.requestId;
      })
      .addCase(loadProjects.fulfilled, (state, { payload, meta }) => {
        if (state.listRequest !== meta.requestId) return;
        state.projects = payload;
        state.list = 'ready';
      })
      .addCase(loadProjects.rejected, (state, { error, meta }) => {
        if (state.listRequest !== meta.requestId) return;
        state.list = 'error';
        state.listError = error.message;
      })
      .addCase(deleteProject.fulfilled, (state, { payload }) => {
        state.projects = state.projects.filter((project) => project.id !== payload);
      })
      .addCase(sessionExpired, (state) => ({
        ...initial(),
        auth: 'ready',
        capabilities: state.capabilities,
      }))
      .addCase(signOut.fulfilled, (state) => ({
        ...initial(),
        auth: 'ready',
        capabilities: state.capabilities,
      }));
  },
}).reducer;
