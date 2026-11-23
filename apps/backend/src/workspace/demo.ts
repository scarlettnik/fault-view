import { readFile } from 'node:fs/promises';
import examples from '../../../../examples/projects.json' with { type: 'json' };
import type { Settings } from './projects.js';

export type DemoProject = { id: string; settings: Settings };

const descriptions: Record<string, string> = {
  storefront: 'Проверьте, как каталог показывает товары и рекомендации при отказе API.',
  petclinic: 'Проверьте списки владельцев и ветеринаров при отказе API клиники.',
  conduit: 'Проверьте, как лента статей и теги загружаются при сбоях API.',
  todo: 'Проверьте, как список задач реагирует на сбой загрузки.',
  'robot-shop': 'Проверьте загрузку каталога роботов, категорий и корзины.',
  'react-express-mongodb': 'Проверьте загрузку списка Todo из API.',
};

export async function loadDemo(target: string | undefined): Promise<DemoProject[]> {
  if (!target) return [];
  const frontendUrl = new URL(target);
  if (
    !['http:', 'https:'].includes(frontendUrl.protocol) ||
    frontendUrl.username ||
    frontendUrl.password ||
    frontendUrl.search ||
    frontendUrl.hash ||
    frontendUrl.pathname !== '/'
  )
    throw new Error('FAULTVIEW_DEMO_URL must be the dedicated demo origin.');
  const storefrontSpec: Record<string, unknown> = JSON.parse(
    await readFile(
      new URL('../../../../examples/storefront/openapi.json', import.meta.url),
      'utf8',
    ),
  );
  return examples.map(({ id, name, api }) => {
    const storefront = id === 'storefront';
    const url = new URL(storefront ? '/' : `/examples/${id}/`, frontendUrl).href;
    const spec = storefront
      ? storefrontSpec
      : {
          openapi: '3.0.3',
          info: { title: name, version: '1.0.0' },
          paths: Object.fromEntries(
            api.map((path) => [path, { get: { responses: { 200: { description: 'OK' } } } }]),
          ),
        };
    return {
      id,
      settings: {
        name: storefront ? 'Storefront · демопроект' : name,
        description: descriptions[id] ?? '',
        frontendUrl: url,
        specificationName: `${id}.openapi.json`,
        specification: JSON.stringify({
          ...spec,
          servers: [{ url: storefront ? frontendUrl.origin : url }],
        }),
        maxPages: id === 'petclinic' ? 5 : 4,
        excludedRouteIds: [],
      },
    };
  });
}
