import { createHash } from 'node:crypto';
import type { Page } from 'playwright';

export interface UiChecks {
  readySelector: string;
  errorSelector: string;
  degradedSelector: string;
}
export interface Assertion {
  id: string;
  label: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  expected: string;
  actual: string;
}
export interface UiSummary {
  contentCharacters: number;
  headings: number;
  enabledControls: number;
  loading: boolean;
  pendingRequests: number;
  pageErrors: number;
  navigationOk: boolean;
  navigationLinks?: number;
  retryControls?: number;
}
export interface UiObservation {
  ready: boolean;
  error: boolean;
  degraded: boolean;
  summary: UiSummary;
  assertions: Assertion[];
  headingHashes: string[];
  customReady: boolean;
  // Structural collection keys stay inside the evaluator; exports contain counts only.
  collections?: { key: string; count: number; itemHashes?: string[] }[];
}
interface Activity {
  pending: () => number;
  pageErrors: () => number;
  navigationOk: boolean;
}

async function capture(page: Page, checks: UiChecks, activity: Activity): Promise<UiObservation> {
  const dom = await page.evaluate(() => {
    // Object methods remain self-contained when tsx preserves function names;
    // named arrow helpers can otherwise reference tsx's __name inside Chromium.
    const domTools = {
      visible(element: Element) {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) !== 0 &&
          ((box.width > 0 && box.height > 0) || style.display === 'contents')
        );
      },
    };
    const main =
      document.querySelector('main,[role="main"]') ??
      document.querySelector('#root,#app') ??
      document.body;
    const text = domTools.visible(main)
      ? ((main as HTMLElement).innerText?.trim().slice(0, 50_000) ?? '')
      : '';
    const headings = [...main.querySelectorAll('h1,h2,[role="heading"]')]
      .filter(domTools.visible)
      .slice(0, 50)
      .map((element) => (element.textContent ?? '').trim().slice(0, 200));
    const primaryHeadings = [...main.querySelectorAll('h1,[role="heading"][aria-level="1"]')]
      .filter(domTools.visible)
      .map((element) => (element.textContent ?? '').trim().slice(0, 200));
    const failure =
      /(?:could(?:n['’]t| not)|can(?:n?ot|'t)|unable to|failed to)\s+(?:load|fetch|open|display)|something went wrong|^(?:error|ошибка)(?:\s*[:\d]|$)|не удалось (?:загрузить|открыть|получить|отобразить)|произошла ошибка|не (?:могу|можем) загрузить|страница недоступна/i;
    const unavailable = /unavailable|temporarily|try again|не удалось|недоступ|повторите|ошибка/i;
    const loadingText = /^(?:loading|please wait|загрузка|загружаем|подождите)(?:\b|[.…])/i;
    const alerts = [
      ...main.querySelectorAll(
        '[role="alert"],[role="status"],.notice,.alert,.error,.error-message',
      ),
    ]
      .filter(domTools.visible)
      .map((element) => (element.textContent ?? '').trim().slice(0, 300));
    const inlineError = alerts.some(
      (value) => failure.test(value) || /server returned code\s+(?:[45]\d\d|0)\b/i.test(value),
    );
    const collections = [...main.querySelectorAll('tbody,ul,ol,[role="list"],.list-group')]
      .filter(domTools.visible)
      .slice(0, 100)
      .map((element) => {
        const parts: string[] = [];
        for (let node: Element | null = element; node && node !== main; node = node.parentElement) {
          const siblings = node.parentElement
            ? [...node.parentElement.children].filter((item) => item.tagName === node!.tagName)
            : [node];
          parts.unshift(`${node.tagName}:${siblings.indexOf(node)}`);
        }
        const items = [...element.children].filter(
          (item) =>
            domTools.visible(item) &&
            !!item.textContent?.trim() &&
            (element.tagName !== 'TBODY' ||
              (!!item.querySelector('td') && !item.querySelector('td[colspan]'))),
        );
        return {
          key: parts.join('/'),
          count: items.length,
          samples: items
            .slice(0, 50)
            .map((item) =>
              ((item as HTMLElement).innerText ?? item.textContent ?? '')
                .trim()
                .replace(/\s+/g, ' '),
            ),
        };
      });
    const stateTools = {
      has(selector: string) {
        return (
          (main.matches(selector) && domTools.visible(main)) ||
          [...main.querySelectorAll(selector)].some(domTools.visible)
        );
      },
    };
    const markedError = stateTools.has('[data-faultview-state="error"]');
    const markedFallback = stateTools.has('[data-faultview-state="degraded"]');
    const loading =
      stateTools.has('[aria-busy="true"],[role="progressbar"],[data-faultview-state="loading"]') ||
      alerts.some((value) => loadingText.test(value)) ||
      (text.length < 100 && loadingText.test(text));
    return {
      characters: text.replace(/\s+/g, ' ').length,
      headings,
      primaryHeadings,
      enabledControls: [...main.querySelectorAll('button,input,select,textarea,a[href]')]
        .slice(0, 1000)
        .filter(
          (element) =>
            domTools.visible(element) && !element.matches(':disabled,[aria-disabled="true"]'),
        ).length,
      navigationLinks: [
        ...document.querySelectorAll('header a[href],nav a[href],[role="navigation"] a[href]'),
      ]
        .slice(0, 1000)
        .filter(
          (element) =>
            domTools.visible(element) && element.getAttribute('aria-disabled') !== 'true',
        ).length,
      retryControls: [
        ...main.querySelectorAll(
          'button,[role="button"],a[href],input[type="button"],input[type="submit"]',
        ),
      ]
        .slice(0, 1000)
        .filter(
          (element) =>
            domTools.visible(element) &&
            !element.matches(':disabled,[aria-disabled="true"]') &&
            /retry|try again|повтор|обновить|попробовать/i.test(
              element.getAttribute('aria-label') ?? element.textContent ?? '',
            ),
        ).length,
      collections,
      loading,
      error: markedError || inlineError || primaryHeadings.some((value) => failure.test(value)),
      fallback: markedFallback || alerts.some((value) => unavailable.test(value)),
    };
  });
  const customReady =
    !checks.readySelector || (await page.locator(checks.readySelector).first().isVisible());
  const error =
    dom.error ||
    (!!checks.errorSelector && (await page.locator(checks.errorSelector).first().isVisible()));
  const degraded =
    !error &&
    (dom.fallback ||
      (!!checks.degradedSelector &&
        (await page.locator(checks.degradedSelector).first().isVisible())));
  const summary: UiSummary = {
    contentCharacters: dom.characters,
    headings: dom.headings.length,
    enabledControls: dom.enabledControls,
    loading: dom.loading,
    pendingRequests: activity.pending(),
    pageErrors: activity.pageErrors(),
    navigationOk: activity.navigationOk,
    navigationLinks: dom.navigationLinks,
    retryControls: dom.retryControls,
  };
  return {
    ready:
      customReady &&
      (dom.characters >= 20 || (dom.characters >= 3 && dom.headings.length > 0)) &&
      !dom.loading &&
      !error,
    error,
    degraded,
    summary,
    assertions: [],
    customReady,
    collections: dom.collections.map((item) => ({
      count: item.count,
      key: createHash('sha256').update(item.key).digest('hex'),
      itemHashes: item.samples.map((text) => createHash('sha256').update(text).digest('hex')),
    })),
    // Content stays inside the browser inspection; only counts/check results are exported.
    headingHashes: dom.primaryHeadings.map((heading) =>
      createHash('sha256').update(heading).digest('hex'),
    ),
  };
}

export async function observeUi(
  page: Page,
  checks: UiChecks,
  activity: Activity,
  timeout: number,
): Promise<UiObservation> {
  for (const [name, selector] of Object.entries(checks)) {
    if (!selector) continue;
    try {
      await page.locator(selector).count();
    } catch {
      throw new Error(
        `CHECK_CONFIGURATION: некорректный селектор ${name}. Исправьте его или оставьте поле пустым.`,
      );
    }
  }
  const started = Date.now();
  const until = started + timeout;
  let previous = '';
  let stableSince = started;
  let observation: UiObservation;
  do {
    observation = await capture(page, checks, activity);
    const signature = JSON.stringify([
      observation.summary,
      observation.collections,
      observation.headingHashes,
      observation.customReady,
      observation.error,
      observation.degraded,
    ]);
    if (signature !== previous) {
      previous = signature;
      stableSince = Date.now();
    }
    // A visible shell/body must not finish the check before the API response and rendering.
    if (
      !observation.summary.loading &&
      activity.pending() === 0 &&
      Date.now() - stableSince >= 250 &&
      Date.now() - started >= Math.min(600, timeout)
    )
      break;
    await page.waitForTimeout(75);
  } while (Date.now() < until);
  observation!.summary.pendingRequests = activity.pending();
  return observation!;
}

export function assessUi(
  observation: UiObservation,
  baseline?: UiObservation,
): {
  verdict: 'PASS' | 'WARN' | 'FAIL';
  reason: string;
  assertions: Assertion[];
} {
  const { summary } = observation;
  const content =
    summary.contentCharacters >= 20 || (summary.contentCharacters >= 3 && summary.headings > 0);
  const handledError = observation.error && content && !summary.loading && summary.pageErrors === 0;
  const presentItems = new Set(
    (observation.collections ?? []).flatMap((item) => item.itemHashes ?? []),
  );
  const lostCollections = (baseline?.collections ?? []).filter(
    (before) =>
      before.count > 0 &&
      !(observation.collections ?? []).some(
        (after) => after.key === before.key && after.count > 0,
      ) &&
      !before.itemHashes?.some((hash) => presentItems.has(hash)),
  );
  const reducedContent =
    !!baseline &&
    baseline.summary.contentCharacters >= 80 &&
    summary.contentCharacters < baseline.summary.contentCharacters * 0.4;
  const assertions: Assertion[] = [
    {
      id: 'document',
      label: 'Загрузка страницы',
      status: summary.navigationOk ? 'passed' : handledError ? 'warning' : 'failed',
      expected: 'Страница загружена либо показано контролируемое состояние недоступности',
      actual: summary.navigationOk
        ? 'Страница загружена'
        : handledError
          ? 'Страница вернула HTTP-ошибку, но отобразила обработанное сообщение'
          : 'Ошибка HTTP при загрузке страницы',
    },
    {
      id: 'content',
      label: 'Основной контент',
      status: content ? 'passed' : 'failed',
      expected: 'Видимый текст или заголовок в основном содержимом',
      actual: `${summary.contentCharacters} символов, ${summary.headings} заголовков`,
    },
    {
      id: 'loading',
      label: 'Завершение загрузки',
      status: summary.loading ? 'failed' : 'passed',
      expected: 'Основной контент не остался в состоянии загрузки',
      actual: summary.loading
        ? 'Загрузка не завершилась за время наблюдения'
        : 'Зависшая загрузка не обнаружена',
    },
    {
      id: 'error-handling',
      label: 'Обработка сбоя интерфейсом',
      status: observation.error && !content ? 'failed' : 'passed',
      expected: 'При недоступности данных отображается понятное состояние, интерфейс не пуст',
      actual:
        observation.error && content
          ? 'Показано сообщение о недоступности данных; интерфейс отрисован'
          : observation.error
            ? 'Видимое состояние недоступности не отрисовано'
            : 'Основной интерфейс отображается',
    },
    {
      id: 'javascript',
      label: 'Необработанные исключения',
      status: summary.pageErrors ? 'failed' : 'passed',
      expected: '0 необработанных исключений JavaScript',
      actual: `${summary.pageErrors} исключений`,
    },
  ];
  if (lostCollections.length || reducedContent)
    assertions.push({
      id: 'data-availability',
      label: 'Доступность данных',
      status: 'warning',
      expected:
        'Исходные списки и таблицы остаются доступны либо явно обозначено отсутствие данных',
      actual: lostCollections.length
        ? `Исчезли ранее заполненные списки или таблицы: ${lostCollections.length}. Данные недоступны; проверьте состояние страницы.`
        : 'Объём содержимого сократился более чем на 60%. Доступность исходных данных требует проверки.',
    });
  if (summary.pendingRequests)
    assertions.push({
      id: 'pending-requests',
      label: 'Незавершённые запросы',
      status: 'warning',
      expected: 'Сопоставленные API-запросы завершены',
      actual: `Осталось запросов: ${summary.pendingRequests}; это может быть фоновый опрос, результат требует проверки`,
    });
  if (!observation.customReady && !observation.degraded && !handledError)
    assertions.push({
      id: 'custom-ready',
      label: 'Дополнительный селектор готовности',
      status: 'failed',
      expected: 'Видимый элемент по заданному селектору либо обработанное состояние недоступности',
      actual: 'Элемент не видим',
    });
  if (baseline?.summary.headings && !summary.headings)
    assertions.push({
      id: 'headings',
      label: 'Изменение заголовков',
      status: content ? 'warning' : 'failed',
      expected: `Заголовки присутствуют, как без отказа (${baseline.summary.headings}), либо отображается альтернативное состояние`,
      actual: content
        ? 'Заголовки исчезли, но видимое содержимое осталось'
        : 'Заголовков и видимого содержимого не осталось',
    });
  if (baseline?.summary.enabledControls && !summary.enabledControls)
    assertions.push({
      id: 'controls',
      label: 'Доступность действий',
      status: 'warning',
      expected: `Доступные действия, как без отказа (${baseline.summary.enabledControls})`,
      actual: 'В основном содержимом не осталось доступных действий',
    });
  if (
    baseline?.headingHashes.length &&
    observation.headingHashes.length &&
    !baseline.headingHashes.some((hash) => observation.headingHashes.includes(hash)) &&
    !observation.error
  ) {
    assertions.push({
      id: 'heading-changed',
      label: 'Основной заголовок',
      status: 'warning',
      expected: 'Основной заголовок сохранён относительно страницы без отказа',
      actual: 'Основной заголовок изменился; проверьте снимок страницы',
    });
  }
  if (observation.degraded)
    assertions.push({
      id: 'fallback',
      label: 'Ограниченная работа',
      status: 'warning',
      expected: 'Контент работает без сообщения о недоступности',
      actual: 'Основной контент доступен, но показан fallback',
    });
  if (handledError) {
    const navigationLinks = summary.navigationLinks ?? 0;
    const retryControls = summary.retryControls ?? 0;
    assertions.push({
      id: 'handled-unavailability',
      label: 'Доступность данных',
      status: 'warning',
      expected: 'Данные доступны; при отказе показано объяснение',
      actual:
        'Данные не загрузились, но сбой обработан интерфейсом. Это деградация, а не падение приложения.',
    });
    assertions.push({
      id: 'recovery-controls',
      label: 'Выход из состояния недоступности',
      status: navigationLinks || retryControls ? 'passed' : 'warning',
      expected: 'Видимая навигация или элемент повторной загрузки',
      actual: `Видимых ссылок навигации: ${navigationLinks}; элементов повтора: ${retryControls}. Их выполнение здесь не проверялось.`,
    });
  }
  const failed = assertions.filter((assertion) => assertion.status === 'failed');
  const warnings = assertions.filter((assertion) => assertion.status === 'warning');
  const reason =
    failed[0]?.actual ??
    (handledError
      ? 'Данные недоступны, но сбой обработан: интерфейс показал сообщение и не упал.'
      : warnings[0]?.actual) ??
    'Основной контент доступен, загрузка завершена, ошибок страницы и JavaScript нет.';
  return {
    verdict: failed.length ? 'FAIL' : warnings.length ? 'WARN' : 'PASS',
    reason,
    assertions,
  };
}
