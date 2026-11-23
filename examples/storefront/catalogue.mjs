import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import projects from '../projects.json' with { type: 'json' };
import { apiResponse, initialState } from '../pages/api.js';

const root = fileURLToPath(new URL('../open-source/.runtime/workspace/', import.meta.url));
const examples = new Set(projects.filter(({ id }) => id !== 'storefront').map(({ id }) => id));
const mediaTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript'],
  ['.css', 'text/css'],
  ['.json', 'application/json'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
]);

let fixturePromise;
async function loadFixtures() {
  const [fixtures, robotProducts] = await Promise.all(
    ['fixtures.json', 'robot-products.json'].map(async (file) =>
      JSON.parse(await readFile(resolve(root, 'runtime', file), 'utf8')),
    ),
  );
  return { ...fixtures, robotProducts };
}

export async function serveExample(url, res) {
  const [, , id, ...segments] = url.pathname.split('/');
  if (!examples.has(id)) return res.writeHead(404).end('Not found');
  if (!segments.length) return res.writeHead(308, { Location: `${url.pathname}/` }).end();

  const relative = segments.join('/');
  let decoded;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    return res.writeHead(400).end('Invalid path');
  }

  if (relative === 'api' || relative.startsWith('api/')) {
    try {
      const fixtures = await (fixturePromise ??= loadFixtures());
      const state = initialState(id, fixtures);
      const result = apiResponse(
        id,
        `/${relative}`.replace(/\/$/, ''),
        'GET',
        {},
        url.searchParams,
        state,
        fixtures,
      );
      return res
        .writeHead(result.status, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(result.body));
    } catch {
      return res.writeHead(503).end('Demo API unavailable');
    }
  }

  const directory = resolve(root, id);
  const file = resolve(directory, `./${decoded || 'index.html'}`);
  if (!file.startsWith(directory + sep)) return res.writeHead(404).end('Not found');
  try {
    const body = await readFile(file);
    return res
      .writeHead(200, {
        'Content-Type': mediaTypes.get(extname(file)) ?? 'application/octet-stream',
      })
      .end(body);
  } catch {
    return res.writeHead(404).end('Not found');
  }
}
