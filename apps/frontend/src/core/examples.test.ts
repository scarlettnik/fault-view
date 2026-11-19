import { expect, it } from 'vitest';
import { createExampleProject, exampleProjects } from './examples';
import { createLocalGraph, parseLocalSpecification } from './localEngine';
it('creates an independent local example with a valid bundled specification', () => {
  const first = createExampleProject();
  const second = createExampleProject();
  first.excludedRouteIds.push('/products');
  expect(second.excludedRouteIds).toEqual([]);
  expect(parseLocalSpecification(second.specification).endpoints).toHaveLength(4);
});
it.each(exampleProjects)('registers original $name at its published address', (example) => {
  const project = createExampleProject(example.id);
  expect(new URL(project.frontendUrl).pathname).toContain(`/examples/${example.id}/`);
  expect(createLocalGraph(project.specification, 20).routeDependencies.length).toBeGreaterThan(0);
});
