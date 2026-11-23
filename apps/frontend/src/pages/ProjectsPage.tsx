import { useEffect, useState } from 'react';
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
import {
  dateLabel,
  latestDiscovery,
  messageFor,
  type Project,
  type ProjectSummary,
} from '../core/model';
import {
  Busy,
  ConfirmDialog,
  EmptyState,
  Notice,
  PageHeading,
  StatusBadge,
} from '../components/ui';
import { createExampleProject, exampleProjects, exampleUrl } from '../core/examples';
import { selectProjects } from '../store/selectors';
import { isPlaywrightEnabled } from '../core/runner';
import { serverMode } from '../core/workspaceApi';
import { deleteProject, loadProjects, openDemo } from '../store/server';

export function ProjectsPage() {
  const browserChecksEnabled = useAppSelector((state) =>
    isPlaywrightEnabled(state.workspace.executionMode),
  );
  const localProjects = useAppSelector(selectProjects);
  const remoteProjects = useAppSelector((state) => state.server.projects);
  const { list, listError, capabilities } = useAppSelector((state) => state.server);
  const examples = capabilities?.examples ?? [];
  const projects: (Project | ProjectSummary)[] = serverMode ? remoteProjects : localProjects;
  const active = useAppSelector((state) => state.workspace.active);
  const activeRun = useAppSelector((state) => state.workspace.activeRun);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState<Project | ProjectSummary>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);
  useEffect(() => {
    if (serverMode) void dispatch(loadProjects());
  }, [dispatch]);
  async function openExample(id = 'storefront') {
    if (serverMode) {
      setPending(true);
      setError('');
      try {
        const project = await dispatch(openDemo(id)).unwrap();
        void navigate('/projects/' + project.id);
      } catch (value) {
        setError(messageFor(value));
      } finally {
        setPending(false);
      }
      return;
    }
    const existing = localProjects.find((project) => project.id === id);
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
  async function remove(project: Project | ProjectSummary) {
    setDeleting(undefined);
    if (!serverMode) {
      dispatch(projectRemoved(project.id));
      return;
    }
    setPending(true);
    setError('');
    setRemoved(false);
    try {
      await dispatch(deleteProject(project.id)).unwrap();
      setRemoved(true);
    } catch (value) {
      setError(messageFor(value));
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Проекты"
        actions={
          <>
            {serverMode ? null : (
              <button
                className="button secondary"
                disabled={pending}
                onClick={() => {
                  void openExample();
                }}
              >
                Открыть пример
              </button>
            )}
            <Link className="button primary" to="/projects/new">
              <PlusIcon size={17} />
              Новый проект
            </Link>
          </>
        }
      />
      {error ? <Notice kind="error">{error}</Notice> : null}
      {removed ? <Notice kind="success">Проект удалён.</Notice> : null}
      {serverMode ? null : (
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
                <button className="button secondary" onClick={() => void openExample(example.id)}>
                  Проверить {example.name}
                </button>
                <a href={exampleUrl(example.id)} target="_blank" rel="noreferrer">
                  Открыть исходный frontend ↗
                </a>
              </article>
            ))}
          </div>
        </details>
      )}
      {serverMode && (list === 'idle' || list === 'loading') && !projects.length ? (
        <Busy>Загружаем проекты…</Busy>
      ) : serverMode && list === 'error' ? (
        <>
          <Notice kind="error">{listError}</Notice>
          <button className="button secondary" onClick={() => void dispatch(loadProjects())}>
            Повторить
          </button>
        </>
      ) : projects.length ? (
        <div className="project-grid">
          {projects.map((project) => {
            const discovery = 'jobs' in project ? latestDiscovery(project) : undefined;
            const status =
              'jobs' in project ? project.jobs[0]?.status : project.latestDiscoveryStatus;
            return (
              <article className="project-card" key={project.id}>
                <div className="project-card-top">
                  <span className="project-avatar">
                    <FolderSimpleIcon size={25} />
                  </span>
                  <StatusBadge status={status ?? 'ready'} />
                </div>
                <Link className="project-title" to={`/projects/${project.id}`}>
                  {project.name}
                  <ArrowUpRightIcon size={20} />
                </Link>
                <p className="project-url">{project.frontendUrl}</p>
                <p className="project-description">{project.description || ''}</p>
                {'jobs' in project ? (
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
                ) : null}
                <div className="project-card-footer">
                  <span>{dateLabel(project.createdAt)}</span>
                  <button
                    className="icon-button"
                    aria-label={`Удалить проект ${project.name}`}
                    disabled={
                      pending ||
                      (!serverMode &&
                        (active?.projectId === project.id || activeRun?.projectId === project.id))
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
          {serverMode && !examples.length
            ? 'Создайте проект и загрузите спецификацию OpenAPI.'
            : 'Создайте свой проект или выберите готовый пример.'}
        </EmptyState>
      )}
      {serverMode && examples.length > 0 ? (
        <section
          className="examples-library account-examples"
          aria-labelledby="account-examples-title"
        >
          <h2 id="account-examples-title">Примеры проектов</h2>
          <div className="examples-list">
            {examples.map((example) => (
              <article key={example.id}>
                <h3>{example.name}</h3>
                <p className="muted">{example.description}</p>
                <button
                  type="button"
                  className="button secondary"
                  disabled={pending}
                  onClick={() => void openExample(example.id)}
                >
                  {example.id === 'storefront' ? 'Открыть демопроект' : `Открыть «${example.name}»`}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Удалить ${deleting.name}?`}
          confirm="Удалить проект"
          onClose={() => setDeleting(undefined)}
          onConfirm={() => void remove(deleting)}
        >
          {serverMode
            ? 'Проект, отчёты и скриншоты будут удалены из аккаунта.'
            : 'Настройки, история и сохранённые планы будут удалены из этого браузера.'}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
