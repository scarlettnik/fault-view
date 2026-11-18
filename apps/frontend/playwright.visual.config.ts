import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './visual',
  outputDir: './test-results/visual',
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1000, height: 850 },
    baseURL: 'http://127.0.0.1:16006',
    colorScheme: 'light',
  },
  expect: { toHaveScreenshot: { animations: 'disabled', maxDiffPixelRatio: 0.005 } },
  webServer: {
    command: 'node ../../scripts/serve.mjs storybook-static 16006',
    url: 'http://127.0.0.1:16006',
    reuseExistingServer: false,
  },
});
