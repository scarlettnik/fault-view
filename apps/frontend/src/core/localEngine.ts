import { parseDocument } from 'yaml';
import { z } from 'zod';
import type { CaseResult, Graph, Plan, Profile } from './model';
import examples from '../../../../examples/projects.json' with { type: 'json' };

const documentSchema = z.object({
  openapi: z.string().regex(/^3\.[01]\./),
  info: z.object({ title: z.string().min(1), version: z.string().min(1) }),
  paths: z.record(z.string(), z.unknown()),
  servers: z.array(z.object({ url: z.string() })).optional(),
});
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function parseLocalSpecification(source: string) {
  if (source.length > 900_000) throw new Error('Спецификация должна быть меньше 900 КБ.');
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) throw new Error('Некорректный JSON или YAML.');
  const raw: unknown = document.toJS({ maxAliasCount: 30 });
  const visited = new WeakSet<object>();
  function inspect(value: unknown) {
    if (value === null || typeof value !== 'object') return;
    if (visited.has(value)) throw new Error('Циклические YAML-ссылки не поддерживаются.');
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref' && typeof child === 'string' && !child.startsWith('#/'))
        throw new Error('Внешние ссылки OpenAPI не поддерживаются.');
      inspect(child);
    }
    visited.delete(value);
  }
  inspect(raw);
  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success) throw new Error('Нужен OpenAPI 3.0/3.1 с info.title, info.version и paths.');
  const endpoints: Graph['endpoints'] = [];
  const declared: { source: string; name: string; value: Record<string, unknown> }[] = [];
  for (const [path, item] of Object.entries(parsed.data.paths)) {
    if (!path.startsWith('/')) throw new Error('Пути OpenAPI должны начинаться с /.');
    for (const [method, operation] of Object.entries(object(item))) {
      if (!['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) continue;
      const op = object(operation);
      if (!Object.keys(object(op.responses)).length)
        throw new Error(`Добавьте responses для ${method.toUpperCase()} ${path}.`);
      for (const response of Object.values(object(op.responses))) {
        for (const [name, value] of Object.entries(object(object(response).links)))
          declared.push({ source: `${method.toUpperCase()} ${path}`, name, value: object(value) });
      }
      endpoints.push({
        id: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        operationId: typeof op.operationId === 'string' ? op.operationId : undefined,
        servers: (parsed.data.servers ?? []).map((server) => server.url),
      });
    }
  }
  if (!endpoints.length) throw new Error('В спецификации нет операций API.');
  const operationLinks: Graph['operationLinks'] = [];
  const warnings: string[] = [];
  for (const link of declared) {
    const operationId = link.value.operationId;
    const ref = typeof link.value.operationRef === 'string' ? link.value.operationRef : '';
    const parts = ref.split('/');
    const path = parts[2]?.replaceAll('~1', '/').replaceAll('~0', '~');
    const target =
      typeof operationId === 'string'
        ? endpoints.find((endpoint) => endpoint.operationId === operationId)
        : ref.startsWith('#/paths/')
          ? endpoints.find(
              (endpoint) => endpoint.path === path && endpoint.method === parts[3]?.toUpperCase(),
            )
          : undefined;
    if (target)
      operationLinks.push({
        source: link.source,
        target: target.id,
        name: link.name,
        provenance: 'openapi-link',
      });
    else
      warnings.push(
        `Не найден переход ${link.name}: ${String(operationId ?? (ref || 'ссылка без цели'))}.`,
      );
  }
  return { title: parsed.data.info.title, endpoints, operationLinks, warnings };
}

export function createLocalGraph(source: string, maxPages: number): Graph {
  const catalog = parseLocalSpecification(source);
  const fixture = examples.find((example) => example.name === catalog.title);
  if (fixture && fixture.id !== 'storefront') {
    const routes = fixture.routes.slice(0, maxPages);
    return {
      ...catalog,
      routes: routes.map((route) => ({
        id: `/${route}`,
        url: `/${route}`,
        status: 'visited' as const,
      })),
      routeDependencies: routes.flatMap((route) =>
        catalog.endpoints.map((endpoint) => ({
          routeId: `/${route}`,
          endpointId: endpoint.id,
          provenance: 'local-fixture' as const,
        })),
      ),
      warnings: [
        ...catalog.warnings,
        'Локальный учебный план: связи заданы сценарием; внешнее приложение не обходилось. Оригинальный frontend доступен отдельно в библиотеке примеров.',
      ],
      coverage: {
        visitedPages: routes.length,
        pendingPages: fixture.routes.length - routes.length,
        maxPages,
        complete: routes.length === fixture.routes.length,
        scope: 'local-simulation',
      },
    };
  }
  const sample = [
    ['/products', ['/api/products', '/api/recommendations']],
    ['/checkout', ['/api/cart', '/api/recommendations']],
    ['/account', ['/api/profile']],
  ] as const;
  const known = sample.some(([, paths]) =>
    paths.some((path) => catalog.endpoints.some((e) => e.id === `GET ${path}`)),
  );
  const definitions = known
    ? sample.map(([id, paths]) => ({
        id,
        targets: catalog.endpoints
          .filter((e) => paths.some((path) => e.id === `GET ${path}`))
          .map((e) => e.id),
      }))
    : [{ id: '/example', targets: catalog.endpoints.map((e) => e.id) }];
  const eligible = definitions.filter((route) => route.targets.length);
  const routes = eligible.slice(0, maxPages);
  return {
    ...catalog,
    routes: routes.map((route) => ({ id: route.id, url: route.id, status: 'visited' as const })),
    routeDependencies: routes.flatMap((route) =>
      route.targets.map((endpointId) => ({
        routeId: route.id,
        endpointId,
        provenance: 'local-fixture' as const,
      })),
    ),
    operationLinks: catalog.operationLinks,
    warnings: [
      ...catalog.warnings,
      'Локальная симуляция: страницы и связи заданы учебным сценарием, внешние приложения не открывались.',
    ],
    coverage: {
      visitedPages: routes.length,
      pendingPages: Math.max(0, eligible.length - routes.length),
      maxPages,
      complete: routes.length === eligible.length,
      scope: 'local-simulation',
    },
  };
}

export function simulateCase(test: Plan['cases'][number], id: string): CaseResult {
  const { profile } = test;
  const healthy = profile === 'healthy' || profile === 'latency' || profile === 'recovery';
  const missing = test.basis === 'declared-link';
  const failed = profile === 'timeout' || profile === 'networkError';
  const verdict = missing ? 'SKIP' : healthy ? 'PASS' : failed ? 'FAIL' : 'WARN';
  const previewState = healthy
    ? 'ready'
    : failed
      ? 'loading'
      : test.routeId === '/checkout'
        ? 'fallback'
        : 'unavailable';
  const reason = missing
    ? 'Связь отсутствует в локальном сценарии.'
    : healthy
      ? profile === 'recovery'
        ? 'Сценарий: данные восстановились после снятия отказа.'
        : 'Сценарий: данные доступны, интерфейс готов.'
      : failed
        ? 'Сценарий: загрузка не завершилась после отказа API.'
        : 'Сценарий: данные недоступны, интерфейс показал сообщение.';
  const statusFor = (p: Profile) =>
    p === 'http500' ? 500 : p === 'http503' || p === 'recovery' ? 503 : 200;
  return {
    ...test,
    id,
    source: 'simulation',
    previewState,
    verdict,
    reason,
    durationMs: profile === 'latency' ? 1200 : 300,
    recovered: profile === 'recovery' ? true : undefined,
    network: missing
      ? []
      : [
          {
            endpointId: test.endpointId,
            status: failed ? undefined : statusFor(profile),
            failed: failed || undefined,
            phase: 'fault',
          },
          ...(profile === 'recovery'
            ? [{ endpointId: test.endpointId, status: 200, phase: 'restored' as const }]
            : []),
        ],
    assertions: [
      {
        id: 'simulation',
        label: 'Результат локального сценария',
        status: missing ? 'skipped' : healthy ? 'passed' : failed ? 'failed' : 'warning',
        expected: 'Предопределённое поведение учебного примера',
        actual: reason,
      },
    ],
  };
}
