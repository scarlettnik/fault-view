import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const prefix = (process.env.SITE_BASE_PATH ?? '/').replace(/\/?$/, '/');
export default defineConfig({
  testDir: './site',
  outputDir: './test-results/site',
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:15174${prefix}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node scripts/serve.mjs site-dist 15174 ${prefix}`,
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    url: `http://127.0.0.1:15174${prefix}`,
    reuseExistingServer: false,
  },
});
