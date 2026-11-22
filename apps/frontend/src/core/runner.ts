import { z } from 'zod';
import { jobSchema, runSchema, type TestRun } from './model';

const configuredKey = 'faultview.runnerUrl';
const tokenKey = 'faultview.runnerToken';
export function getRunnerBase() {
  let configured = import.meta.env.VITE_RUNNER_URL as string | undefined;
  try {
    configured = localStorage.getItem(configuredKey) || configured;
  } catch {
    /* Connection can still use the local proxy. */
  }
  return configured ? configured.replace(/\/?$/, '/') : '';
}
export function saveRunnerConnection(raw: string, token: string) {
  if (raw.trim()) {
    const url = new URL(raw.trim(), location.origin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Укажите HTTP(S)-адрес runner без логина, пароля и параметров.');
    if (
      location.protocol === 'https:' &&
      url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      throw new Error('Для опубликованного frontend нужен HTTPS-адрес runner.');
    localStorage.setItem(configuredKey, url.href.replace(/\/?$/, '/'));
  } else localStorage.removeItem(configuredKey);
  if (token) sessionStorage.setItem(tokenKey, token);
  else sessionStorage.removeItem(tokenKey);
}
function headers(json: boolean): Record<string, string> {
  let token = '';
  try {
    token = sessionStorage.getItem(tokenKey) ?? '';
  } catch {
    /* A local runner does not require a token. */
  }
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
export async function runnerRequest(path: string, options: RequestInit = {}) {
  const base = getRunnerBase();
  if (!base) throw new Error('Подключите Playwright runner в разделе «Подключение Playwright».');
  let response: Response;
  try {
    response = await fetch(new URL(path.replace(/^\//, ''), base), {
      ...options,
      headers: headers(options.body !== undefined),
      signal: options.signal ?? AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error(
      'Playwright runner недоступен. Проверьте адрес, запуск сервера и разрешённый Origin клиента.',
      { cause: error },
    );
  }
  if (!response.ok) {
    const value = (await response.json().catch(() => undefined)) as
      { message?: string } | undefined;
    throw new Error(value?.message ?? `Runner вернул HTTP ${response.status}.`);
  }
  return response.json() as Promise<unknown>;
}
export async function runnerImage(runId: string, key: string, signal: AbortSignal) {
  if (!/^[0-9a-f-]{36}$/i.test(runId) || !/^\d+-(baseline|fault|final)$/.test(key))
    throw new Error('Некорректная ссылка на скриншот.');
  const base = getRunnerBase();
  if (!base) throw new Error('Для загрузки снимка подключите runner.');
  const response = await fetch(new URL(`runs/${runId}/screenshots/${key}.jpg`, base), {
    headers: headers(false),
    signal,
  });
  if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/'))
    throw new Error(
      'Скриншот недоступен. Проверьте подключение к runner; запуск мог быть удалён из его архива.',
    );
  return response.blob();
}

export function isPlaywrightEnabled(mode?: 'live' | 'simulation') {
  return mode !== 'simulation' && !!getRunnerBase();
}
export const parseRemoteJob = (value: unknown) => jobSchema.extend({ id: z.uuid() }).parse(value);
export const parseRemoteRun = (value: unknown) => runSchema.extend({ id: z.uuid() }).parse(value);

export function screenshotUrl(run: TestRun, key: string) {
  const origin = (run.runnerUrl ?? getRunnerBase()).replace(/\/$/, '');
  if (!origin || !run.remoteId || !/^\d+-(baseline|fault|final)$/.test(key)) return undefined;
  return `${origin}/runs/${run.remoteId}/screenshots/${key}.jpg`;
}
