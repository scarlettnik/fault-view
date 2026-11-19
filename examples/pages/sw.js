import { initialState, apiResponse } from './runtime/api.js';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
const scope = new URL('./', import.meta.url);
const cacheName = `faultview-original-examples-v1-${scope.pathname}`;
const locks = new Map();
const faults = new Map();
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
let fixturePromise;
const fixtures = () =>
  (fixturePromise ??= Promise.all(
    ['robot-products.json', 'fixtures.json'].map(async (name) => {
      const response = await fetch(new URL(`runtime/${name}`, import.meta.url));
      if (!response.ok) throw new Error(`Missing fixture: ${name}`);
      return response.json();
    }),
  ).then(([products, data]) => ({ ...data, robotProducts: products })));
async function stateFor(id, work) {
  const previous = locks.get(id) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      const store = await caches.open(cacheName);
      const key = new URL(`_state/${id}`, scope);
      const existing = await store.match(key);
      const state = existing ? await existing.json() : initialState(id, await fixtures());
      const response = await work(state);
      await store.put(key, json(state));
      return response;
    });
  locks.set(id, current);
  try {
    return await current;
  } finally {
    if (locks.get(id) === current) locks.delete(id);
  }
}
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isControl =
    url.origin === scope.origin && url.pathname.startsWith(`${scope.pathname}_control/`);
  const apiIndex = url.pathname.indexOf('/api');
  const isApi = apiIndex >= 0 && /^\/api(?:\/|$)/.test(url.pathname.slice(apiIndex));
  if (!isControl && !isApi) return;
  event.respondWith(
    (async () => {
      const client = await self.clients.get(event.clientId);
      if (!client || !client.url.startsWith(scope.href)) return fetch(event.request);
      const id = new URL(client.url).pathname.slice(scope.pathname.length).split('/')[0];
      if (
        ![
          'storefront',
          'petclinic',
          'conduit',
          'todo',
          'robot-shop',
          'react-express-mongodb',
        ].includes(id)
      )
        return json({ error: 'Unknown example' }, 404);
      if (isControl)
        return stateFor(id, async () => {
          const fault = url.searchParams.get('fault');
          faults.set(
            event.clientId,
            [
              'healthy',
              'latency',
              'http500',
              'http503',
              'timeout',
              'networkError',
              'recovery',
            ].includes(fault)
              ? fault
              : 'healthy',
          );
          return json({ ready: true });
        });
      return stateFor(id, async (state) => {
        const fault = faults.get(event.clientId) ?? 'healthy';
        if (fault === 'networkError') return Response.error();
        if (fault === 'http500' || fault === 'http503')
          return json(
            { error: 'Controlled demo failure', errors: { body: ['Controlled demo failure'] } },
            fault === 'http500' ? 500 : 503,
          );
        if (fault === 'timeout') {
          // Bound the simulated timeout; do not leave pending requests forever.
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return json({ error: 'Demo timeout' }, 504);
        }
        if (fault === 'latency' || fault === 'recovery')
          await new Promise((resolve) => setTimeout(resolve, 700));
        if (fault === 'recovery') faults.set(event.clientId, 'healthy');
        let body = {};
        if (!['GET', 'HEAD'].includes(event.request.method)) {
          try {
            const text = await event.request.text();
            body = text.trim() ? JSON.parse(text) : {};
          } catch {
            return json({ error: 'Expected JSON body' }, 400);
          }
        }
        const result = apiResponse(
          id,
          url.pathname.slice(apiIndex).replace(/\/$/, ''),
          event.request.method,
          body,
          url.searchParams,
          state,
          await fixtures(),
        );
        return json(result.body, result.status);
      });
    })().catch((error) => json({ error: error.message }, 500)),
  );
});
