import SwaggerParser from '@apidevtools/swagger-parser';
import { parseDocument } from 'yaml';
import { InputError, type Catalog, type Endpoint } from './types.js';

type ObjectValue = Record<string, any>;
const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const object = (value: unknown): value is ObjectValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function checkReferences(value: unknown, depth = 0, budget = { left: 50_000 }): void {
  if (depth > 80 || --budget.left < 0) throw new InputError('Спецификация слишком сложная.');
  if (!object(value) && !Array.isArray(value)) return;
  if (
    object(value) &&
    '$ref' in value &&
    (typeof value.$ref !== 'string' || !value.$ref.startsWith('#/'))
  ) {
    throw new InputError(
      'Внешние $ref запрещены. Загрузите объединённую спецификацию.',
      'EXTERNAL_REFERENCE',
    );
  }
  for (const child of Object.values(value)) checkReferences(child, depth + 1, budget);
}

function serverUrls(servers: unknown, frontendUrl: string): string[] {
  if (!Array.isArray(servers) || !servers.length) return [new URL('/', frontendUrl).href];
  return servers.map((server) => {
    if (!object(server) || typeof server.url !== 'string')
      throw new InputError('Некорректный server URL.');
    const raw = server.url.replace(/\{([^}]+)\}/g, (_: string, key: string) => {
      const fallback = server.variables?.[key]?.default;
      if (typeof fallback !== 'string')
        throw new InputError('Для переменной server нужен default.');
      return fallback;
    });
    let url: URL;
    try {
      url = new URL(raw, frontendUrl);
    } catch {
      throw new InputError('Некорректный server URL.');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new InputError('Server URL должен быть HTTP(S), без credentials, query и fragment.');
    }
    return url.href;
  });
}

export async function parseSpecification(source: string, frontendUrl: string): Promise<Catalog> {
  let spec: unknown;
  try {
    const document = parseDocument(source, { uniqueKeys: true });
    if (document.errors.length) throw new Error('Invalid YAML');
    spec = document.toJS({ maxAliasCount: 0 });
  } catch {
    throw new InputError('Не удалось прочитать JSON/YAML спецификацию.', 'INVALID_SPECIFICATION');
  }
  checkReferences(spec);
  if (!object(spec) || typeof spec.openapi !== 'string' || !/^3\.(0|1)\./.test(spec.openapi)) {
    throw new InputError('Поддерживается OpenAPI 3.0 и 3.1.', 'INVALID_SPECIFICATION');
  }
  let validated: ObjectValue;
  try {
    validated = (await SwaggerParser.validate(spec as any, {
      resolve: { external: false, file: false, http: false },
      dereference: { circular: 'ignore' },
    })) as ObjectValue;
  } catch {
    throw new InputError('Спецификация не соответствует OpenAPI.', 'INVALID_SPECIFICATION');
  }

  const endpoints: Endpoint[] = [];
  const operations = new Map<string, ObjectValue>();
  const references = new Map<string, string>();
  const operationIds = new Map<string, string>();
  for (const [path, pathItem] of Object.entries(validated.paths ?? {})) {
    if (!object(pathItem)) continue;
    for (const method of methods) {
      const operation = pathItem[method];
      if (!object(operation)) continue;
      const id = `${method.toUpperCase()} ${path}`;
      const endpoint: Endpoint = {
        id,
        method: method.toUpperCase(),
        path,
        servers: serverUrls(
          operation.servers ?? pathItem.servers ?? validated.servers,
          frontendUrl,
        ),
        ...(operation.operationId ? { operationId: operation.operationId } : {}),
      };
      endpoints.push(endpoint);
      operations.set(id, operation);
      references.set(`#/paths/${path.replaceAll('~', '~0').replaceAll('/', '~1')}/${method}`, id);
      if (operation.operationId) {
        if (operationIds.has(operation.operationId))
          throw new InputError('operationId должны быть уникальными.');
        operationIds.set(operation.operationId, id);
      }
    }
  }
  if (!endpoints.length) throw new InputError('В спецификации нет HTTP-операций.');
  if (endpoints.length > 2000) throw new InputError('Допускается не более 2000 HTTP-операций.');

  const operationLinks: Catalog['operationLinks'] = [];
  const warnings: string[] = [];
  for (const [source, operation] of operations) {
    for (const response of Object.values(operation.responses ?? {})) {
      if (!object(response)) continue;
      for (const [name, link] of Object.entries(response.links ?? {})) {
        if (!object(link)) continue;
        const target = link.operationId
          ? operationIds.get(link.operationId)
          : references.get(link.operationRef);
        if (target) operationLinks.push({ source, target, name, provenance: 'openapi-link' });
        else warnings.push(`UNRESOLVED_LINK: ${source} → ${name}`);
      }
    }
  }
  return { title: validated.info.title, endpoints, operationLinks, warnings };
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function matchEndpoint(
  endpoints: Endpoint[],
  method: string,
  requestUrl: string,
): Endpoint | undefined {
  const url = new URL(requestUrl);
  const candidates = endpoints.filter(
    (endpoint) =>
      endpoint.method === method &&
      endpoint.servers.some((server) => {
        const base = new URL(server);
        if (base.origin !== url.origin) return false;
        const path = `${base.pathname.replace(/\/$/, '')}${endpoint.path}`;
        const pattern = path
          .split(/(\{[^}]+\})/)
          .map((part) => (/^\{[^}]+\}$/.test(part) ? '[^/]+' : escape(part)))
          .join('');
        return new RegExp(`^${pattern}$`).test(url.pathname);
      }),
  );
  // OpenAPI prioritizes concrete paths over parameterized paths.
  return candidates.sort(
    (a, b) =>
      (a.path.match(/\{/g)?.length ?? 0) - (b.path.match(/\{/g)?.length ?? 0) ||
      b.path.length - a.path.length,
  )[0];
}
