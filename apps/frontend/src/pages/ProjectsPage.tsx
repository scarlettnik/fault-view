import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  FolderSimpleIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useAppDispatch, useAppSelector } from '../store';
import { projectRemoved, projectSaved } from '../store/workspace';
import { dateLabel, latestDiscovery, type Project } from '../core/model';
import { ConfirmDialog, EmptyState, Notice, PageHeading, StatusBadge } from '../components/ui';
import { createExampleProject, exampleProjects, exampleUrl } from '../core/examples';
import { selectProjects } from '../store/selectors';
import { isPlaywrightEnabled } from '../core/runner';

export function ProjectsPage() {
  const browserChecksEnabled = useAppSelector((state) =>
    isPlaywrightEnabled(state.workspace.executionMode),
  );
  const projects = useAppSelector(selectProjects);
  const active = useAppSelector((state) => state.workspace.active);
  const activeRun = useAppSelector((state) => state.workspace.activeRun);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState<Project>();
  const [error, setError] = useState('');
  function openExample(id = 'storefront') {
    const existing = projects.find((project) => project.id === id);
    if (!existing) {
      if (projects.length >= 30) {
        setError('Можно сохранить до 30 проектов.');
        return;
      }
      dispatch(projectSaved(createExampleProject(id, browserChecksEnabled)));
    } else if (existing.frontendUrl !== exampleUrl(id) || browserChecksEnabled) {
      const example = createExampleProject(id, browserChecksEnabled);
      dispatch(
        projectSaved({
          ...existing,
          frontendUrl: example.frontendUrl,
          ...(browserChecksEnabled ? { specification: example.specification } : {}),
        }),
      );
    }
    void navigate(`/projects/${id}`);
  }
  return (
    <>
      <PageHeading
        title="Проекты"
        actions={
          <>
            <button
              className="button secondary"
              onClick={() => {
                void openExample();
              }}
            >
              Открыть пример
            </button>
            <Link className="button primary" to="/projects/new">
              <PlusIcon size={17} />
              Новый проект
            </Link>
          </>
        }
      />
      {error ? <Notice kind="error">{error}</Notice> : null}
      <details className="examples-library" open>
        <summary>Шесть исходных проектов для демонстрации</summary>
        <p className="muted">
          {browserChecksEnabled
            ? 'Проверка исходных интерфейсов в Playwright: отказы API, скриншоты и результаты по пунктам.'
            : 'В демо открываются исходные интерфейсы. На GitHub Pages их API заменён локальными ответами; проверки в FaultView остаются учебной симуляцией.'}
        </p>
        <div className="examples-list">
          {exampleProjects.map((example) => (
            <article key={example.id}>
              <h2>{example.name}</h2>
              <button className="button secondary" onClick={() => openExample(example.id)}>
                Проверить {example.name}
              </button>
              <a href={exampleUrl(example.id)} target="_blank" rel="noreferrer">
                Открыть исходный frontend ↗
              </a>
            </article>
          ))}
        </div>
      </details>
      {projects.length ? (
        <div className="project-grid">
          {projects.map((project) => {
            const discovery = latestDiscovery(project);
            return (
              <article className="project-card" key={project.id}>
                <div className="project-card-top">
                  <span className="project-avatar">
                    <FolderSimpleIcon size={25} />
                  </span>
                  <StatusBadge status={project.jobs[0]?.status ?? 'ready'} />
                </div>
                <Link className="project-title" to={`/projects/${project.id}`}>
                  {project.name}
                  <ArrowUpRightIcon size={20} />
                </Link>
                <p className="project-url">{project.frontendUrl}</p>
                <p className="project-description">{project.description || ''}</p>
                <div className="project-card-stats">
                  <span>
                    Страницы <strong>{discovery?.graph?.routes.length ?? '—'}</strong>
                  </span>
                  <span>
                    Связи <strong>{discovery?.graph?.routeDependencies.length ?? '—'}</strong>
                  </span>
                  <span>
                    Графы <strong>{project.jobs.length}</strong>
                  </span>
                </div>
                <div className="project-card-footer">
                  <span>{dateLabel(project.createdAt)}</span>
                  <button
                    className="icon-button"
                    aria-label={`Удалить проект ${project.name}`}
                    disabled={
                      active?.projectId === project.id || activeRun?.projectId === project.id
                    }
                    onClick={() => setDeleting(project)}
                  >
                    <TrashIcon size={17} />
                  </button>
                  <Link
                    aria-label={`Открыть проект ${project.name}`}
                    to={`/projects/${project.id}`}
                    className="icon-button"
                  >
                    <ArrowRightIcon size={19} />
                  </Link>
                </div>
              </article>
            );
          })}
          <Link to="/projects/new" className="add-project-tile">
            <PlusIcon size={25} />
            <span>Подключить приложение</span>
            <small>URL + OpenAPI</small>
          </Link>
        </div>
      ) : (
        <EmptyState
          title="Нет проектов"
          action={
            <Link className="button secondary" to="/projects/new">
              <PlusIcon />
              Добавить свой проект
            </Link>
          }
        >
          Создайте проект с вашей спецификацией или начните с готового Storefront.
        </EmptyState>
      )}
      {deleting ? (
        <ConfirmDialog
          title={`Удалить ${deleting.name}?`}
          confirm="Удалить проект"
          onClose={() => setDeleting(undefined)}
          onConfirm={() => {
            dispatch(projectRemoved(deleting.id));
            setDeleting(undefined);
          }}
        >
          Настройки, история и сохранённые планы будут удалены из этого браузера. Сначала
          экспортируйте данные, если они нужны.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
