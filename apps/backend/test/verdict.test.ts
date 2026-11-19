import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseResultSchema } from '../../frontend/src/core/model.ts';
import { finalizeNetworkEvidence } from '../src/engine.ts';

function result(overrides: Record<string, unknown> = {}) {
  return caseResultSchema.parse({
    id: '0',
    routeId: '/products',
    endpointId: 'GET /api/recommendations',
    profile: 'timeout',
    source: 'playwright',
    verdict: 'FAIL',
    reason: 'Загрузка не завершилась за время наблюдения',
    durationMs: 2500,
    network: [],
    observedRequests: 0,
    injectedRequests: 1,
    assertions: [
      {
        id: 'loading',
        label: 'Завершение загрузки',
        status: 'failed',
        expected: 'Загрузка завершена',
        actual: 'Зависшая загрузка',
      },
    ],
    ...overrides,
  });
}

test('Service Worker injection preserves a failed UI verdict without a Playwright request event', () => {
  const value = result();
  finalizeNetworkEvidence(value);
  assert.equal(value.verdict, 'FAIL');
  assert.equal(value.observedRequests, 1);
  assert.equal(value.assertions.find((check) => check.id === 'network')?.status, 'passed');
  assert.equal(value.reason, 'Загрузка не завершилась за время наблюдения');
});

test('unconfirmed API coverage cannot hide a detected UI failure', () => {
  const value = result({ injectedRequests: 0 });
  finalizeNetworkEvidence(value);
  assert.equal(value.verdict, 'FAIL');
  assert.equal(value.assertions.find((check) => check.id === 'network')?.status, 'skipped');
  assert.match(value.reason, /Сценарий отказа API не подтверждён/);
});

test('a scenario without API evidence remains skipped when the UI did not fail', () => {
  const value = result({ verdict: 'PASS', assertions: [], injectedRequests: 0 });
  finalizeNetworkEvidence(value);
  assert.equal(value.verdict, 'SKIP');
});

test('a confirmed recovery keeps its successful result despite failures during the fault phase', () => {
  const value = result({
    profile: 'recovery',
    verdict: 'PASS',
    recovered: true,
    observedRequests: 2,
  });
  finalizeNetworkEvidence(value);
  assert.equal(value.verdict, 'PASS');
});

test('a runner failure keeps ERROR without becoming a skipped test', () => {
  const value = result({ verdict: 'ERROR', injectedRequests: 0 });
  finalizeNetworkEvidence(value);
  assert.equal(value.verdict, 'ERROR');
});
