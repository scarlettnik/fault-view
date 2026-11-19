import type { Project } from './model';
import projects from '../../../../examples/projects.json' with { type: 'json' };
import { browserChecksEnabled } from './runner';

export const exampleProjects = projects;
export function exampleUrl(id: string) {
  const examplesOrigin = import.meta.env.VITE_EXAMPLES_ORIGIN as string | undefined;
  if (examplesOrigin)
    return new URL(`examples/${id}/`, `${examplesOrigin.replace(/\/$/, '')}/`).href;
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  const site = base.pathname.endsWith('/app/') ? new URL('../', base) : base;
  return new URL(`examples/${id}/`, site).href;
}

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

export function createExampleProject(id = 'storefront'): Project {
  const example = exampleProjects.find((project) => project.id === id);
  if (!example) throw new Error('Неизвестный пример.');
  let specification =
    id === 'storefront'
      ? exampleSpecification
      : JSON.stringify(
          {
            openapi: '3.0.3',
            info: { title: example.name, version: '1.0.0' },
            paths: Object.fromEntries(
              example.api.map((path) => [
                path,
                {
                  get: { responses: { '200': { description: 'Демонстрационный ответ API' } } },
                },
              ]),
            ),
          },
          null,
          2,
        );
  if (browserChecksEnabled) {
    const schema = JSON.parse(specification) as { servers?: { url: string }[] };
    schema.servers = [
      {
        url:
          id === 'storefront' ? new URL(exampleUrl(id)).origin : exampleUrl(id).replace(/\/$/, ''),
      },
    ];
    specification = JSON.stringify(schema, null, 2);
  }
  return {
    id: example.id,
    name: example.name,
    description:
      id === 'storefront'
        ? 'Локальный пример: каталог, корзина и профиль.'
        : 'Исходный frontend-проект. На Pages используется локальный адаптер API.',
    frontendUrl: exampleUrl(id),
    specification,
    specificationName: `${id}.openapi.json`,
    maxPages: 10,
    createdAt: new Date().toISOString(),
    jobs: [],
    plans: [],
    runs: [],
    excludedRouteIds: [],
  };
}
