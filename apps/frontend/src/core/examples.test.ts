import { expect, it } from 'vitest';
import { createExampleProject } from './examples';
import { parseLocalSpecification } from './localEngine';
it('creates an independent local example with a valid bundled specification', () => {
  const first = createExampleProject();
  const second = createExampleProject();
  first.excludedRouteIds.push('/products');
  expect(second.excludedRouteIds).toEqual([]);
  expect(parseLocalSpecification(second.specification).endpoints).toHaveLength(4);
});
