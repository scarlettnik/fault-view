import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRightIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { dateLabel, downloadJson } from '../core/model';
import { EmptyState, Notice, PageHeading, ProjectExport, StatusBadge } from '../components/ui';
import { useProject } from './ProjectPages';
import { PlanCases } from './PlansPage';
import { ExecutePlan, RunReport } from '../components/Execution';

export function HistoryPage() {
  const project = useProject();
  const [tab, setTab] = useState<'jobs' | 'plans' | 'runs'>(project.runs?.length ? 'runs' : 'jobs');
  return (
    <>
      <PageHeading title="История проекта" actions={<ProjectExport project={project} />} />
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
                          {run.results.filter((result) => result.verdict === 'FAIL').length} FAIL ·{' '}
                          {run.results.filter((result) => result.verdict === 'WARN').length} WARN
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
