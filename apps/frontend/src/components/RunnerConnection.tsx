import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import {
  getRunnerBase,
  runnerRequest,
  saveRunnerConnection,
  isPlaywrightEnabled,
} from '../core/runner';
import { useAppDispatch, useAppSelector } from '../store';
import { executionModeChanged } from '../store/workspace';
import { Notice, PageHeading } from './ui';

export function RunnerConnection() {
  const [url, setUrl] = useState(getRunnerBase);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const mode = useAppSelector((state) =>
    isPlaywrightEnabled(state.workspace.executionMode) ? 'live' : 'simulation',
  );
  const busy = useAppSelector((state) => !!state.workspace.active || !!state.workspace.activeRun);
  const dispatch = useAppDispatch();
  async function connect(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setChecking(true);
    setError('');
    setMessage('');
    try {
      saveRunnerConnection(url, token);
      z.object({
        status: z.literal('ok'),
        source: z.literal('playwright'),
      }).parse(await runnerRequest('health'));
      dispatch(executionModeChanged('live'));
      setMessage('Playwright runner подключён. Новые запуски используют Chromium.');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Не удалось подключить runner.');
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Подключение Playwright"
        description="Runner открывает страницы в Chromium, применяет отказы и сохраняет реальные скриншоты и диагностику."
      />
      <div className="form-width">
        <form
          className="project-form"
          onSubmit={(event) => {
            void connect(event);
          }}
        >
          <div className="field">
            <label htmlFor="runner-url">Адрес runner</label>
            <input
              id="runner-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://runner.example/"
              disabled={busy}
            />
            <p className="muted">
              При общем локальном запуске адрес настроен автоматически. Для GitHub Pages укажите
              отдельный HTTPS-runner.
            </p>
          </div>
          <div className="field">
            <label htmlFor="runner-token">Токен runner</label>
            <input
              id="runner-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={busy}
            />
            <p className="muted">
              Для локального runner необязателен. Токен хранится только в текущей вкладке, отдельно
              от проектов и экспорта.
            </p>
          </div>
          <button className="button primary" disabled={checking || busy}>
            {checking ? 'Проверяем…' : 'Подключить и проверить'}
          </button>
        </form>
        {message ? <Notice>{message}</Notice> : null}
        {error ? <Notice kind="error">{error}</Notice> : null}
        <div className="field">
          <label htmlFor="execution-mode">Режим новых проверок</label>
          <select
            id="execution-mode"
            value={mode}
            disabled={busy}
            onChange={(event) =>
              dispatch(executionModeChanged(event.target.value === 'live' ? 'live' : 'simulation'))
            }
          >
            <option value="live" disabled={!getRunnerBase()}>
              Живой Playwright — скриншоты и измерения
            </option>
            <option value="simulation">Учебная симуляция — без скриншотов</option>
          </select>
        </div>
        <p className="muted">
          Изменение режима не переписывает старые результаты. Чтобы получить снимки для прежнего
          симуляционного запуска, постройте живой граф и выполните новый прогон.
        </p>
      </div>
    </>
  );
}
