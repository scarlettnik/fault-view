import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DownloadSimpleIcon, PlayIcon, StopIcon } from '@phosphor-icons/react';
import { cancelOperation, executePlan } from '../store/operations';
import { usePreparedPlan } from '../hooks/usePreparedPlan';
import {
  allProfiles,
  dateLabel,
  downloadJson,
  latestDiscovery,
  messageFor,
  profileInfo,
  verdicts,
  type CaseResult,
  type SavedPlan,
  type TestRun,
} from '../core/model';
import { MAX_RUN_CASES, planExecutionProblem, previewPlan } from '../core/planning';
import { useAppDispatch, useAppSelector } from '../store';
import { Busy, Notice, StatusBadge } from './ui';
import { CaseEvidence } from './CaseEvidence';

export function ExecutePlan({ saved, projectId }: { saved: SavedPlan; projectId: string }) {
  const { prepare, isPreparing } = usePreparedPlan(projectId);
  const [error, setError] = useState('');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const busy = useAppSelector((store) => !!store.workspace.active || !!store.workspace.activeRun);
  const currentExcluded = useAppSelector(
    (store) =>
      store.workspace.projects.find((project) => project.id === projectId)?.excludedRouteIds,
  );
  const graph = useAppSelector((store) => {
    const project = store.workspace.projects.find((item) => item.id === projectId);
    return project ? latestDiscovery(project)?.graph : undefined;
  });
  const effectiveInput = {
    ...saved.input,
    excludedRouteIds: [...new Set([...saved.input.excludedRouteIds, ...(currentExcluded ?? [])])],
  };
  const preview = graph
    ? previewPlan(graph, effectiveInput)
    : { count: saved.result.cases.length, problem: planExecutionProblem(saved.result) };
  async function start() {
    setError('');
    try {
      const prepared = await prepare(effectiveInput);
      const problem = planExecutionProblem(prepared.result);
      if (problem) throw new Error(problem.message);
      const task = dispatch(executePlan({ projectId, plan: prepared.input }));
      void task.unwrap().catch(() => undefined);
      void navigate(`/projects/${projectId}/runs/${task.requestId}`);
    } catch (value) {
      setError(messageFor(value));
    }
  }
  return (
    <section className="execute-panel">
      <div className="execute-heading">
        <div>
          <h2>Запуск проверок</h2>
          <p className="muted">
            {preview.count} проверок из {MAX_RUN_CASES} доступных за прогон
          </p>
        </div>
        <button
          className="button primary"
          disabled={busy || isPreparing || !!preview.problem}
          onClick={() => {
            void start();
          }}
        >
          {isPreparing ? (
            <Busy>Запускаем…</Busy>
          ) : (
            <>
              <PlayIcon />
              Запустить проверки
            </>
          )}
        </button>
      </div>
      {busy ? (
        <p className="muted">Дождитесь завершения текущего построения графа или тестирования.</p>
      ) : null}
      {preview.problem ? (
        <Notice>
          {preview.problem.message}{' '}
          <Link className="text-link" to={`/projects/${projectId}/plans`}>
            Изменить план
          </Link>
        </Notice>
      ) : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
    </section>
  );
}

export function RunReport({ run, projectId }: { run: TestRun; projectId: string }) {
  const [selection, setSelection] = useState<string>();
  const [filter, setFilter] = useState('all');
  const { prepare, isPreparing } = usePreparedPlan(projectId);
  const [error, setError] = useState('');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const active = useAppSelector((state) => !!state.workspace.active || !!state.workspace.activeRun);
  const currentExcluded = useAppSelector(
    (state) =>
      state.workspace.projects.find((project) => project.id === projectId)?.excludedRouteIds,
  );
  const running = run.status === 'queued' || run.status === 'running';

  const visible = run.results.filter((result) => filter === 'all' || result.verdict === filter);
  const selected = visible.find((result) => result.id === selection) ?? visible[0];
  const counts = Object.fromEntries(
    verdicts.map((verdict) => [
      verdict,
      run.results.filter((result) => result.verdict === verdict).length,
    ]),
  );
  const groups = new Map<string, { routeId: string; endpointId: string; cases: CaseResult[] }>();
  for (const result of run.results) {
    const key = JSON.stringify([result.routeId, result.endpointId]);
    if (!groups.has(key))
      groups.set(key, { routeId: result.routeId, endpointId: result.endpointId, cases: [] });
    groups.get(key)!.cases.push(result);
  }
  async function stop() {
    setError('');
    try {
      await dispatch(cancelOperation({ projectId, kind: 'run' })).unwrap();
    } catch (value) {
      setError(messageFor(value));
    }
  }
  async function retry() {
    setError('');
    try {
      const plan = {
        ...run.plan,
        excludedRouteIds: [...new Set([...run.plan.excludedRouteIds, ...(currentExcluded ?? [])])],
      };
      const prepared = await prepare(plan);
      const problem = planExecutionProblem(prepared.result);
      if (problem) throw new Error(problem.message);
      const task = dispatch(executePlan({ projectId, plan: prepared.input }));
      void task.unwrap().catch(() => undefined);
      void navigate(`/projects/${projectId}/runs/${task.requestId}`);
    } catch (value) {
      setError(messageFor(value));
    }
  }
  return (
    <>
      <Notice>
        {run.source === 'playwright'
          ? 'Браузерная проверка Playwright. Результаты, запросы и снимки получены при открытии проверяемого приложения.'
          : 'Локальная симуляция. Результаты относятся к учебному сценарию, а не к внешнему приложению.'}
      </Notice>
      <div className="run-header">
        <div>
          <StatusBadge status={run.status} label={running ? 'Идут проверки' : undefined} />
          <span className="muted">{dateLabel(run.createdAt)}</span>
        </div>
        <div className="row">
          <button
            className="button secondary"
            onClick={() =>
              downloadJson(`faultview-run-${run.id}.json`, {
                format: 'faultview-run',
                version: 1,
                run,
              })
            }
          >
            <DownloadSimpleIcon />
            Экспорт результатов
          </button>
          {running ? (
            <button
              className="button secondary"
              onClick={() => {
                void stop();
              }}
            >
              <StopIcon />
              Остановить проверки
            </button>
          ) : (
            <button
              className="button primary"
              disabled={active || isPreparing}
              onClick={() => {
                void retry();
              }}
            >
              {isPreparing ? <Busy>Запускаем…</Busy> : 'Повторить проверки'}
            </button>
          )}
        </div>
      </div>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {run.error ? <Notice kind="error">{run.error.message}</Notice> : null}
      <section className="run-progress" aria-label="Прогресс тестирования">
        <div className="section-heading">
          <h2>
            {running
              ? 'Идут проверки…'
              : run.status === 'completed'
                ? 'Тестирование завершено'
                : run.status === 'cancelled'
                  ? 'Тестирование остановлено'
                  : 'Ошибка выполнения'}
          </h2>
          <span className="mono">
            {run.progress.completed} / {run.progress.total}
          </span>
        </div>
        {running ? <progress value={run.progress.completed} max={run.progress.total} /> : null}
      </section>
      <div className="verdict-summary">
        {verdicts.map((verdict) => (
          <button
            key={verdict}
            className={`verdict-metric ${verdict.toLowerCase()} ${filter === verdict ? 'selected' : ''}`}
            aria-pressed={filter === verdict}
            onClick={() => setFilter(filter === verdict ? 'all' : verdict)}
          >
            <strong>{counts[verdict]}</strong>
            <span>{verdict}</span>
          </button>
        ))}
      </div>
      <section className="table-panel results-matrix">
        <div className="table-toolbar">
          <h2>Все результаты</h2>
          {filter !== 'all' ? (
            <button className="text-button" onClick={() => setFilter('all')}>
              Показать все результаты
            </button>
          ) : null}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>СТРАНИЦА / API</th>
                {allProfiles.map((profile) => (
                  <th key={profile}>{profileInfo[profile].name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...groups.values()]
                .filter(
                  (group) =>
                    filter === 'all' || group.cases.some((result) => result.verdict === filter),
                )
                .map((group) => (
                  <tr key={`${group.routeId}:${group.endpointId}`}>
                    <td>
                      <code>{group.routeId}</code>
                      <small>
                        <code>{group.endpointId}</code>
                      </small>
                    </td>
                    {allProfiles.map((profile) => {
                      const item = group.cases.find((result) => result.profile === profile);
                      return (
                        <td key={profile}>
                          {item ? (
                            <button
                              className={`verdict ${item.verdict.toLowerCase()} ${selected?.id === item.id ? 'selected' : ''}`}
                              aria-label={`${group.routeId} ${group.endpointId} ${profileInfo[profile].name}: ${item.verdict}`}
                              onClick={() => {
                                setFilter('all');
                                setSelection(item.id);
                                document
                                  .querySelector('.case-picker')
                                  ?.scrollIntoView({ block: 'start' });
                              }}
                            >
                              {item.verdict}
                            </button>
                          ) : (
                            <span className="muted">
                              {run.plan.profiles.includes(profile) && running ? '…' : '—'}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      {selected ? (
        <>
          <label className="case-picker">
            Проверка
            <select
              aria-label="Проверка"
              value={selected.id}
              onChange={(event) => setSelection(event.target.value)}
            >
              {visible.map((result) => (
                <option key={result.id} value={result.id}>
                  {result.routeId} · {result.endpointId} · {profileInfo[result.profile].name} ·{' '}
                  {result.verdict}
                </option>
              ))}
            </select>
          </label>
          <CaseEvidence result={selected} run={run} />
        </>
      ) : (
        <p role="status" className="matrix-empty">
          {running ? 'Выполняется первая проверка…' : 'Нет результатов.'}
        </p>
      )}

      {run.warnings.length ? (
        <details className="check-settings">
          <summary>Ограничения проверки ({run.warnings.length})</summary>
          {run.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </details>
      ) : null}
      <p className="run-footnote">
        <Link className="text-link" to={`/projects/${projectId}/plans`}>
          Настроить новый прогон
        </Link>
      </p>
    </>
  );
}
