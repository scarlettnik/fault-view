import { z } from 'zod';
import { jobSchema, runSchema, type TestRun } from './model';

export const runnerUrl =
  (import.meta.env.VITE_RUNNER_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const browserChecksEnabled = !!runnerUrl;

export async function runnerRequest(path: string, options: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`${runnerUrl}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error(
      'Playwright недоступен. Запустите проект командой npm run dev:all и повторите проверку.',
      { cause: error },
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Ошибка Playwright: HTTP ${response.status}`);
  }
  return response.json() as Promise<unknown>;
}
export const parseRemoteJob = (value: unknown) => jobSchema.extend({ id: z.uuid() }).parse(value);
export const parseRemoteRun = (value: unknown) => runSchema.extend({ id: z.uuid() }).parse(value);

export function screenshotUrl(run: TestRun, key: string) {
  const origin = run.runnerUrl ?? runnerUrl;
  if (!origin || !run.remoteId || !/^\d+-(baseline|fault|final)$/.test(key)) return undefined;
  return `${origin}/runs/${run.remoteId}/screenshots/${key}.jpg`;
}
