import { chromium, type Browser, type BrowserContext, type Page, type Request } from 'playwright';
import { setTimeout as delay } from 'node:timers/promises';
import type { CaseResult, Graph, PlanInput, UiChecks } from '../../frontend/src/core/model.ts';
import { buildPlan, planExecutionProblem } from '../../frontend/src/core/cascade.ts';
import { assessUi, observeUi, type UiObservation } from './ui-checks.js';
import { matchEndpoint } from './openapi.js';
import { networkPolicy, publicUrl, httpUrl } from './policy.js';
import { InputError, type DiscoveryInput, type Job } from './types.js';

export interface RunnerConfig {
  targetOrigins: string[];
  executablePath?: string;
  chromiumSandbox?: boolean;
  allowDemoAdapters?: boolean;
  navigationTimeoutMs?: number;
  observationMs?: number;
}
export type SaveImage = (key: string, data: Buffer) => Promise<boolean>;
const demoIds = new Set([
  'storefront',
  'petclinic',
  'conduit',
  'todo',
  'robot-shop',
  'react-express-mongodb',
]);
function adaptedDemo(raw: string) {
  const parts = new URL(raw).pathname.split('/');
  const index = parts.indexOf('examples');
  return index >= 0 && demoIds.has(parts[index + 1] ?? '');
}
export function finalizeNetworkEvidence(result: CaseResult) {
  if (result.verdict === 'ERROR') return;
  // An adapter injection confirms that the target request happened, even when
  // Playwright has not emitted its Service Worker request event yet.
  result.observedRequests = Math.max(result.observedRequests, result.injectedRequests);
  const covered =
    result.observedRequests > 0 && (result.profile === 'healthy' || result.injectedRequests > 0);
  result.assertions.push({
    id: 'network',
    label: 'Целевой запрос API',
    status: covered ? 'passed' : 'skipped',
    expected:
      result.profile === 'healthy'
        ? 'Целевой запрос API наблюдался'
        : 'Целевой запрос наблюдался; выбранный отказ применён',
    actual: `Наблюдалось: ${result.observedRequests}; отказов применено: ${result.injectedRequests}.`,
  });
  if (!covered) {
    const reason =
      'Целевой запрос не наблюдался или отказ не был применён. Проверьте OpenAPI и действия, необходимые на странице.';
    if (result.verdict === 'FAIL') result.reason += ' Сценарий отказа API не подтверждён.';
    else {
      result.verdict = 'SKIP';
      result.reason = reason;
    }
  }
}

export class BrowserEngine {
  private browser?: Promise<Browser>;
  private contexts = new Set<BrowserContext>();
  constructor(private config: RunnerConfig) {}
  private useDemoAdapter(url: string) {
    return this.config.allowDemoAdapters !== false && adaptedDemo(url);
  }
  private runUrl(raw: string, profile: string, endpoint?: string) {
    const url = new URL(raw);
    if (this.useDemoAdapter(raw)) {
      url.searchParams.set('fault', profile);
      url.searchParams.set('live', '1');
      if (endpoint) url.searchParams.set('target', endpoint);
      else url.searchParams.delete('target');
    }
    return url.href;
  }
  async close() {
    await Promise.all([...this.contexts].map((context) => context.close().catch(() => undefined)));
    await this.browser?.then((browser) => browser.close());
  }
  private async withPage<T>(
    url: string,
    signal: AbortSignal,
    intercept: Parameters<BrowserContext['route']>[1] | undefined,
    work: (page: Page, warnings: Set<string>) => Promise<T>,
  ) {
    signal.throwIfAborted();
    const policy = networkPolicy(this.config.targetOrigins);
    policy.assert(url);
    this.browser ??= chromium
      .launch({
        headless: true,
        executablePath: this.config.executablePath,
        chromiumSandbox: this.config.chromiumSandbox,
        args: ['--disable-background-networking', '--disable-quic'],
      })
      .catch((error: unknown) => {
        this.browser = undefined;
        throw error;
      });
    const browser = await this.browser;
    signal.throwIfAborted();
    const context = await browser.newContext({
      serviceWorkers: this.useDemoAdapter(url) ? 'allow' : 'block',
      viewport: { width: 1440, height: 900 },
      acceptDownloads: false,
      permissions: [],
    });
    this.contexts.add(context);
    const abort = () => {
      void context.close().catch(() => undefined);
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const warnings = new Set<string>();
    let requests = 0;
    try {
      await context.route('**/*', async (route) => {
        if (
          ++requests > 2000 ||
          !policy.allows(route.request().url()) ||
          !['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())
        ) {
          warnings.add('Часть запросов заблокирована сетевой политикой или лимитом.');
          await route.abort('blockedbyclient');
          return;
        }
        if (intercept) {
          await intercept(route, route.request());
          return;
        }
        const response = await route.fetch({
          maxRedirects: 0,
          maxRetries: 0,
          timeout: this.config.navigationTimeoutMs ?? 10_000,
        });
        try {
          if ([301, 302, 303, 307, 308].includes(response.status())) {
            warnings.add('HTTP-редирект заблокирован; укажите конечный адрес страницы или API.');
            await route.abort('blockedbyclient');
          } else await route.fulfill({ response });
        } finally {
          await response.dispose();
        }
      });
      await context.routeWebSocket('**/*', (socket) => socket.close());
      const page = await context.newPage();
      context.on('page', (popup) => {
        if (popup !== page) void popup.close().catch(() => undefined);
      });
      page.on('dialog', (dialog) => {
        void dialog.dismiss().catch(() => undefined);
      });
      return await work(page, warnings);
    } finally {
      signal.removeEventListener('abort', abort);
      await context.close().catch(() => undefined);
      this.contexts.delete(context);
    }
  }
  async discover(
    input: DiscoveryInput,
    signal: AbortSignal,
    progress: (value: Job['progress']) => void | Promise<void>,
  ): Promise<Graph> {
    const start = publicUrl(input.frontendUrl);
    const base = httpUrl(start);
    const basePath = base.pathname.endsWith('/')
      ? base.pathname
      : base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1);
    const queue = [start];
    const seen = new Set(queue);
    const routes: Graph['routes'] = [];
    const dependencies: Graph['routeDependencies'] = [];
    const warnings = new Set(input.catalog.warnings);
    for (let index = 0; index < queue.length && routes.length < input.maxPages; index++) {
      signal.throwIfAborted();
      const url = queue[index]!;
      const parsed = new URL(url);
      const id = parsed.pathname + parsed.hash;
      const route: Graph['routes'][number] = { id, url, status: 'visited' };
      const observed = new Set<string>();
      try {
        await this.withPage(url, signal, undefined, async (page, blocked) => {
          const pending = new Set<Request>();
          let errors = 0;
          page.on('pageerror', () => errors++);
          page.on('request', (request) => {
            if (!['fetch', 'xhr'].includes(request.resourceType())) return;
            const endpoint = matchEndpoint(
              input.catalog.endpoints,
              request.method(),
              request.url(),
            );
            if (endpoint) {
              observed.add(endpoint.id);
              pending.add(request);
            }
          });
          page.on('requestfinished', (request) => pending.delete(request));
          page.on('requestfailed', (request) => pending.delete(request));
          const response = await page.goto(this.runUrl(url, 'healthy'), {
            waitUntil: 'domcontentloaded',
            timeout: this.config.navigationTimeoutMs ?? 10_000,
          });
          if (this.useDemoAdapter(url))
            await page.locator('html[data-examples-ready]').waitFor({ timeout: 10_000 });
          const good = !!response && response.status() < 400;
          if (!good) route.status = 'error';
          await observeUi(
            page,
            { readySelector: '', errorSelector: '', degradedSelector: '' },
            { pending: () => pending.size, pageErrors: () => errors, navigationOk: good },
            this.config.observationMs ?? 2500,
          );
          const links = await page
            .locator('a[href]')
            .evaluateAll((anchors) =>
              anchors
                .filter((anchor) => !anchor.hasAttribute('download'))
                .map((anchor) => (anchor as HTMLAnchorElement).href),
            );
          for (const link of links) {
            try {
              const target = httpUrl(link);
              if (target.origin !== base.origin || !target.pathname.startsWith(basePath)) continue;
              const canonical = publicUrl(link);
              if (!seen.has(canonical) && seen.size < 100) {
                seen.add(canonical);
                queue.push(canonical);
              }
            } catch {
              /* Non-HTTP links are not pages. */
            }
          }
          for (const warning of blocked) warnings.add(warning);
        });
      } catch (error) {
        signal.throwIfAborted();
        route.status = 'error';
        warnings.add(
          `Страница ${id} не обследована: ${error instanceof Error ? error.message.slice(0, 180) : 'ошибка браузера'}`,
        );
      }
      routes.push(route);
      for (const endpointId of observed)
        dependencies.push({ routeId: id, endpointId, provenance: 'browser-network' });
      await progress({ completed: routes.length, discovered: queue.length });
    }
    return {
      ...input.catalog,
      routes,
      routeDependencies: dependencies,
      warnings: [...warnings],
      coverage: {
        visitedPages: routes.length,
        pendingPages: Math.max(0, queue.length - routes.length),
        maxPages: input.maxPages,
        complete: routes.length === queue.length,
        scope: 'public-linked-pages',
      },
    };
  }
  async execute(
    graph: Graph,
    planInput: PlanInput,
    checks: UiChecks,
    signal: AbortSignal,
    saveImage: SaveImage,
    record: (result: CaseResult) => Promise<void>,
  ) {
    const plan = buildPlan(graph, planInput);
    const problem = planExecutionProblem(plan);
    if (problem) throw new InputError(problem.message, problem.code);
    const baselines = new Map<string, { observation: UiObservation; image?: string }>();
    for (const [index, test] of plan.cases.entries()) {
      signal.throwIfAborted();
      const started = Date.now();
      const url = graph.routes.find((route) => route.id === test.routeId)!.url;
      const endpoint = graph.endpoints.find((item) => item.id === test.endpointId)!;
      const result: CaseResult = {
        ...test,
        id: String(index),
        source: 'playwright',
        verdict: 'ERROR',
        reason: '',
        durationMs: 0,
        observedRequests: 0,
        injectedRequests: 0,
        checks: { ready: false, error: false, degraded: false },
        consoleErrors: 0,
        pageErrors: 0,
        pageErrorMessages: [],
        network: [],
        assertions: [],
        previewState: 'ready',
      };
      const snapshot = async (page: Page, suffix: 'baseline' | 'fault' | 'final') => {
        const key = `${index}-${suffix}`;
        const image = await page.screenshot({ type: 'jpeg', quality: 65, timeout: 5000 });
        return (await saveImage(key, image)) ? key : undefined;
      };
      try {
        let baseline = baselines.get(test.routeId);
        if (!baseline) {
          baseline = await this.withPage(url, signal, undefined, async (page) => {
            const pending = new Set<Request>();
            let pageErrors = 0;
            page.on('pageerror', () => pageErrors++);
            page.on('request', (request) => {
              if (matchEndpoint(graph.endpoints, request.method(), request.url()))
                pending.add(request);
            });
            page.on('requestfinished', (request) => pending.delete(request));
            page.on('requestfailed', (request) => pending.delete(request));
            const response = await page.goto(this.runUrl(url, 'healthy'), {
              waitUntil: 'domcontentloaded',
              timeout: this.config.navigationTimeoutMs ?? 10_000,
            });
            if (this.useDemoAdapter(url))
              await page.locator('html[data-examples-ready]').waitFor({ timeout: 10_000 });
            const observation = await observeUi(
              page,
              checks,
              {
                pending: () => pending.size,
                pageErrors: () => pageErrors,
                navigationOk: !!response && response.status() < 400,
              },
              this.config.observationMs ?? 2500,
            );
            return { observation, image: await snapshot(page, 'baseline') };
          });
          baselines.set(test.routeId, baseline);
        }
        result.baseline = baseline.observation.summary;
        result.baselineScreenshot = baseline.image;
        let injecting = test.profile !== 'healthy';
        let phase: 'fault' | 'restored' = 'fault';
        const adapted = this.useDemoAdapter(url);
        await this.withPage(
          url,
          signal,
          async (route) => {
            const request = route.request();
            const target = matchEndpoint(graph.endpoints, request.method(), request.url());
            if (
              !adapted &&
              injecting &&
              target?.id === test.endpointId &&
              ['fetch', 'xhr'].includes(request.resourceType())
            ) {
              result.injectedRequests++;
              if (test.profile === 'latency') await delay(1200, undefined, { signal });
              else if (test.profile === 'timeout') {
                await delay(2200, undefined, { signal });
                await route.abort('timedout');
                return;
              } else if (test.profile === 'networkError') {
                await route.abort('failed');
                return;
              } else {
                await route.fulfill({
                  status: test.profile === 'http500' ? 500 : 503,
                  contentType: 'application/json',
                  body: '{}',
                });
                return;
              }
            }
            const response = await route.fetch({
              maxRedirects: 0,
              maxRetries: 0,
              timeout: this.config.navigationTimeoutMs ?? 10_000,
            });
            try {
              if ([301, 302, 303, 307, 308].includes(response.status()))
                await route.abort('blockedbyclient');
              else await route.fulfill({ response });
            } finally {
              await response.dispose();
            }
          },
          async (page, warnings) => {
            const pending = new Set<Request>();
            page.on('console', (message) => {
              if (message.type() === 'error') result.consoleErrors++;
            });
            page.on('pageerror', (error) => {
              result.pageErrors++;
              if (result.pageErrorMessages.length < 10)
                result.pageErrorMessages.push(error.message.slice(0, 500));
            });
            page.on('request', (request) => {
              if (!['fetch', 'xhr'].includes(request.resourceType())) return;
              const target = matchEndpoint(graph.endpoints, request.method(), request.url());
              if (target) pending.add(request);
              if (target?.id === test.endpointId) result.observedRequests++;
            });
            page.on('requestfinished', (request) => pending.delete(request));
            page.on('response', (response) => {
              const request = response.request();
              if (!['fetch', 'xhr'].includes(request.resourceType())) return;
              const target = matchEndpoint(graph.endpoints, request.method(), request.url());
              if (!target) return;
              if (result.network.length < 100)
                result.network.push({ endpointId: target.id, status: response.status(), phase });
            });
            page.on('requestfailed', (request) => {
              pending.delete(request);
              const target = matchEndpoint(graph.endpoints, request.method(), request.url());
              if (target && result.network.length < 100)
                result.network.push({ endpointId: target.id, failed: true, phase });
            });
            const navigate = async (profile: string) => {
              const response = await page.goto(this.runUrl(url, profile, endpoint.path), {
                waitUntil: 'domcontentloaded',
                timeout: this.config.navigationTimeoutMs ?? 10_000,
              });
              if (adapted)
                await page.locator('html[data-examples-ready]').waitFor({ timeout: 10_000 });
              return observeUi(
                page,
                checks,
                {
                  pending: () => pending.size,
                  pageErrors: () => result.pageErrors,
                  navigationOk: !!response && response.status() < 400,
                },
                this.config.observationMs ?? 2500,
              );
            };
            let observation = await navigate(test.profile);
            if (adapted && test.profile !== 'healthy')
              result.injectedRequests = await page.evaluate(
                () =>
                  (
                    (window as unknown as { __faultviewInjectionEvents?: unknown[] })
                      .__faultviewInjectionEvents ?? []
                  ).length,
              );
            const assessment = assessUi(observation, baseline!.observation);
            Object.assign(result, assessment);
            result.checks = {
              ready: observation.ready,
              error: observation.error,
              degraded: observation.degraded,
            };
            result.observedUi = observation.summary;
            if (!result.assertions.some((check) => check.id === 'data-availability'))
              result.assertions.push({
                id: 'data-availability',
                label: 'Доступность данных',
                status: 'passed',
                expected: 'Исходные списки и таблицы доступны',
                actual:
                  'Потеря заполненных списков и таблиц относительно исходной страницы не обнаружена.',
              });
            if (result.consoleErrors)
              result.assertions.push({
                id: 'console',
                label: 'Ошибки консоли',
                status: 'warning',
                expected: 'Нет сообщений уровня error',
                actual: `Сообщений error: ${result.consoleErrors}. Они могут сопровождать обработанный отказ API.`,
              });
            if (test.profile === 'recovery') {
              result.faultScreenshot = await snapshot(page, 'fault');
              const faultObserved = result.injectedRequests;
              const before = result.observedRequests;
              const errorCount = result.pageErrors;
              injecting = false;
              phase = 'restored';
              observation = await navigate('healthy');
              observation = {
                ...observation,
                summary: { ...observation.summary, pageErrors: result.pageErrors - errorCount },
              };
              const restored = assessUi(observation, baseline!.observation);
              result.recovered =
                faultObserved > 0 &&
                result.observedRequests > before &&
                restored.verdict === 'PASS';
              result.assertions.push(
                ...restored.assertions.map((check) => ({
                  ...check,
                  id: `restored-${check.id}`,
                  label: `Восстановление: ${check.label}`,
                })),
              );
              result.assertions.push({
                id: 'recovery',
                label: 'Восстановление после сбоя',
                status: result.recovered ? 'passed' : 'failed',
                expected: 'После снятия отказа возвращаются запрос API и исходные данные',
                actual: result.recovered
                  ? 'Повторный запрос выполнен; исходное состояние восстановлено.'
                  : 'Исходное состояние после снятия отказа не восстановилось.',
              });
              result.verdict = result.recovered ? 'PASS' : 'FAIL';
              result.reason = result.recovered
                ? 'После снятия отказа запрос и содержимое страницы восстановились.'
                : 'После снятия отказа страница не восстановилась до исходного состояния.';
              result.observedUi = observation.summary;
            }
            if (assessUi(baseline!.observation).verdict === 'FAIL' && result.verdict === 'PASS') {
              result.verdict = 'WARN';
              result.reason = 'Исходная страница уже содержит проблемы; сравнение ограничено.';
            }
            if (warnings.size)
              result.assertions.push({
                id: 'network-policy',
                label: 'Полнота обхода',
                status: 'warning',
                expected: 'Ресурсы загружены без сетевых ограничений',
                actual: [...warnings].join(' '),
              });
            for (const request of pending) {
              const target = matchEndpoint(graph.endpoints, request.method(), request.url());
              if (target && result.network.length < 100)
                result.network.push({ endpointId: target.id, phase, pending: true });
            }
            result.screenshot = await snapshot(page, 'final');
          },
        );
      } catch (error) {
        signal.throwIfAborted();
        result.verdict = 'ERROR';
        result.reason =
          error instanceof Error
            ? error.message.slice(0, 400)
            : 'Ошибка запуска браузерной проверки.';
      }
      finalizeNetworkEvidence(result);
      result.durationMs = Date.now() - started;
      await record(result);
    }
  }
}
