import { z } from 'zod';

const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
export const serverMode = !!configured;
const apiBase = configured
  ? new URL(configured.replace(/\/?$/, '/'), window.location.origin)
  : undefined;
export const projectPath = (id: string) => 'projects/' + encodeURIComponent(id);

export function apiUrl(path: string) {
  if (!apiBase) throw new Error('Адрес API не настроен.');
  return new URL(path, apiBase).href;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const errorSchema = z.object({
  message: z.string(),
  fields: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  {
    method = 'GET',
    body,
    signal,
  }: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15_000)]),
      credentials: 'include',
      redirect: 'error',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('Сервер недоступен. Проверьте подключение и повторите попытку.', 0);
  }
  const value: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = errorSchema.safeParse(value);
    const message = error.success
      ? (error.data.fields?.[0]?.message ?? error.data.message)
      : 'Сервер вернул ошибку (' + response.status + ').';
    throw new ApiError(message, response.status);
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError('Сервер вернул данные в неподдерживаемом формате.', 502);
  return result.data;
}
