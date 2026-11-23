import { readFile } from 'node:fs/promises';
import type { Settings } from './projects.js';

export type DemoProject = { id: string; settings: Settings };

const examples = [
  {
    id: 'storefront',
    name: 'Storefront · демопроект',
    path: '/',
    description: 'Проверьте, как каталог показывает товары и рекомендации при отказе API.',
    maxPages: 4,
  },
  {
    id: 'checkout',
    name: 'Корзина',
    path: '/checkout',
    description: 'Проверьте, что видно покупателю, когда API корзины недоступен.',
    maxPages: 1,
  },
  {
    id: 'account',
    name: 'Профиль',
    path: '/account',
    description: 'Проверьте, как страница аккаунта обрабатывает сбой загрузки профиля.',
    maxPages: 1,
  },
];

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
    throw new Error('FAULTVIEW_DEMO_URL must be the dedicated Storefront origin.');
  const spec: Record<string, unknown> = JSON.parse(
    await readFile(
      new URL('../../../../examples/storefront/openapi.json', import.meta.url),
      'utf8',
    ),
  );
  spec.servers = [{ url: frontendUrl.origin }];
  const specification = JSON.stringify(spec);
  return examples.map(({ id, path, name, description, maxPages }) => ({
    id,
    settings: {
      name,
      description,
      frontendUrl: new URL(path, frontendUrl).href,
      specificationName: 'storefront.openapi.json',
      specification,
      maxPages,
      excludedRouteIds: [],
    },
  }));
}
