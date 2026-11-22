import { createSlice, isAnyOf, type PayloadAction } from '@reduxjs/toolkit';
import { isRunning, type Job, type Project, type SavedPlan, type TestRun } from '../core/model';
import {
  createProject,
  deleteProject,
  loadProject,
  openDemo,
  saveServerPlan,
  sessionExpired,
  signOut,
  updateProject,
} from './server';

export interface Workspace {
  executionMode?: 'live' | 'simulation';
  projects: Project[];
  importedExampleIds?: string[];
  active?: { projectId: string; jobId: string };
  activeRun?: { projectId: string; runId: string };
  storageError: boolean;
}
const initialState: Workspace = { projects: [], storageError: false };
function upsert(state: Workspace, project: Project) {
  const index = state.projects.findIndex((item) => item.id === project.id);
  if (index < 0) state.projects.unshift(project);
  else state.projects[index] = project;
}

const slice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    executionModeChanged(state, { payload }: PayloadAction<'live' | 'simulation'>) {
      state.executionMode = payload;
    },
    projectSaved(state, { payload }: PayloadAction<Project>) {
      upsert(state, payload);
    },
    projectRemoved(state, { payload }: PayloadAction<string>) {
      state.projects = state.projects.filter((project) => project.id !== payload);
      if (state.active?.projectId === payload) state.active = undefined;
      if (state.activeRun?.projectId === payload) state.activeRun = undefined;
    },
    jobReceived(state, { payload }: PayloadAction<{ projectId: string; job: Job }>) {
      const project = state.projects.find((item) => item.id === payload.projectId);
      if (!project) return;
      const index = project.jobs.findIndex((job) => job.id === payload.job.id);
      if (index < 0) project.jobs.unshift(payload.job);
      else project.jobs[index] = payload.job;
      project.jobs = project.jobs.slice(0, 20);
      if (isRunning(payload.job)) {
        if (state.active?.jobId !== payload.job.id || state.active.projectId !== project.id)
          state.active = { projectId: project.id, jobId: payload.job.id };
      } else if (state.active?.jobId === payload.job.id) state.active = undefined;
      if (payload.job.status === 'completed' && payload.job.graph) {
        const routes = payload.job.graph.routes.map((route) => route.id);
        project.excludedRouteIds = project.excludedRouteIds.filter((id) => routes.includes(id));
      }
    },
    routeExcluded(state, { payload }: PayloadAction<{ projectId: string; routeId: string }>) {
      const project = state.projects.find((item) => item.id === payload.projectId);
      if (project && !project.excludedRouteIds.includes(payload.routeId))
        project.excludedRouteIds.push(payload.routeId);
    },
    routeRestored(state, { payload }: PayloadAction<{ projectId: string; routeId: string }>) {
      const project = state.projects.find((item) => item.id === payload.projectId);
      if (project)
        project.excludedRouteIds = project.excludedRouteIds.filter((id) => id !== payload.routeId);
    },
    planSaved(state, { payload }: PayloadAction<{ projectId: string; plan: SavedPlan }>) {
      const project = state.projects.find((item) => item.id === payload.projectId);
      if (project) project.plans = [payload.plan, ...project.plans].slice(0, 20);
    },
    runReceived(state, { payload }: PayloadAction<{ projectId: string; run: TestRun }>) {
      const project = state.projects.find((item) => item.id === payload.projectId);
      if (!project) return;
      project.runs ??= [];
      const index = project.runs.findIndex((run) => run.id === payload.run.id);
      if (index < 0) project.runs.unshift(payload.run);
      else project.runs[index] = payload.run;
      project.runs = project.runs.slice(0, 5);
      if (payload.run.status === 'running' || payload.run.status === 'queued') {
        if (state.activeRun?.runId !== payload.run.id)
          state.activeRun = { projectId: project.id, runId: payload.run.id };
      } else if (state.activeRun?.runId === payload.run.id) state.activeRun = undefined;
    },
    trackingStopped(state) {
      state.active = undefined;
    },
    storageFailed(state, { payload }: PayloadAction<boolean>) {
      state.storageError = payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sessionExpired, () => initialState)
      .addCase(signOut.fulfilled, () => initialState)
      .addCase(deleteProject.fulfilled, (state, { payload }) => {
        state.projects = state.projects.filter((item) => item.id !== payload);
      })
      .addCase(saveServerPlan.fulfilled, (state, { payload }) => {
        const project = state.projects.find((item) => item.id === payload.projectId);
        if (project) project.plans = [payload.plan, ...project.plans].slice(0, 20);
      })
      .addMatcher(
        isAnyOf(
          loadProject.fulfilled,
          createProject.fulfilled,
          openDemo.fulfilled,
          updateProject.fulfilled,
        ),
        (state, { payload }) => {
          upsert(state, payload);
          const running = payload.jobs.find(isRunning);
          const run = payload.runs?.find(
            (value) => value.status === 'running' || value.status === 'queued',
          );
          if (running) state.active = { projectId: payload.id, jobId: running.id };
          else if (state.active?.projectId === payload.id) state.active = undefined;
          if (run) state.activeRun = { projectId: payload.id, runId: run.id };
          else if (state.activeRun?.projectId === payload.id) state.activeRun = undefined;
        },
      );
  },
});
export const {
  executionModeChanged,
  projectSaved,
  projectRemoved,
  jobReceived,
  routeExcluded,
  routeRestored,
  planSaved,
  runReceived,
  trackingStopped,
  storageFailed,
} = slice.actions;
export const workspaceReducer = slice.reducer;
