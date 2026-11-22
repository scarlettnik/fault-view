import { expect, test } from 'vitest';
import { compareRuns } from './comparison';
import { defaultChecks, type CaseResult, type TestRun } from './model';

function sample(routeId: string, verdict: CaseResult['verdict'], id: string): CaseResult {
  return {
    id,
    routeId,
    endpointId: 'GET /items',
    profile: 'http500',
    verdict,
    durationMs: 15,
    reason: 'fixture',
    network: [],
    source: 'playwright',
    assertions: [],
    previewState: 'ready',
    observedRequests: 1,
    injectedRequests: 1,
    consoleErrors: 0,
    pageErrors: 0,
    pageErrorMessages: [],
  };
}
function run(id: string, results: CaseResult[]): TestRun {
  return {
    id,
    source: 'playwright',
    createdAt: '2026-11-22T00:00:00Z',
    status: 'completed',
    plan: {
      discoveryId: 'graph',
      mode: 'endpoint',
      targetId: 'GET /items',
      excludedRouteIds: [],
      profiles: ['http500'],
    },
    progress: { completed: results.length, total: results.length },
    warnings: [],
    results,
  };
}

test('aligns by route, endpoint and profile, independent of position and case ID', () => {
  const before = run('first', [
    sample('/a', 'FAIL', '0'),
    sample('/b', 'PASS', '1'),
    sample('/c', 'WARN', '2'),
    sample('/d', 'SKIP', '3'),
    sample('/e', 'PASS', '4'),
  ]);
  const after = run('second', [
    sample('/b', 'WARN', '0'),
    sample('/f', 'PASS', '1'),
    sample('/a', 'PASS', '2'),
    sample('/d', 'PASS', '3'),
    sample('/c', 'WARN', '4'),
  ]);
  after.checks = { ...defaultChecks, readySelector: '#items' };
  const result = compareRuns(before, after);
  expect(result.settingsChanged).toBe(true);
  expect(result.cases.map(({ routeId, change }) => [routeId, change])).toEqual([
    ['/a', 'improved'],
    ['/b', 'regressed'],
    ['/c', 'unchanged'],
    ['/d', 'inconclusive'],
    ['/e', 'removed'],
    ['/f', 'added'],
  ]);
  expect(result.cases[0]?.baseline?.verdict).toBe('FAIL');
  expect(result.cases[0]?.candidate?.verdict).toBe('PASS');
});
