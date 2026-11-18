import type { Graph as DependencyGraph, PlanInput } from './model';
const InputError = Error;

export const MAX_RUN_CASES = 100;

export function planExecutionProblem(plan: ReturnType<typeof buildPlan>) {
  if (!plan.cases.length)
    return {
      code: 'EMPTY_PLAN',
      message:
        plan.mode === 'endpoint'
          ? `В плане 0 проверок: для API «${plan.targetId}» нет связей с включёнными страницами. Наличие API в OpenAPI не означает наличие связи в локальном сценарии. Выберите API со связями на графе, верните исключённые страницы или обновите граф.`
          : `В плане 0 проверок: у страницы «${plan.targetId}» не найдено API-зависимостей либо она исключена. Выберите страницу со связями на графе, верните её в проверки или обновите граф.`,
    };
  if (plan.cases.length > MAX_RUN_CASES) {
    const pairs = new Set(plan.cases.map((item) => JSON.stringify([item.routeId, item.endpointId])))
      .size;
    const profiles = new Set(plan.cases.map((item) => item.profile)).size;
    return {
      code: 'PLAN_TOO_LARGE',
      message: `В плане ${plan.cases.length} проверок: ${pairs} пар «страница → API» × ${profiles} профилей. За один прогон можно выполнить максимум ${MAX_RUN_CASES}. Уберите часть профилей или исключите страницы из каскада.`,
    };
  }
}

export function buildPlan(graph: DependencyGraph, input: PlanInput) {
  const routes = new Set(graph.routes.map((route) => route.id));
  const endpoints = new Set(graph.endpoints.map((endpoint) => endpoint.id));
  for (const id of input.excludedRouteIds) {
    if (!routes.has(id)) throw new InputError(`Неизвестный маршрут: ${id}`);
  }
  if (!(input.mode === 'route' ? routes : endpoints).has(input.targetId)) {
    throw new InputError('Выбранный узел отсутствует в графе.');
  }
  const excluded = new Set(input.excludedRouteIds);
  const reach = (seeds: string[], reverse: boolean) => {
    const visited = new Set(seeds);
    const queue = [...seeds];
    for (let index = 0; index < queue.length; index++) {
      for (const edge of graph.operationLinks) {
        const from = reverse ? edge.target : edge.source;
        const to = reverse ? edge.source : edge.target;
        if (from === queue[index] && !visited.has(to)) {
          visited.add(to);
          queue.push(to);
        }
      }
    }
    return visited;
  };

  // Route mode follows declared operation links. Endpoint mode follows them backwards
  // to find entry operations/pages potentially affected by the selected operation.
  const linked =
    input.mode === 'route'
      ? reach(
          graph.routeDependencies
            .filter((edge) => edge.routeId === input.targetId)
            .map((edge) => edge.endpointId),
          false,
        )
      : reach([input.targetId], true);
  const affected =
    input.mode === 'route'
      ? [input.targetId]
      : graph.routes
          .filter((route) =>
            graph.routeDependencies.some(
              (edge) => edge.routeId === route.id && linked.has(edge.endpointId),
            ),
          )
          .map((route) => route.id);

  const cases: {
    routeId: string;
    endpointId: string;
    profile: PlanInput['profiles'][number];
    basis: 'local-fixture' | 'declared-link';
  }[] = [];
  for (const routeId of affected.filter((id) => !excluded.has(id))) {
    const observed = new Set(
      graph.routeDependencies
        .filter((edge) => edge.routeId === routeId)
        .map((edge) => edge.endpointId),
    );
    const targets = input.mode === 'route' ? linked : new Set([input.targetId]);
    for (const endpointId of targets) {
      for (const profile of new Set(input.profiles)) {
        cases.push({
          routeId,
          endpointId,
          profile,
          basis: observed.has(endpointId) ? 'local-fixture' : 'declared-link',
        });
      }
    }
  }
  return {
    mode: input.mode,
    targetId: input.targetId,
    cases,
    excludedRouteIds: [...excluded],
    warnings: cases.some((test) => test.basis === 'declared-link')
      ? [
          'Некоторые переходы объявлены в OpenAPI Links, но отсутствуют в локальном сценарии. Они не подтверждают выполнение запроса.',
        ]
      : [],
    executionStatus: 'planned' as const,
  };
}
