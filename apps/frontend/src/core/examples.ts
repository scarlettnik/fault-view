import type { Project } from './model';

export const exampleSpecification = JSON.stringify(
  {
    openapi: '3.0.3',
    info: { title: 'Storefront', version: '1.0.0' },
    servers: [{ url: 'https://storefront.example' }],
    paths: Object.fromEntries(
      ['products', 'cart', 'profile', 'recommendations'].map((name) => [
        `/api/${name}`,
        { get: { operationId: name, responses: { '200': { description: 'OK' } } } },
      ]),
    ),
  },
  null,
  2,
);

export function createExampleProject(): Project {
  return {
    id: 'storefront',
    name: 'Storefront',
    description: 'Локальный пример: каталог, корзина и профиль.',
    frontendUrl: 'https://storefront.example',
    specification: exampleSpecification,
    specificationName: 'storefront.openapi.json',
    maxPages: 10,
    createdAt: new Date().toISOString(),
    jobs: [],
    plans: [],
    runs: [],
    excludedRouteIds: [],
  };
}
