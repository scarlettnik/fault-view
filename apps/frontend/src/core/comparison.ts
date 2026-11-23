import { z } from 'zod';
import { profileSchema, verdicts, type CaseResult, type TestRun } from './model';

const changes = ['improved', 'regressed', 'unchanged', 'inconclusive', 'added', 'removed'] as const;
const valueSchema = z.object({
  verdict: z.enum(verdicts),
  durationMs: z.number(),
  reason: z.string(),
});

export const runComparisonSchema = z.object({
  baselineId: z.string(),
  candidateId: z.string(),
  settingsChanged: z.boolean(),
  cases: z.array(
    z.object({
      routeId: z.string(),
      endpointId: z.string(),
      profile: profileSchema,
      change: z.enum(changes),
      baseline: valueSchema.optional(),
      candidate: valueSchema.optional(),
    }),
  ),
});
export type RunComparison = z.infer<typeof runComparisonSchema>;
type Row = RunComparison['cases'][number];

const rank: Partial<Record<CaseResult['verdict'], number>> = { FAIL: 0, WARN: 1, PASS: 2 };
const key = ({ routeId, endpointId, profile }: CaseResult) =>
  JSON.stringify([routeId, endpointId, profile]);

function classify(before?: CaseResult, after?: CaseResult): Row['change'] {
  if (!before) return 'added';
  if (!after) return 'removed';
  const left = rank[before.verdict];
  const right = rank[after.verdict];
  if (left === undefined || right === undefined) return 'inconclusive';
  if (right === left) return 'unchanged';
  return right > left ? 'improved' : 'regressed';
}

const summarize = ({ verdict, durationMs, reason }: CaseResult) => ({
  verdict,
  durationMs,
  reason,
});

export function compareRuns(baseline: TestRun, candidate: TestRun): RunComparison {
  const before = new Map(baseline.results.map((result) => [key(result), result]));
  const after = new Map(candidate.results.map((result) => [key(result), result]));
  const cases: Row[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const earlier = before.get(id);
    const later = after.get(id);
    const { routeId, endpointId, profile } = (earlier ?? later)!;
    cases.push({
      routeId,
      endpointId,
      profile,
      change: classify(earlier, later),
      baseline: earlier ? summarize(earlier) : undefined,
      candidate: later ? summarize(later) : undefined,
    });
  }
  return {
    baselineId: baseline.id,
    candidateId: candidate.id,
    settingsChanged: (['readySelector', 'errorSelector', 'degradedSelector'] as const).some(
      (selector) => (baseline.checks?.[selector] ?? '') !== (candidate.checks?.[selector] ?? ''),
    ),
    cases,
  };
}
