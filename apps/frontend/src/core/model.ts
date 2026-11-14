import { z } from 'zod';

export const profileInfo = {
  healthy: { name: 'Healthy', detail: 'Базовое состояние' },
  latency: { name: 'Latency', detail: 'Медленный ответ' },
  http500: { name: 'HTTP 500', detail: 'Внутренняя ошибка' },
  http503: { name: 'HTTP 503', detail: 'Сервис недоступен' },
  timeout: { name: 'Timeout', detail: 'Истекло время ожидания' },
  networkError: { name: 'Network error', detail: 'Соединение прервано' },
  recovery: { name: 'Recovery', detail: 'Восстановление после сбоя' },
} as const;
export type Profile = keyof typeof profileInfo;
export const allProfiles = Object.keys(profileInfo) as Profile[];
export const profileSchema = z.enum([
  'healthy',
  'latency',
  'http500',
  'http503',
  'timeout',
  'networkError',
  'recovery',
]);
export const projectInputSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название проекта.').max(80, 'Не более 80 символов.'),
  description: z.string().max(400).default(''),
  frontendUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => {
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
      } catch {
        return false;
      }
    }, 'Укажите полный HTTP(S) адрес без логина и пароля.'),
  specification: z
    .string()
    .min(1, 'Загрузите файл OpenAPI.')
    .max(900_000, 'Спецификация слишком большая.'),
  specificationName: z.string().min(1, 'Загрузите файл OpenAPI.').max(255),
  maxPages: z.number().int().min(1, 'От 1 до 20 страниц.').max(20, 'От 1 до 20 страниц.'),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;
export const graphSchema = z.object({
  title: z.string(),
  endpoints: z.array(
    z.object({
      id: z.string(),
      method: z.string(),
      path: z.string(),
      operationId: z.string().optional(),
      servers: z.array(z.string()),
    }),
  ),
  operationLinks: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      name: z.string(),
      provenance: z.literal('openapi-link'),
    }),
  ),
  warnings: z.array(z.string()),
  routes: z.array(
    z.object({ id: z.string(), url: z.string(), status: z.enum(['visited', 'error']) }),
  ),
  routeDependencies: z.array(
    z.object({
      routeId: z.string(),
      endpointId: z.string(),
      provenance: z.literal('local-fixture'),
    }),
  ),
  coverage: z.object({
    visitedPages: z.number(),
    pendingPages: z.number(),
    maxPages: z.number(),
    complete: z.boolean(),
    scope: z.literal('local-simulation'),
  }),
});
export type Graph = z.infer<typeof graphSchema>;
export const jobSchema = z.object({
  id: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  progress: z.object({ completed: z.number(), discovered: z.number() }),
  createdAt: z.string(),
  graph: graphSchema.optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type Job = z.infer<typeof jobSchema>;
export const planInputSchema = z.object({
  discoveryId: z.string(),
  mode: z.enum(['route', 'endpoint']),
  targetId: z.string(),
  excludedRouteIds: z.array(z.string()),
  profiles: z.array(profileSchema),
});
export type PlanInput = z.infer<typeof planInputSchema>;
export const planSchema = z.object({
  mode: z.enum(['route', 'endpoint']),
  targetId: z.string(),
  cases: z.array(
    z.object({
      routeId: z.string(),
      endpointId: z.string(),
      profile: profileSchema,
      basis: z.enum(['local-fixture', 'declared-link']),
    }),
  ),
  excludedRouteIds: z.array(z.string()),
  warnings: z.array(z.string()),
  executionStatus: z.literal('planned'),
});
export type Plan = z.infer<typeof planSchema>;
export const savedPlanSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  input: planInputSchema,
  result: planSchema,
});
export type SavedPlan = z.infer<typeof savedPlanSchema>;
export const verdicts = ['PASS', 'WARN', 'FAIL', 'SKIP', 'ERROR'] as const;
export const caseResultSchema = z.object({
  id: z.string(),
  routeId: z.string(),
  endpointId: z.string(),
  profile: profileSchema,
  verdict: z.enum(verdicts),
  reason: z.string(),
  durationMs: z.number(),
  network: z.array(
    z.object({
      endpointId: z.string(),
      status: z.number().optional(),
      failed: z.boolean().optional(),
      phase: z.enum(['fault', 'restored']),
    }),
  ),
  source: z.literal('simulation'),
  previewState: z.enum(['ready', 'unavailable', 'loading', 'fallback']).default('ready'),
  recovered: z.boolean().optional(),
  assertions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        status: z.enum(['passed', 'failed', 'warning', 'skipped']),
        expected: z.string(),
        actual: z.string(),
      }),
    )
    .default([]),
});
export type CaseResult = z.infer<typeof caseResultSchema>;
export const runSchema = z.object({
  source: z.literal('simulation'),
  id: z.string(),
  createdAt: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'cancelled', 'failed']),
  plan: planInputSchema,
  progress: z.object({ completed: z.number(), total: z.number() }),
  results: z.array(caseResultSchema),
  warnings: z.array(z.string()),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type TestRun = z.infer<typeof runSchema>;
export const projectSchema = projectInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  jobs: z.array(jobSchema).max(20),
  excludedRouteIds: z.array(z.string()),
  plans: z.array(savedPlanSchema).max(20),
  runs: z.array(runSchema).max(5).optional(),
});
export type Project = z.infer<typeof projectSchema>;
export const workspaceSchema = z.object({
  version: z.literal(2),
  projects: z.array(projectSchema).max(30),
  importedExampleIds: z.array(z.string()).default([]),
});
export const latestDiscovery = (project: Project) =>
  project.jobs.find((job) => job.status === 'completed' && job.graph);
export const isRunning = (job?: Job) => job?.status === 'running' || job?.status === 'queued';
export const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
export function messageFor(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  )
    return error.message;
  return 'Не удалось выполнить операцию. Повторите действие.';
}

export function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
