import { useState } from 'react';
import { profileInfo, type CaseResult, type TestRun } from '../core/model';
import { screenshotUrl } from '../core/runner';

function Screenshot({ src, caption }: { src: string; caption: string }) {
  const [failedSource, setFailedSource] = useState('');
  return (
    <figure className="evidence-screenshot">
      <figcaption>{caption}</figcaption>
      {failedSource === src ? (
        <p role="status" className="screenshot-unavailable">
          Снимок недоступен. Убедитесь, что сервер Playwright запущен и его папка данных сохранена.
        </p>
      ) : (
        <a href={src} target="_blank" rel="noreferrer" aria-label={`Открыть скриншот: ${caption}`}>
          <img src={src} alt={caption} loading="lazy" onError={() => setFailedSource(src)} />
        </a>
      )}
    </figure>
  );
}

function ScenarioPreview({ state }: { state: CaseResult['previewState'] }) {
  return (
    <div className={`scenario-preview ${state}`} aria-label="Предпросмотр локального сценария">
      <h3>
        {state === 'ready'
          ? 'Каталог'
          : state === 'loading'
            ? 'Загрузка данных…'
            : state === 'fallback'
              ? 'Резервное состояние'
              : 'Данные недоступны'}
      </h3>
      {state === 'ready' ? (
        <ul>
          <li>Studio headphones</li>
          <li>Mechanical keyboard</li>
          <li>Portable speaker</li>
        </ul>
      ) : (
        <p>
          {state === 'loading'
            ? 'Сценарий незавершённой загрузки'
            : state === 'fallback'
              ? 'Основное содержимое доступно, рекомендации скрыты.'
              : 'Сценарий обработанной ошибки API'}
        </p>
      )}
    </div>
  );
}

export function CaseEvidence({ result, run }: { result: CaseResult; run: TestRun }) {
  const browser = result.source === 'playwright';
  const shots = [
    { key: result.baselineScreenshot, caption: 'До отказа · исходное состояние' },
    { key: result.faultScreenshot, caption: 'Во время отказа API' },
    {
      key: result.screenshot,
      caption:
        result.profile === 'recovery'
          ? 'После восстановления API'
          : result.profile === 'healthy'
            ? 'Результат · без отказа'
            : 'Результат · после отказа API',
    },
  ].flatMap((shot) => {
    const src = shot.key ? screenshotUrl(run, shot.key) : undefined;
    return src ? [{ ...shot, src }] : [];
  });
  const counts = { passed: 0, failed: 0, warning: 0, skipped: 0 };
  for (const assertion of result.assertions) counts[assertion.status]++;
  return (
    <section className="case-evidence" aria-label="Доказательства проверки">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {browser ? 'Браузерная проверка · Playwright' : 'Учебный сценарий'}
          </p>
          <h2>
            <code>{result.routeId}</code> · {profileInfo[result.profile].name}
          </h2>
          <p className="muted">
            <code>{result.endpointId}</code>
          </p>
        </div>
        <span className={`verdict ${result.verdict.toLowerCase()}`}>{result.verdict}</span>
      </div>
      <p className="evidence-reason">{result.reason}</p>
      {browser ? (
        <>
          <dl className="evidence-facts">
            <div>
              <dt>Длительность</dt>
              <dd>{(result.durationMs / 1000).toFixed(1)} с</dd>
            </div>
            <div>
              <dt>Запросов API</dt>
              <dd>{result.observedRequests}</dd>
            </div>
            <div>
              <dt>Применено отказов</dt>
              <dd>{result.injectedRequests}</dd>
            </div>
            <div>
              <dt>Ошибок JavaScript</dt>
              <dd>{result.pageErrors}</dd>
            </div>
          </dl>
          {result.baseline && result.observedUi ? (
            <section className="baseline-comparison" aria-label="Сравнение с исходной страницей">
              <h3>До отказа → результат</h3>
              <p>
                Символов контента: {result.baseline.contentCharacters} →{' '}
                {result.observedUi.contentCharacters}. Заголовков: {result.baseline.headings} →{' '}
                {result.observedUi.headings}. Доступных действий: {result.baseline.enabledControls}{' '}
                → {result.observedUi.enabledControls}.
              </p>
              <p>
                Загрузка: {result.observedUi.loading ? 'не завершилась' : 'завершена'}.
                Незавершённых запросов: {result.observedUi.pendingRequests}.
              </p>
            </section>
          ) : null}
        </>
      ) : result.verdict !== 'SKIP' ? (
        <ScenarioPreview state={result.previewState} />
      ) : null}
      <section className="assertion-results" aria-label="Проверки по пунктам">
        <h3>Проверки по пунктам</h3>
        <p className="assertion-summary">
          Пройдено: {counts.passed} · Не пройдено: {counts.failed} · Внимание: {counts.warning} · Не
          проверено: {counts.skipped}
        </p>
        {result.assertions.map((assertion) => (
          <article key={assertion.id} className={`assertion-result ${assertion.status}`}>
            <span className="assertion-status">
              {
                {
                  passed: 'ПРОЙДЕНО',
                  failed: 'НЕ ПРОЙДЕНО',
                  warning: 'ВНИМАНИЕ',
                  skipped: 'НЕ ПРОВЕРЕНО',
                }[assertion.status]
              }
            </span>
            <div>
              <h4>{assertion.label}</h4>
              <p>
                <strong>Ожидалось:</strong> {assertion.expected}
              </p>
              <p>
                <strong>Получено:</strong> {assertion.actual}
              </p>
            </div>
          </article>
        ))}
        {!result.assertions.length ? (
          <p className="muted">
            В этом прогоне подробные проверки не сохранены. Повторите проверку для получения
            результатов по пунктам.
          </p>
        ) : null}
      </section>
      {browser ? (
        <section aria-label="Скриншоты проверяемой страницы" className="screenshots-section">
          <h3>Скриншоты страницы</h3>
          {shots.length ? (
            <div className="screenshot-grid">
              {shots.map((shot) => (
                <Screenshot key={shot.src} src={shot.src} caption={shot.caption} />
              ))}
            </div>
          ) : (
            <p className="muted">
              {result.verdict === 'SKIP'
                ? 'Проверка пропущена; сохранённых снимков нет.'
                : 'Скриншоты не сохранены в этом прогоне. Повторите проверку с запущенным Playwright.'}
            </p>
          )}
        </section>
      ) : null}
      <div className="network-evidence">
        <h3>{browser ? 'Запросы API' : 'События сценария'}</h3>
        {result.network.map((event, index) => (
          <div key={index}>
            <code>{event.endpointId}</code>
            <span className={event.failed || (event.status ?? 0) >= 400 ? 'network-failed' : ''}>
              {event.failed ? 'Обрыв запроса' : `HTTP ${event.status}`} ·{' '}
              {event.phase === 'restored' ? 'после восстановления' : 'проверка профиля'}
            </span>
          </div>
        ))}
        {!result.network.length ? <p className="muted">Запросы не зафиксированы.</p> : null}
      </div>
      {result.pageErrorMessages.length ? (
        <details className="check-settings">
          <summary>Ошибки JavaScript ({result.pageErrorMessages.length})</summary>
          {result.pageErrorMessages.map((message, index) => (
            <p key={index}>{message}</p>
          ))}
        </details>
      ) : null}
    </section>
  );
}
