import { readFile } from 'node:fs/promises';
import type { Settings } from './projects.js';

export async function loadDemo(target: string | undefined): Promise<Settings | undefined> {
  if (!target) return undefined;
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
  return {
    name: 'Storefront · демопроект',
    description: 'Запустите обследование каталога, затем выберите сценарий отказа API.',
    frontendUrl: frontendUrl.href,
    specificationName: 'storefront.openapi.json',
    specification: JSON.stringify(spec),
    maxPages: 4,
    excludedRouteIds: [],
  };
}
