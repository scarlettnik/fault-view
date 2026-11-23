import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const workspace = fileURLToPath(new URL('../../', import.meta.url));
const frontend = 'http://127.0.0.1:26173';
const backend = 'http://127.0.0.1:26001';
const demo = 'http://127.0.0.1:26440';
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || !process.env.FAULTVIEW_S3_TEST_BUCKET)
  throw new Error('Set TEST_DATABASE_URL and FAULTVIEW_S3_TEST_BUCKET to isolated test resources.');
if (testDatabaseUrl === process.env.DATABASE_URL)
  throw new Error('Full-stack tests require a database separate from DATABASE_URL.');
if (process.env.FAULTVIEW_S3_TEST_BUCKET === process.env.FAULTVIEW_S3_BUCKET)
  throw new Error('Full-stack tests require a dedicated S3 test bucket.');

export default defineConfig({
  testDir: './fullstack',
  outputDir: './test-results/fullstack',
  timeout: 120_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  expect: { timeout: 12_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: frontend,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node examples/storefront/server.mjs',
      cwd: workspace,
      url: demo,
      env: { FAULTVIEW_DEMO_PORT: '26440', FAULTVIEW_DEMO_HOST: '127.0.0.1' },
    },
    {
      command: 'npm --prefix apps/backend run start',
      cwd: workspace,
      url: backend + '/health',
      env: {
        NODE_ENV: 'development',
        DATABASE_URL: testDatabaseUrl,
        FAULTVIEW_HOST: '127.0.0.1',
        FAULTVIEW_CLIENT_ORIGINS: frontend,
        FAULTVIEW_DEMO_URL: demo,
        FAULTVIEW_TARGET_ORIGINS: new URL(demo).origin,
        FAULTVIEW_S3_BUCKET: process.env.FAULTVIEW_S3_TEST_BUCKET,
        PORT: '26001',
      },
    },
    {
      command: 'npm run dev -- --port 26173',
      url: frontend,
      env: { VITE_API_URL: backend + '/api/v1', VITE_BASE_PATH: '/', VITE_RUNNER_URL: '' },
    },
  ],
});
