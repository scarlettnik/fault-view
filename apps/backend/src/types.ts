import type { Graph } from '../../frontend/src/core/model.ts';
export type {
  Profile,
  Job,
  PlanInput,
  Graph as DependencyGraph,
} from '../../frontend/src/core/model.ts';
export type Catalog = Pick<Graph, 'title' | 'endpoints' | 'operationLinks' | 'warnings'>;
export type Endpoint = Graph['endpoints'][number];
export interface DiscoveryInput {
  frontendUrl: string;
  maxPages: number;
  catalog: Catalog;
}
export const profiles = [
  'healthy',
  'latency',
  'http500',
  'http503',
  'timeout',
  'networkError',
  'recovery',
] as const;
export class InputError extends Error {
  constructor(
    message: string,
    public code = 'INVALID_INPUT',
    public statusCode = 400,
  ) {
    super(message);
  }
}
export const notFound = () => new InputError('Ресурс не найден.', 'NOT_FOUND', 404);
