import { createRequire } from 'node:module';
const require = createRequire(new URL('./apps/frontend/package.json', import.meta.url));
const js = require('@eslint/js');
const globals = require('globals');
export default [
  js.configs.recommended,
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  {
    files: ['examples/pages/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
  },
  {
    files: ['examples/tests/*.js', 'examples/playwright.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
