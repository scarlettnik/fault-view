import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRightIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { dateLabel, downloadJson, messageFor, profileInfo, type TestRun } from '../core/model';
import {
  Busy,
  EmptyState,
  Notice,
  PageHeading,
  ProjectExport,
  StatusBadge,
} from '../components/ui';
import { useProject } from './ProjectPages';
import { PlanCases } from './PlansPage';
import { ExecutePlan, RunReport } from '../components/Execution';
import { useAppDispatch } from '../store';
import { compareServerRuns, loadRun } from '../store/server';
import { serverMode } from '../core/workspaceApi';
import type { RunComparison } from '../core/comparison';

export function HistoryPage() {
  const project = useProject();
  const [tab, setTab] = useState<'jobs' | 'plans' | 'runs'>(project.runs?.length ? 'runs' : 'jobs');
  const canCompare =
    serverMode && (project.runs?.filter((item) => item.status === 'completed').length ?? 0) >= 2;
  return (
    <>
      <PageHeading
        title="История проекта"
        actions={
          <>
            {canCompare ? (
              <Link className="button secondary" to={`/projects/${project.id}/runs/compare`}>
                Сравнить прогоны
              </Link>
            ) : null}
            <ProjectExport project={project} />
          </>
        }
      />
      <div className="table-panel">
        <div className="table-toolbar">
          <div className="segmented">
            <button
              className={tab === 'jobs' ? 'selected' : ''}
              aria-pressed={tab === 'jobs'}
              onClick={() => setTab('jobs')}
            >
              Графы<span>{project.jobs.length}</span>
            </button>
            <button
              className={tab === 'plans' ? 'selected' : ''}
              aria-pressed={tab === 'plans'}
              onClick={() => setTab('plans')}
            >
              Планы<span>{project.plans.length}</span>
            </button>
            <button
              className={tab === 'runs' ? 'selected' : ''}
              aria-pressed={tab === 'runs'}
              onClick={() => setTab('runs')}
            >
              Тестирование<span>{project.runs?.length ?? 0}</span>
            </button>
          </div>
        </div>
        {tab === 'jobs' ? (
          project.jobs.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ГРАФ</th>
                    <th>СОСТОЯНИЕ</th>
                    <th>СТРАНИЦЫ / СВЯЗИ</th>
                    <th>
                      <span className="sr-only">Открыть</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {project.jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <Link
                          className="table-link"
                          to={`/projects/${project.id}/discoveries/${job.id}`}
                        >
                          {dateLabel(job.createdAt)}
                        </Link>
                        <small className="mono">{job.id.slice(0, 8)}</small>
                      </td>
                      <td>
                        <StatusBadge status={job.status} />
                      </td>
                      <td>
                        <span className="mono">
                          {job.graph?.routes.length ?? job.progress.completed} /{' '}
                          {job.graph?.routeDependencies.length ?? '—'}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="icon-button"
                          aria-label={`Открыть граф ${job.id.slice(0, 8)}`}
                          to={`/projects/${project.id}/discoveries/${job.id}`}
                        >
                          <ArrowRightIcon />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Графов пока нет"
              action={
                <Link className="button primary" to={`/projects/${project.id}`}>
                  Построить граф
                </Link>
              }
            >
              Постройте локальный граф для примера.
            </EmptyState>
          )
        ) : null}
        {tab === 'plans' ? (
          project.plans.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>СОЗДАН</th>
                    <th>НАПРАВЛЕНИЕ</th>
                    <th>КОМБИНАЦИИ</th>
                    <th>
                      <span className="sr-only">Открыть</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {project.plans.map((plan) => (
                    <tr key={plan.id}>
                      <td>
                        <Link
                          className="table-link"
                          to={`/projects/${project.id}/plans/${plan.id}`}
                        >
                          {dateLabel(plan.createdAt)}
                        </Link>
                        <small className="mono">{plan.id.slice(0, 8)}</small>
                      </td>
                      <td>
                        {plan.input.mode === 'route' ? 'От страницы' : 'От endpoint'}
                        <small>
                          <code>{plan.input.targetId}</code>
                        </small>
                      </td>
                      <td>
                        <strong>{plan.result.cases.length}</strong>
                      </td>
                      <td>
                        <Link
                          className="icon-button"
                          aria-label={`Открыть план ${plan.id.slice(0, 8)}`}
                          to={`/projects/${project.id}/plans/${plan.id}`}
                        >
                          <ArrowRightIcon />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Сохранённых планов пока нет"
              action={
                <Link className="button secondary" to={`/projects/${project.id}/plans`}>
                  Настроить каскад
                </Link>
              }
            >
              Сформируйте план по завершённому графу зависимостей.
            </EmptyState>
          )
        ) : null}
        {tab === 'runs' ? (
          project.runs?.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ПРОГОН</th>
                    <th>СОСТОЯНИЕ</th>
                    <th>РЕЗУЛЬТАТЫ</th>
                    <th>ОТКРЫТЬ</th>
                  </tr>
                </thead>
                <tbody>
                  {project.runs.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <Link className="table-link" to={`/projects/${project.id}/runs/${run.id}`}>
                          {dateLabel(run.createdAt)}
                        </Link>
                        <small>
                          <code>{run.plan.targetId}</code>
                        </small>
                      </td>
                      <td>
                        <StatusBadge status={run.status} />
                      </td>
                      <td>
                        <span className="mono">
                          {run.progress.completed} / {run.progress.total}
                        </span>
                        <small>
                          {run.summary?.failures ??
                            run.results.filter((result) => result.verdict === 'FAIL').length}{' '}
                          FAIL ·{' '}
                          {run.summary?.warnings ??
                            run.results.filter((result) => result.verdict === 'WARN').length}{' '}
                          WARN
                        </small>
                      </td>
                      <td>
                        <Link
                          className="icon-button"
                          aria-label="Открыть результаты"
                          to={`/projects/${project.id}/runs/${run.id}`}
                        >
                          <ArrowRightIcon />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="Проверки ещё не запускались"
              action={
                <Link className="button primary" to={`/projects/${project.id}/plans`}>
                  Настроить тестирование
                </Link>
              }
            >
              Сформируйте каскадный план и нажмите «Запустить проверки».
            </EmptyState>
          )
        ) : null}
      </div>
    </>
  );
}
export function DiscoveryDetailsPage() {
  const project = useProject();
  const { jobId } = useParams();
  const job = project.jobs.find((item) => item.id === jobId);
  if (!job)
    return (
      <>
        <PageHeading title="Граф не найден" />
        <EmptyState
          title="Запись недоступна"
          action={
            <Link className="button primary" to={`/projects/${project.id}/history`}>
              К истории
            </Link>
          }
        >
          Старые записи могут быть удалены при достижении лимита истории.
        </EmptyState>
      </>
    );
  const graph = job.graph;
  return (
    <>
      <PageHeading
        title="Сохранённый граф"
        description={dateLabel(job.createdAt)}
        actions={
          <button
            className="button secondary"
            onClick={() =>
              downloadJson(`faultview-discovery-${job.id}.json`, {
                format: 'faultview-discovery',
                version: 1,
                job,
              })
            }
          >
            <DownloadSimpleIcon />
            Экспорт графа
          </button>
        }
      />
      <div className="details-context">
        <StatusBadge status={job.status} />
        <code>{job.id}</code>
      </div>
      {job.error ? <Notice kind="error">{job.error.message}</Notice> : null}
      {graph ? (
        <>
          <dl className="metric-strip">
            <div>
              <dt>ОБСЛЕДОВАНО</dt>
              <dd>{graph.coverage.visitedPages}</dd>
            </div>
            <div>
              <dt>ОСТАЛОСЬ В ОЧЕРЕДИ</dt>
              <dd>{graph.coverage.pendingPages}</dd>
            </div>
            <div>
              <dt>СВЯЗЕЙ С API</dt>
              <dd>{graph.routeDependencies.length}</dd>
            </div>
            <div>
              <dt>ЛИМИТ СТРАНИЦ</dt>
              <dd>{graph.coverage.maxPages}</dd>
            </div>
          </dl>
          <Notice kind={graph.coverage.complete ? 'success' : 'info'}>
            {graph.coverage.complete
              ? 'Локальный граф построен.'
              : 'Выбранный лимит ограничил число страниц сценария.'}
          </Notice>
          <div className="section-heading">
            <h2>
              Данные сценария <span className="counter">{graph.warnings.length}</span>
            </h2>
          </div>
          {graph.warnings.length ? (
            <ul className="warning-list">
              {graph.warnings.map((warning) => (
                <li key={warning}>
                  <span className="warning-dot" />
                  <p>{warning}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="quiet-panel">В этом графе предупреждений нет.</div>
          )}
          <div className="next-step">
            <div>
              <h3>Исследовать результат</h3>
              <p className="muted">Актуальный граф доступен в разделе зависимостей.</p>
            </div>
            <Link className="button secondary" to={`/projects/${project.id}/dependencies`}>
              Открыть зависимости <ArrowRightIcon />
            </Link>
          </div>
        </>
      ) : (
        <EmptyState
          title={
            job.status === 'cancelled'
              ? 'Построение отменено'
              : job.status === 'failed'
                ? 'Граф не получен'
                : 'Граф ещё строится'
          }
          action={
            <Link className="button secondary" to={`/projects/${project.id}`}>
              К обзору проекта
            </Link>
          }
        >
          Прогресс: {job.progress.completed} из {job.progress.discovered} найденных страниц.
        </EmptyState>
      )}
    </>
  );
}
export function SavedPlanPage() {
  const project = useProject();
  const { planId } = useParams();
  const plan = project.plans.find((item) => item.id === planId);
  return (
    <>
      <PageHeading
        title="Сохранённый каскад"
        description={plan ? dateLabel(plan.createdAt) : undefined}
      />
      {plan ? (
        <>
          <ExecutePlan saved={plan} projectId={project.id} />
          <PlanCases saved={plan} />
        </>
      ) : (
        <EmptyState
          title="План не найден"
          action={
            <Link className="button secondary" to={`/projects/${project.id}/history`}>
              К истории
            </Link>
          }
        >
          Возможно, запись была удалена из локальной истории.
        </EmptyState>
      )}
    </>
  );
}

export function RunDetailsPage() {
  const project = useProject();
  const { runId } = useParams();
  const run = project.runs?.find((item) => item.id === runId);
  if (serverMode && runId)
    return <ServerRunDetails key={runId} projectId={project.id} runId={runId} />;
  return (
    <>
      <PageHeading title="Результаты тестирования" />
      {run ? (
        <RunReport key={run.id} run={run} projectId={project.id} />
      ) : (
        <EmptyState
          title="Прогон не найден"
          action={
            <Link className="button secondary" to={`/projects/${project.id}/history`}>
              К истории
            </Link>
          }
        >
          Запись могла быть вытеснена из локальной истории.
        </EmptyState>
      )}
    </>
  );
}

function ServerRunDetails({ projectId, runId }: { projectId: string; runId: string }) {
  const dispatch = useAppDispatch();
  const [run, setRun] = useState<TestRun>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout>;
    let abort: (() => void) | undefined;
    function update() {
      const task = dispatch(loadRun({ projectId, runId }));
      abort = task.abort;
      void task
        .unwrap()
        .then((value) => {
          if (stopped) return;
          setRun(value);
          setError('');
          if (value.status === 'running' || value.status === 'queued')
            timeout = setTimeout(update, 1200);
        })
        .catch((value: unknown) => {
          if (!stopped) setError(messageFor(value));
        });
    }
    update();
    return () => {
      stopped = true;
      clearTimeout(timeout);
      abort?.();
    };
  }, [dispatch, projectId, runId, retry]);
  return (
    <>
      <PageHeading title="Результаты тестирования" />
      {error ? (
        <>
          <Notice kind="error">{error}</Notice>
          <button
            className="button secondary"
            onClick={() => {
              setError('');
              setRetry(retry + 1);
            }}
          >
            Повторить загрузку
          </button>
        </>
      ) : null}
      {run ? (
        <RunReport key={run.id} run={run} projectId={projectId} />
      ) : !error ? (
        <Busy>Загружаем отчёт…</Busy>
      ) : null}
    </>
  );
}

const changeLabels = {
  improved: 'Улучшение',
  regressed: 'Регрессия',
  unchanged: 'Без изменений',
  inconclusive: 'Недостаточно данных',
  added: 'Новая проверка',
  removed: 'Только в исходном',
} as const;

export function CompareRunsPage() {
  const project = useProject();
  const dispatch = useAppDispatch();
  const completed = project.runs?.filter((run) => run.status === 'completed') ?? [];
  const [baselineId, setBaseline] = useState('');
  const [candidateId, setCandidate] = useState('');
  const [result, setResult] = useState<RunComparison>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const baseline = completed.some((run) => run.id === baselineId)
    ? baselineId
    : (completed[1]?.id ?? '');
  const candidate = completed.some((run) => run.id === candidateId)
    ? candidateId
    : (completed[0]?.id ?? '');
  const activeResult =
    result?.baselineId === baseline && result.candidateId === candidate ? result : undefined;

  async function compare() {
    setBusy(true);
    setError('');
    try {
      setResult(
        await dispatch(compareServerRuns({ projectId: project.id, baseline, candidate })).unwrap(),
      );
    } catch (value) {
      setError(messageFor(value));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeading
        title="Сравнение прогонов"
        actions={
          <Link className="button secondary" to={`/projects/${project.id}/history`}>
            К истории
          </Link>
        }
      />
      {completed.length < 2 ? (
        <EmptyState title="Нужны два завершённых прогона">
          Запустите проверку ещё раз, чтобы увидеть изменения.
        </EmptyState>
      ) : (
        <form
          className="comparison-controls"
          onSubmit={(event) => {
            event.preventDefault();
            void compare();
          }}
        >
          <div className="field">
            <label htmlFor="comparison-baseline">Исходный прогон</label>
            <select
              id="comparison-baseline"
              disabled={busy}
              value={baseline}
              onChange={(event) => setBaseline(event.target.value)}
            >
              {completed.map((run) => (
                <option key={run.id} value={run.id}>
                  {dateLabel(run.createdAt)} · {run.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="comparison-candidate">Прогон для сравнения</label>
            <select
              id="comparison-candidate"
              disabled={busy}
              value={candidate}
              onChange={(event) => setCandidate(event.target.value)}
            >
              {completed.map((run) => (
                <option key={run.id} value={run.id}>
                  {dateLabel(run.createdAt)} · {run.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="button primary"
            disabled={busy || !baseline || !candidate || baseline === candidate}
          >
            {busy ? 'Сравниваем…' : 'Сравнить'}
          </button>
        </form>
      )}
      {baseline && baseline === candidate ? <Notice>Выберите два разных прогона.</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      {activeResult ? <ComparisonResults result={activeResult} /> : null}
    </>
  );
}

function ComparisonResults({ result }: { result: RunComparison }) {
  const regressions = result.cases.filter((row) => row.change === 'regressed').length;
  const improvements = result.cases.filter((row) => row.change === 'improved').length;
  return (
    <>
      {result.settingsChanged ? (
        <Notice>Настройки проверок изменились. Учитывайте это при оценке различий.</Notice>
      ) : null}
      <Notice kind="success">
        Сравнение готово. Регрессий: {regressions}. Улучшений: {improvements}.
      </Notice>
      {result.cases.length ? (
        <div className="table-panel table-scroll">
          <table>
            <caption className="sr-only">Результаты сопоставления проверок</caption>
            <thead>
              <tr>
                <th scope="col">Страница и API</th>
                <th scope="col">Профиль</th>
                <th scope="col">Было</th>
                <th scope="col">Стало</th>
                <th scope="col">Изменение</th>
              </tr>
            </thead>
            <tbody>
              {result.cases.map((row) => (
                <tr key={JSON.stringify([row.routeId, row.endpointId, row.profile])}>
                  <th scope="row">
                    <code>{row.routeId}</code>
                    <small>{row.endpointId}</small>
                  </th>
                  <td>{profileInfo[row.profile].name}</td>
                  <td>
                    {row.baseline ? (
                      <>
                        <strong>{row.baseline.verdict}</strong>
                        <small>{row.baseline.reason}</small>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {row.candidate ? (
                      <>
                        <strong>{row.candidate.verdict}</strong>
                        <small>{row.candidate.reason}</small>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{changeLabels[row.change]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="В этих прогонах нет проверок" />
      )}
    </>
  );
}
