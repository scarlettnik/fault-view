import { beforeEach, expect, it, vi } from 'vitest';
import { createStore } from './index';
import { createExampleProject } from '../core/examples';
import { discoverProject, executePlan } from './operations';
import { projectSaved } from './workspace';
import { allProfiles } from '../core/model';

beforeEach(() => localStorage.clear());
it('runs async pending → fulfilled with local progress, persists results, and never fetches', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'));
  const store = createStore();
  const project = createExampleProject();
  store.dispatch(projectSaved(project));
  const action = store.dispatch(discoverProject(project.id));
  expect(store.getState().operations.status).toBe('loading');
  const job = await action.unwrap();
  expect(store.getState().operations.status).toBe('succeeded');
  const run = await store
    .dispatch(
      executePlan({
        projectId: project.id,
        plan: {
          discoveryId: job.id,
          mode: 'route',
          targetId: '/products',
          excludedRouteIds: [],
          profiles: allProfiles,
        },
      }),
    )
    .unwrap();
  expect(run.status).toBe('completed');
  expect(run.results.length).toBeGreaterThan(7);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(createStore().getState().workspace.projects[0]?.runs?.[0]?.id).toBe(run.id);
});
it('reports rejected operations and cancellation, releasing the busy state', async () => {
  const store = createStore();
  await expect(store.dispatch(discoverProject('missing')).unwrap()).rejects.toBeDefined();
  expect(store.getState().operations.status).toBe('failed');
  const project = createExampleProject();
  store.dispatch(projectSaved(project));
  const task = store.dispatch(discoverProject(project.id));
  task.abort();
  await task;
  expect(store.getState().workspace.active).toBeUndefined();
  expect(store.getState().workspace.projects[0]?.jobs[0]?.status).toBe('cancelled');
});
it('retains corrupt storage instead of silently replacing it', () => {
  localStorage.setItem('faultview.workspace.v2', 'broken');
  expect(createStore().getState().workspace.storageError).toBe(true);
  expect(localStorage.getItem('faultview.workspace.v2')).toBe('broken');
});
it('shows write failures and retains current data in memory', () => {
  const store = createStore();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError');
  });
  store.dispatch(projectSaved(createExampleProject()));
  expect(store.getState().workspace.storageError).toBe(true);
  expect(store.getState().workspace.projects).toHaveLength(1);
});
it('marks interrupted work cancelled when loading the workspace', () => {
  const store = createStore();
  const project = createExampleProject();
  project.jobs = [
    {
      id: 'interrupted',
      status: 'running',
      createdAt: project.createdAt,
      progress: { completed: 0, discovered: 3 },
    },
  ];
  store.dispatch(projectSaved(project));
  const reloaded = createStore();
  expect(reloaded.getState().workspace.projects[0]?.jobs[0]?.status).toBe('cancelled');
  expect(reloaded.getState().workspace.active).toBeUndefined();
});
