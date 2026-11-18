import { expect, it } from 'vitest';
import { buildPlan } from './cascade';
import { createLocalGraph } from './localEngine';
import { exampleSpecification } from './examples';

it('traverses declared links in both directions, terminates cycles and deduplicates profiles', () => {
  const graph = createLocalGraph(exampleSpecification, 10);
  graph.operationLinks = [
    {
      source: 'GET /api/products',
      target: 'GET /api/cart',
      name: 'cart',
      provenance: 'openapi-link',
    },
    {
      source: 'GET /api/cart',
      target: 'GET /api/products',
      name: 'back',
      provenance: 'openapi-link',
    },
  ];
  const input = {
    discoveryId: 'local',
    mode: 'route' as const,
    targetId: '/products',
    excludedRouteIds: [],
    profiles: ['healthy' as const, 'healthy' as const],
  };
  const plan = buildPlan(graph, input);
  expect(plan.cases).toHaveLength(3);
  expect(plan.cases.find((item) => item.endpointId === 'GET /api/cart')?.basis).toBe(
    'declared-link',
  );
  const inverse = buildPlan(graph, { ...input, mode: 'endpoint', targetId: 'GET /api/cart' });
  expect(inverse.cases.map((item) => item.routeId)).toEqual(['/products', '/checkout']);
  expect(
    buildPlan(graph, {
      ...input,
      mode: 'endpoint',
      targetId: 'GET /api/cart',
      excludedRouteIds: ['/checkout'],
    }).cases,
  ).toHaveLength(1);
  expect(() => buildPlan(graph, { ...input, targetId: '/missing' })).toThrow('отсутствует');
});
