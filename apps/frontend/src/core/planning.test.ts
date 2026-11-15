import { expect, it } from 'vitest';
import { previewPlan } from './planning';
import { allProfiles, type Graph, type PlanInput } from './model';

const graph: Graph = {
  title: 'test',
  routes: [{ id: '/', url: 'http://localhost/', status: 'visited' }],
  endpoints: ['/api/unused', '/api/items'].map((path) => ({
    id: `GET ${path}`,
    method: 'GET',
    path,
    servers: ['http://localhost'],
  })),
  routeDependencies: [{ routeId: '/', endpointId: 'GET /api/items', provenance: 'local-fixture' }],
  operationLinks: [],
  warnings: [],
  coverage: {
    visitedPages: 1,
    pendingPages: 0,
    maxPages: 20,
    complete: true,
    scope: 'local-simulation',
  },
};
const input: PlanInput = {
  discoveryId: 'fixture',
  mode: 'endpoint',
  targetId: 'GET /api/items',
  excludedRouteIds: [],
  profiles: [...allProfiles],
};

it('shows zero observed dependencies separately from capacity errors', () => {
  const unused = previewPlan(graph, { ...input, targetId: 'GET /api/unused' });
  expect(unused.count).toBe(0);
  expect(unused.problem?.code).toBe('EMPTY_PLAN');
  expect(unused.problem?.message).toContain('Наличие API в OpenAPI');
  expect(unused.problem?.message).not.toMatch(/Сократите|100/);
  expect(previewPlan(graph, { ...input, excludedRouteIds: ['/'] }).problem?.code).toBe(
    'EMPTY_PLAN',
  );
  expect(previewPlan(graph, { ...input, profiles: [] }).problem?.code).toBe('NO_PROFILES');
  expect(previewPlan(graph, input)).toEqual({ count: 7, pairs: 1, problem: undefined });
});

it('counts the actual cascade and immediately recalculates capacity when profiles or exclusions change', () => {
  const large: Graph = {
    ...graph,
    routes: Array.from({ length: 15 }, (_, i) => ({
      id: `/${i}`,
      url: `http://localhost/${i}`,
      status: 'visited' as const,
    })),
    routeDependencies: Array.from({ length: 15 }, (_, i) => ({
      routeId: `/${i}`,
      endpointId: 'GET /api/items',
      provenance: 'local-fixture' as const,
    })),
  };
  const oversized = previewPlan(large, input);
  expect(oversized.count).toBe(105);
  expect(oversized.problem?.code).toBe('PLAN_TOO_LARGE');
  expect(oversized.problem?.message).toContain('15 пар «страница → API» × 7 профилей');
  expect(previewPlan(large, { ...input, profiles: allProfiles.slice(0, 6) })).toEqual({
    count: 90,
    pairs: 15,
    problem: undefined,
  });
  expect(previewPlan(large, { ...input, excludedRouteIds: ['/0'] })).toEqual({
    count: 98,
    pairs: 14,
    problem: undefined,
  });
  const boundary: Graph = {
    ...large,
    routes: Array.from({ length: 100 }, (_, i) => ({
      id: `/${i}`,
      url: `http://localhost/${i}`,
      status: 'visited' as const,
    })),
    routeDependencies: Array.from({ length: 100 }, (_, i) => ({
      routeId: `/${i}`,
      endpointId: 'GET /api/items',
      provenance: 'local-fixture' as const,
    })),
  };
  expect(previewPlan(boundary, { ...input, profiles: ['healthy'] })).toEqual({
    count: 100,
    pairs: 100,
    problem: undefined,
  });
});
