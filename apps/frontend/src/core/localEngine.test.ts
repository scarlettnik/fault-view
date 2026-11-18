import { describe, expect, it } from 'vitest';
import { createLocalGraph, parseLocalSpecification, simulateCase } from './localEngine';
import { exampleSpecification } from './examples';

describe('local specification and simulation', () => {
  it('validates JSON and YAML without resolving external references', () => {
    expect(parseLocalSpecification(exampleSpecification).endpoints.length).toBeGreaterThan(2);
    expect(
      parseLocalSpecification(
        'openapi: 3.0.3\ninfo: {title: Test, version: "1"}\npaths: {/items: {get: {responses: {"200": {description: OK}}}}}',
      ).endpoints[0]?.id,
    ).toBe('GET /items');
    expect(() => parseLocalSpecification('{"openapi":"3.0.3"}')).toThrow();
    expect(() =>
      parseLocalSpecification(
        exampleSpecification.replace(
          '"paths":',
          '"x-ref": {"$ref":"https://example.com/private"}, "paths":',
        ),
      ),
    ).toThrow(/внешн/i);
  });
  it('labels sample dependencies and does not claim to have opened external pages', () => {
    const graph = createLocalGraph(exampleSpecification, 10);
    expect(graph.coverage.scope).toBe('local-simulation');
    expect(graph.routeDependencies.every((edge) => edge.provenance === 'local-fixture')).toBe(true);
    expect(graph.routes.map((route) => route.id)).toContain('/products');
    expect(graph.warnings.join(' ')).toMatch(/симуляц/i);
  });
  it('marks simulated outcomes explicitly and distinguishes healthy, fallback, failure and recovery', () => {
    const fixture = {
      routeId: '/products',
      endpointId: 'GET /api/products',
      basis: 'local-fixture' as const,
    };
    expect(simulateCase({ ...fixture, profile: 'healthy' }, '1').verdict).toBe('PASS');
    expect(simulateCase({ ...fixture, profile: 'http500' }, '2').verdict).toBe('WARN');
    expect(simulateCase({ ...fixture, profile: 'timeout' }, '3').verdict).toBe('FAIL');
    expect(simulateCase({ ...fixture, profile: 'recovery' }, '4').recovered).toBe(true);
    expect(simulateCase({ ...fixture, profile: 'healthy' }, '5').source).toBe('simulation');
  });
});
it('preserves declared operation links and warns about unresolved targets', () => {
  const spec = JSON.parse(exampleSpecification);
  spec.paths['/api/products'].get.responses['200'].links = {
    cart: { operationId: 'cart' },
    profile: { operationRef: '#/paths/~1api~1profile/get' },
    missing: { operationId: 'absent' },
  };
  const graph = createLocalGraph(JSON.stringify(spec), 10);
  expect(graph.operationLinks.map((link) => link.target)).toEqual([
    'GET /api/cart',
    'GET /api/profile',
  ]);
  expect(graph.warnings.join(' ')).toContain('absent');
});
it('counts only pages present in the scenario and validates operation responses', () => {
  const spec = JSON.parse(exampleSpecification);
  spec.paths = { '/api/products': spec.paths['/api/products'] };
  const graph = createLocalGraph(JSON.stringify(spec), 10);
  expect(graph.coverage).toMatchObject({ visitedPages: 1, pendingPages: 0, complete: true });
  delete spec.paths['/api/products'].get.responses;
  expect(() => parseLocalSpecification(JSON.stringify(spec))).toThrow('responses');
});
