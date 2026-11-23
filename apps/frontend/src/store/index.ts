import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { workspaceSchema, type Project } from '../core/model';
import { workspaceReducer, storageFailed, type Workspace } from './workspace';
import { operationsReducer } from './operations';
import { serverReducer } from './server';
import { serverMode } from '../core/workspaceApi';

export const storageKey = 'faultview.workspace.v2';
function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(storageKey);
    const stored = workspaceSchema.parse(raw ? JSON.parse(raw) : { version: 2, projects: [] });
    // A reload interrupts local timers; pending work must not remain permanently busy.
    const projects: Project[] = stored.projects.map((project) => ({
      ...project,
      jobs: project.jobs.map((job) =>
        ['queued', 'running'].includes(job.status) ? { ...job, status: 'cancelled' as const } : job,
      ),
      runs: project.runs?.map((run) =>
        ['queued', 'running'].includes(run.status) ? { ...run, status: 'cancelled' as const } : run,
      ),
    }));
    return { projects, executionMode: stored.executionMode, storageError: false };
  } catch {
    return { projects: [], executionMode: 'live', storageError: true };
  }
}
export function createStore(preloaded?: Workspace) {
  const initial =
    preloaded ?? (serverMode ? { projects: [], storageError: false } : loadWorkspace());
  const protectedStorage = initial.storageError;
  const result = configureStore({
    reducer: { workspace: workspaceReducer, operations: operationsReducer, server: serverReducer },
    preloadedState: { workspace: initial },
  });
  if (serverMode) return result;
  let previous = result.getState().workspace;
  result.subscribe(() => {
    const state = result.getState().workspace;
    if (state === previous || protectedStorage) return;
    previous = state;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 2,
          projects: state.projects,
          executionMode: state.executionMode ?? 'live',
        }),
      );
    } catch {
      if (!state.storageError) result.dispatch(storageFailed(true));
    }
  });
  return result;
}
export const store = createStore();
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
