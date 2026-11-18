// Pure cascade logic is shared by previews and local simulations.
import { buildPlan, MAX_RUN_CASES, planExecutionProblem } from './cascade';
import type { Graph, PlanInput } from './model';

export { MAX_RUN_CASES, planExecutionProblem };

export function previewPlan(graph: Graph, input: PlanInput) {
  try {
    const plan = buildPlan(graph, input);
    const pairs = new Set(plan.cases.map((item) => JSON.stringify([item.routeId, item.endpointId])))
      .size;
    const problem = !input.profiles.length
      ? { code: 'NO_PROFILES', message: 'Выберите хотя бы один профиль проверки.' }
      : planExecutionProblem(plan);
    return { count: plan.cases.length, pairs, problem };
  } catch {
    return {
      count: 0,
      pairs: 0,
      problem: {
        code: 'INVALID_PLAN',
        message:
          'Выбранного узла больше нет в графе. Выберите страницу или API из последнего графа.',
      },
    };
  }
}
