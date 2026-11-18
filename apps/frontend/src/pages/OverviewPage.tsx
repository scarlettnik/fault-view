import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCodeIcon, GlobeIcon, PlayIcon, StopIcon } from '@phosphor-icons/react';
import { discoverProject, cancelOperation } from '../store/operations';
import { selectBusy } from '../store/selectors';
import { dateLabel, isRunning, latestDiscovery, messageFor } from '../core/model';
import { useAppDispatch, useAppSelector } from '../store';
import { routeExcluded, routeRestored } from '../store/workspace';
import { Notice, PageHeading, ProjectExport, StatusBadge } from '../components/ui';
import { DependencyGraph } from '../components/DependencyGraph';
import { useProject } from './ProjectPages';

export function OverviewPage() {
  const project = useProject();
  const dispatch = useAppDispatch();
  const busy = useAppSelector(selectBusy);
  const [error, setError] = useState('');
  const [showExcluded, setShowExcluded] = useState(false);
  const current = project.jobs[0];
  const running = isRunning(current);
  const graph = latestDiscovery(project)?.graph;
  async function run() {
    setError('');
    try {
      await dispatch(discoverProject(project.id)).unwrap();
    } catch (value) {
      setError(messageFor(value));
    }
  }
  async function stop() {
    if (!current) return;
    setError('');
    try {
      await dispatch(cancelOperation({ projectId: project.id, kind: 'discovery' })).unwrap();
    } catch (value) {
      setError(messageFor(value));
    }
  }
  return (
    <>
      <PageHeading title={project.name} actions={<ProjectExport project={project} />} />
      <div className="project-connection">
        <div>
          <GlobeIcon size={20} />
          <code>{project.frontendUrl}</code>
        </div>
        <div>
          <FileCodeIcon size={20} />
          <code>{project.specificationName}</code>
          <Link to={`/projects/${project.id}/settings`}>Изменить</Link>
        </div>
      </div>
      <div className="overview-actions">
        <div className="row">
          {running ? (
            <button
              className="button secondary"
              onClick={() => {
                void stop();
              }}
            >
              <StopIcon size={17} />
              Отменить построение
            </button>
          ) : (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => {
                void run();
              }}
            >
              <>
                <PlayIcon size={17} weight="fill" />
                {current ? 'Обновить граф' : 'Построить граф'}
              </>
            </button>
          )}
          {graph?.routeDependencies.length ? (
            <Link className="button primary" to={`/projects/${project.id}/plans`}>
              Запустить проверки
            </Link>
          ) : null}
        </div>
        <span className="muted">До {project.maxPages} страниц</span>
      </div>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {current?.error ? <Notice kind="error">{current.error.message}</Notice> : null}
      {current ? (
        <section className="run-progress" aria-label="Состояние построения графа">
          <div className="section-heading">
            <div className="row">
              <StatusBadge status={current.status} />
              <span className="muted">{dateLabel(current.createdAt)}</span>
            </div>
            <span className="mono">
              Страницы: {current.progress.completed} / {current.progress.discovered}
            </span>
          </div>
          {running ? (
            <progress
              value={current.progress.completed}
              max={Math.max(current.progress.discovered, 1)}
              aria-label="Прогресс построения"
            />
          ) : null}
        </section>
      ) : null}
      {graph ? (
        <section aria-label="Локальный граф">
          <dl className="metric-strip">
            <div>
              <dt>СТРАНИЦ</dt>
              <dd>{graph.coverage.visitedPages}</dd>
            </div>
            <div>
              <dt>СВЯЗЕЙ С API</dt>
              <dd>{graph.routeDependencies.length}</dd>
            </div>
            <div>
              <dt>ОПЕРАЦИЙ API</dt>
              <dd>{graph.endpoints.length}</dd>
            </div>
            <div>
              <dt>ПРЕДУПРЕЖДЕНИЙ</dt>
              <dd>{graph.warnings.length}</dd>
            </div>
          </dl>
          {!graph.routeDependencies.length ? (
            <Notice>
              {graph.coverage.visitedPages
                ? 'Нет связей в локальном сценарии.'
                : 'В сценарии нет страниц.'}
            </Notice>
          ) : null}
          {project.excludedRouteIds.length ? (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showExcluded}
                onChange={(event) => setShowExcluded(event.target.checked)}
              />
              Показать исключённые ({project.excludedRouteIds.length})
            </label>
          ) : null}
          <DependencyGraph
            graph={graph}
            projectId={project.id}
            excluded={project.excludedRouteIds}
            search=""
            showExcluded={showExcluded}
            onExclude={(routeId) => dispatch(routeExcluded({ projectId: project.id, routeId }))}
            onRestore={(routeId) => dispatch(routeRestored({ projectId: project.id, routeId }))}
          />
          {graph.warnings.length ? (
            <details className="check-settings">
              <summary>Данные сценария ({graph.warnings.length})</summary>
              <ul className="warning-list">
                {graph.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : !running ? (
        <p className="muted overview-empty">
          Постройте граф учебного сценария по загруженной спецификации.
        </p>
      ) : null}
    </>
  );
}
