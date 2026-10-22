import js from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'no-alert': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-empty-function': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-implicit-coercion': 'error',
      'no-multi-assign': 'error',
      'no-new': 'error',
      'no-new-func': 'error',
      'no-param-reassign': 'error',
      'no-shadow': 'error',
      'no-throw-literal': 'error',
      'no-unneeded-ternary': 'error',
      'no-unused-vars': ['error', { args: 'all', caughtErrors: 'all' }],
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-const': 'error',
      'prefer-template': 'error',
      'max-depth': ['error', 3],
      'max-params': ['error', 3],
    },
  },
  {
    files: ['scripts/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
    rules: { strict: ['error', 'function'] },
  },
  {
    files: ['*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
]);
