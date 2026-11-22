import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createWorkspaceApp } from './workspace/app.js';
import { createPool, migrate } from './workspace/db.js';

const port = Number(process.env.FAULTVIEW_RUNNER_PORT ?? 3001);
const defaults = [
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];
const origins = (value: string | undefined) =>
  value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : defaults;
const databaseUrl = process.env.DATABASE_URL;
const production = process.env.NODE_ENV === 'production';
if (production && !databaseUrl) throw new Error('DATABASE_URL is required in production.');
const pool = databaseUrl ? createPool(databaseUrl) : undefined;
pool?.on('error', () => console.error('An idle PostgreSQL connection closed unexpectedly.'));
const clientOrigins = origins(process.env.FAULTVIEW_CLIENT_ORIGINS);
const app = await (async () => {
  if (!pool) {
    return createApp({
      targetOrigins: origins(process.env.FAULTVIEW_TARGET_ORIGINS),
      clientOrigins,
      dataDirectory:
        process.env.FAULTVIEW_DATA_DIR ?? fileURLToPath(new URL('../data/', import.meta.url)),
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    });
  }
  try {
    await migrate(pool);
    return await createWorkspaceApp({ pool, clientOrigins, secureCookies: production });
  } catch (error) {
    await pool.end();
    throw error;
  }
})();
const host = pool ? (process.env.FAULTVIEW_HOST ?? '127.0.0.1') : '127.0.0.1';
await app.listen({ port, host });
console.log(`${pool ? 'FaultView API' : 'Playwright runner'}: http://${host}:${port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().finally(() => pool?.end());
  });
