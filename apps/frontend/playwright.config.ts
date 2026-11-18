import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.FAULTVIEW_E2E_PORT ?? 15173);
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/e2e',
  timeout: 45_000,
  workers: 1,
  retries: 0,
  expect: { timeout: 10_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
