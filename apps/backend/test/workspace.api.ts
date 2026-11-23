import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadDemo } from '../src/workspace/demo.js';
import { createWorkspaceApp } from '../src/workspace/app.js';
import { createPool, migrate } from '../src/workspace/db.js';

const origin = 'https://faultview.test';
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set TEST_DATABASE_URL to a dedicated PostgreSQL database.');
const input = {
  name: 'Storefront',
  description: 'Retain when patching another field',
  frontendUrl: 'https://demo.example/',
  specificationName: 'shop.json',
  specification: JSON.stringify({
    openapi: '3.0.3',
    info: { title: 'Shop', version: '1' },
    paths: { '/api/products': { get: { responses: { '200': { description: 'OK' } } } } },
  }),
  maxPages: 3,
};

test('PostgreSQL workspace enforces sessions, ownership, validation and REST semantics across restarts', async (t) => {
  const control = createPool(connectionString);
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  await control.query('CREATE SCHEMA ' + schema);
  const url = new URL(connectionString);
  url.searchParams.set('options', '-c search_path=' + schema);
  const pool = createPool(url.href);
  let app: Awaited<ReturnType<typeof createWorkspaceApp>> | undefined;
  t.after(async () => {
    await app?.close();
    await pool.end();
    await control.query('DROP SCHEMA ' + schema + ' CASCADE');
    await control.end();
  });
  await migrate(pool);
  const images = new Map<string, Buffer>();
  const deleted: string[] = [];
  let storageAvailable = true;
  const config = {
    pool,
    clientOrigins: [origin],
    secureCookies: true,
    demos: await loadDemo('https://demo.example/'),
    execution: {
      demoOnly: true,
      targetOrigins: ['https://demo.example'],
      storage: {
        ready: async () => {
          if (!storageAvailable) throw new Error('failing test storage');
        },
        put: async (key: string, bytes: Buffer) => {
          images.set(key, bytes);
        },
        get: async (key: string) => images.get(key) ?? Buffer.alloc(0),
        delete: async (key: string) => {
          deleted.push(key);
          images.delete(key);
        },
        close: () => undefined,
      },
    },
  };
  app = await createWorkspaceApp(config);
  assert.equal((await app.inject('/health')).statusCode, 200);
  storageAvailable = false;
  const unavailable = await app.inject('/health');
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.json().code, 'DEPENDENCY_UNAVAILABLE');
  storageAvailable = true;
  const auth = '/api/v1/auth/';
  const base = '/api/v1/projects';
  const password = 'faultview test password';
  async function call(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
    cookie?: string,
    caller = origin,
  ) {
    return app!.inject({
      method,
      url,
      payload,
      headers: { origin: caller, ...(cookie ? { cookie } : {}) },
    });
  }
  const register = (email: string) => call('POST', auth + 'register', { email, password });
  assert.equal((await call('GET', base)).statusCode, 401);
  assert.equal(
    (await call('POST', auth + 'register', { email: 'weak@test.example', password: 'bad' }))
      .statusCode,
    400,
  );
  const registration = await register('Owner@Test.Example');
  assert.equal(registration.statusCode, 201);
  assert.equal(registration.json().email, 'owner@test.example');
  const cookie = registration.headers['set-cookie'] as string;
  assert.match(cookie, /^__Host-faultview_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  const owner = cookie.split(';')[0]!;
  const otherRegistration = await register('other@test.example');
  assert.equal(otherRegistration.statusCode, 201);
  const other = (otherRegistration.headers['set-cookie'] as string).split(';')[0]!;
  const loginFailure = await call('POST', auth + 'login', {
    email: 'owner@test.example',
    password: 'This is wrong',
  });
  assert.equal(loginFailure.statusCode, 401);
  const login = await call(
    'POST',
    auth + 'login',
    { email: 'owner@test.example', password },
    owner,
  );
  assert.equal(login.statusCode, 200);
  const session = (login.headers['set-cookie'] as string).split(';')[0]!;
  assert.notEqual(session, owner);
  assert.equal((await call('GET', auth + 'session', undefined, owner)).statusCode, 401);

  const csrf = await call('POST', base, input, session, 'https://untrusted.test');
  assert.equal(csrf.statusCode, 403);
  assert.equal(csrf.headers['access-control-allow-origin'], undefined);
  assert.equal(
    (await app.inject({ method: 'POST', url: base, payload: input, headers: { cookie: session } }))
      .statusCode,
    403,
  );
  const cors = await app.inject({
    method: 'OPTIONS',
    url: base,
    headers: { origin, 'access-control-request-method': 'PATCH' },
  });
  assert.equal(cors.statusCode, 204);
  assert.equal(cors.headers['access-control-allow-origin'], origin);
  assert.equal(cors.headers['access-control-allow-credentials'], 'true');
  assert.deepEqual((await call('GET', base, undefined, session)).json(), []);
  assert.equal(
    (await call('POST', base, { ...input, specification: 'broken' }, session)).statusCode,
    400,
  );
  assert.equal(
    (await call('POST', base, { ...input, owner_id: 'wrong' }, session)).statusCode,
    400,
  );
  const created = await call('POST', base, input, session);
  assert.equal(created.statusCode, 201);
  const path = base + '/' + created.json().id;
  assert.equal(created.headers.location, path);
  for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
    const result = await call(
      method,
      path,
      method === 'PATCH' ? { name: 'Other' } : undefined,
      other,
    );
    assert.equal(result.statusCode, 404);
  }
  assert.deepEqual((await call('GET', base, undefined, other)).json(), []);
  assert.equal((await call('PATCH', path, {}, session)).statusCode, 400);
  const patch = await call('PATCH', path, { name: 'Updated' }, session);
  assert.equal(patch.statusCode, 200);
  assert.equal(patch.json().description, input.description);

  const demo = await call('POST', base + '/demo', undefined, session);
  assert.equal(demo.statusCode, 201);
  const demoPath = base + '/' + demo.json().id;
  assert.equal((await call('POST', base + '/demo', undefined, session)).json().id, demo.json().id);
  const choices = (await app.inject('/api/v1/capabilities')).json().examples;
  assert.deepEqual(
    choices.map((example: { id: string }) => example.id),
    ['storefront', 'petclinic', 'conduit', 'todo', 'robot-shop', 'react-express-mongodb'],
  );
  const petclinic = await call('POST', base + '/demo', { exampleId: 'petclinic' }, session);
  assert.equal(petclinic.statusCode, 201);
  assert.equal(petclinic.json().frontendUrl, 'https://demo.example/examples/petclinic/');
  assert.notEqual(petclinic.json().id, demo.json().id);
  const reopened = await call('POST', base + '/demo', { exampleId: 'petclinic' }, session);
  assert.equal(reopened.statusCode, 200);
  assert.equal(reopened.json().id, petclinic.json().id);
  assert.equal(
    (await call('GET', base + '/' + petclinic.json().id, undefined, other)).statusCode,
    404,
  );
  assert.equal(
    (await call('POST', base + '/demo', { exampleId: 'unknown' }, session)).statusCode,
    404,
  );
  assert.equal(
    (
      await call(
        'POST',
        base + '/demo',
        {
          exampleId: 'petclinic',
          frontendUrl: 'https://elsewhere.test',
        },
        session,
      )
    ).statusCode,
    400,
  );
  assert.equal(
    (await call('PATCH', demoPath, { frontendUrl: 'https://elsewhere.test' }, session)).statusCode,
    409,
  );
  assert.equal((await call('POST', path + '/discoveries', undefined, session)).statusCode, 403);
  assert.equal((await call('POST', path + '/discoveries', undefined, other)).statusCode, 404);
  assert.equal((await call('GET', '/runs/' + randomUUID(), undefined, session)).statusCode, 404);

  const runIds = [randomUUID(), randomUUID(), randomUUID()];
  const projectId = created.json().id as string;
  const graphId = randomUUID();
  for (const [index, runId] of runIds.entries()) {
    const state = {
      id: runId,
      status: index === 2 ? 'running' : 'completed',
      source: 'playwright',
      plan: {
        discoveryId: graphId,
        mode: 'endpoint',
        targetId: 'GET /api/products',
        profiles: ['http500'],
        excludedRouteIds: [],
      },
      createdAt: new Date().toISOString(),
      progress: { completed: 1, total: 1 },
      warnings: [],
      results: [
        {
          routeId: '/products',
          endpointId: 'GET /api/products',
          profile: 'http500',
          verdict: index ? 'PASS' : 'FAIL',
          durationMs: 500,
          reason: 'fixture',
        },
      ],
    };
    await pool.query('INSERT INTO runs (id, project_id, state) VALUES ($1, $2, $3)', [
      runId,
      projectId,
      state,
    ]);
  }
  const compare = (candidate: string) =>
    path + '/runs/compare?baseline=' + runIds[0] + '&candidate=' + candidate;
  assert.equal((await call('GET', compare(runIds[0]!), undefined, session)).statusCode, 400);
  assert.equal((await call('GET', compare(runIds[2]!), undefined, session)).statusCode, 409);
  assert.equal((await call('GET', compare(runIds[1]!), undefined, other)).statusCode, 404);
  assert.equal(
    (
      await call(
        'GET',
        demoPath + '/runs/compare?baseline=' + runIds[0] + '&candidate=' + runIds[1],
        undefined,
        session,
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (await call('GET', compare(runIds[1]!), undefined, session)).json().cases[0].change,
    'improved',
  );
  const screenshot = path + '/runs/' + runIds[0] + '/screenshots/0-final';
  const objectKey = 'fixture/private.jpg';
  images.set(objectKey, Buffer.from('test jpeg'));
  await pool.query(
    'INSERT INTO screenshots (run_id, name, object_key, bytes, ready) VALUES ($1, $2, $3, $4, true)',
    [runIds[0], '0-final', objectKey, 9],
  );
  assert.equal((await call('GET', screenshot, undefined, other)).statusCode, 404);
  assert.equal((await call('GET', screenshot)).statusCode, 401);
  assert.equal(
    (await call('GET', screenshot.replace('0-final', 'unknown'), undefined, session)).statusCode,
    400,
  );
  const photo = await call('GET', screenshot, undefined, session);
  assert.equal(photo.statusCode, 200);
  assert.equal(photo.headers['cache-control'], 'no-store');
  assert.equal(photo.headers['content-type'], 'image/jpeg');

  await app.close();
  await migrate(pool);
  app = await createWorkspaceApp(config);
  const read = await call('GET', path, undefined, session);
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().name, 'Updated');
  assert.equal(
    read.json().runs.find((run: { id: string }) => run.id === runIds[2]).status,
    'failed',
  );
  assert.equal((await call('DELETE', path, undefined, session)).statusCode, 204);
  assert.equal((await call('GET', path, undefined, session)).statusCode, 404);
  assert.equal((await call('GET', screenshot, undefined, session)).statusCode, 404);
  const deletion = await pool.query(
    'SELECT object_key FROM screenshot_deletions WHERE object_key = $1',
    [objectKey],
  );
  assert.ok(deletion.rowCount || deleted.includes(objectKey));
  assert.equal((await call('POST', auth + 'logout', undefined, session)).statusCode, 204);
  assert.equal((await call('GET', auth + 'session', undefined, session)).statusCode, 401);
  await pool.query(
    "UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1",
    [otherRegistration.json().id],
  );
  assert.equal((await call('GET', auth + 'session', undefined, other)).statusCode, 401);
  for (let index = 0; index < 8; index++) {
    assert.equal(
      (
        await call('POST', auth + 'login', {
          email: 'missing@test.example',
          password: 'a valid length password',
        })
      ).statusCode,
      401,
    );
  }
  const rateLimited = await call('POST', auth + 'login', { email: 'owner@test.example', password });
  assert.equal(rateLimited.statusCode, 429);
  assert.equal(rateLimited.json().code, 'RATE_LIMITED');
});
