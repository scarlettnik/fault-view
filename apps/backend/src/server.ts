import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

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
const app = await createApp({
  targetOrigins: origins(process.env.FAULTVIEW_TARGET_ORIGINS),
  clientOrigins: origins(process.env.FAULTVIEW_CLIENT_ORIGINS),
  dataDirectory:
    process.env.FAULTVIEW_DATA_DIR ?? fileURLToPath(new URL('../data/', import.meta.url)),
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
await app.listen({ port, host: '127.0.0.1' });
console.log(`Playwright runner: http://127.0.0.1:${port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void app.close();
  });
