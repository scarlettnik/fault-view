import { describe, expect, it } from 'vitest';
import { projectInputSchema, workspaceSchema } from './model';
import {
  workspaceReducer,
  projectSaved,
  projectRemoved,
  jobReceived,
  routeExcluded,
} from '../store/workspace';

const input = {
  name: 'Shop',
  description: '',
  frontendUrl: 'http://127.0.0.1:4400',
  specification: '{"openapi":"3.0.3"}',
  specificationName: 'openapi.json',
  maxPages: 10,
};

describe('project validation and persisted workspace', () => {
  it('requires a valid HTTP URL, specification, name and page limit', () => {
    expect(projectInputSchema.safeParse(input).success).toBe(true);
    for (const change of [
      { name: '' },
      { frontendUrl: 'javascript:alert(1)' },
      { frontendUrl: 'http://user:secret@test.local' },
      { specification: '' },
      { maxPages: 21 },
    ]) {
      expect(projectInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
    }
    expect(workspaceSchema.safeParse({ projects: 'corrupt' }).success).toBe(false);
  });
  it('preserves project settings, latest graph and exclusions; deletes project history', () => {
    const project = {
      ...input,
      id: 'p1',
      createdAt: '2026-11-13T00:00:00Z',
      jobs: [],
      excludedRouteIds: [],
      plans: [],
    };
    let state = workspaceReducer(undefined, projectSaved(project));
    state = workspaceReducer(
      state,
      jobReceived({
        projectId: 'p1',
        job: {
          id: 'job',
          status: 'completed',
          createdAt: project.createdAt,
          progress: { completed: 1, discovered: 1 },
        },
      }),
    );
    state = workspaceReducer(state, routeExcluded({ projectId: 'p1', routeId: '/products' }));
    state = workspaceReducer(state, routeExcluded({ projectId: 'p1', routeId: '/products' }));
    expect(state.projects[0]?.excludedRouteIds).toEqual(['/products']);
    expect(state.projects[0]?.jobs).toHaveLength(1);
    state = workspaceReducer(state, projectRemoved('p1'));
    expect(state.projects).toEqual([]);
  });
});
