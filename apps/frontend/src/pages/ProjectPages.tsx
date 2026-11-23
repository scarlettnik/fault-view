import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { projectSaved } from '../store/workspace';
import { selectProjectCount, selectProjectById } from '../store/selectors';
import {
  messageFor,
  isRunning,
  type Project,
  type ProjectInput,
  type UiChecks,
} from '../core/model';
import { isPlaywrightEnabled } from '../core/runner';
import { Busy, EmptyState, Notice, PageHeading } from '../components/ui';
import { ProjectForm } from '../components/ProjectForm';
import { serverMode } from '../core/workspaceApi';
import { createProject, loadProject, updateProject } from '../store/server';

export function ProjectBoundary() {
  const { projectId } = useParams();
  if (!projectId) return <MissingProject />;
  return serverMode ? (
    <ServerProjectBoundary key={projectId} projectId={projectId} />
  ) : (
    <LocalProjectBoundary projectId={projectId} />
  );
}

function LocalProjectBoundary({ projectId }: { projectId: string }) {
  const project = useAppSelector((state) => selectProjectById(state, projectId));
  return project ? <Outlet context={project} /> : <MissingProject />;
}

function ServerProjectBoundary({ projectId }: { projectId: string }) {
  const dispatch = useAppDispatch();
  const project = useAppSelector((state) => selectProjectById(state, projectId));
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const running =
    !!project?.jobs.some(isRunning) ||
    !!project?.runs?.some((run) => ['queued', 'running'].includes(run.status));
  useEffect(() => {
    const request = dispatch(loadProject(projectId));
    void request.unwrap().catch((value: unknown) => {
      if ((value as { name?: string }).name !== 'AbortError') setError(messageFor(value));
    });
    return () => request.abort();
  }, [dispatch, projectId, retry]);
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let abortRequest: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      const request = dispatch(loadProject(projectId));
      abortRequest = request.abort;
      void request
        .unwrap()
        .then(() => {
          if (!stopped) setError('');
        })
        .catch((value: unknown) => {
          if (!stopped) setError(messageFor(value));
        })
        .finally(() => {
          if (!stopped) timer = setTimeout(poll, 1200);
        });
    };
    timer = setTimeout(poll, 1200);
    return () => {
      stopped = true;
      clearTimeout(timer);
      abortRequest?.();
    };
  }, [dispatch, projectId, running]);
  if (error)
    return (
      <>
        <PageHeading title="Не удалось открыть проект" />
        <Notice kind="error">{error}</Notice>
        <div className="row">
          <button
            className="button secondary"
            onClick={() => {
              setError('');
              setRetry(retry + 1);
            }}
          >
            Повторить
          </button>
          <Link to="/" className="button secondary">
            К проектам
          </Link>
        </div>
      </>
    );
  return project ? <Outlet context={project} /> : <Busy>Загружаем проект…</Busy>;
}

function MissingProject() {
  return (
    <>
      <PageHeading title="Проект не найден" />
      <EmptyState
        title="Здесь пока ничего нет"
        action={
          <Link className="button primary" to="/">
            К проектам
          </Link>
        }
      >
        Возможно, проект был удалён или создан в другом браузере.
      </EmptyState>
    </>
  );
}
export const useProject = () => useOutletContext<Project>();

export function NewProjectPage() {
  const browserChecksEnabled = useAppSelector(
    (state) => serverMode || isPlaywrightEnabled(state.workspace.executionMode),
  );
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const count = useAppSelector(selectProjectCount);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function save(input: ProjectInput & { checks?: UiChecks }) {
    if (count >= 30) return;
    if (serverMode) {
      setSaving(true);
      setError('');
      try {
        const project = await dispatch(createProject(input)).unwrap();
        void navigate('/projects/' + project.id, { state: { projectSaved: true } });
      } catch (value) {
        setError(messageFor(value));
      } finally {
        setSaving(false);
      }
      return;
    }
    const id = crypto.randomUUID();
    dispatch(
      projectSaved({
        ...input,
        id,
        createdAt: new Date().toISOString(),
        jobs: [],
        plans: [],
        excludedRouteIds: [],
      }),
    );
    void navigate(`/projects/${id}`);
  }
  return (
    <>
      <PageHeading title="Новый проект" />
      {count >= 30 ? (
        <Notice kind="error">Можно сохранить до 30 проектов. Удалите ненужный проект.</Notice>
      ) : (
        <div className="form-width">
          {error ? <Notice kind="error">{error}</Notice> : null}
          <ProjectForm
            onSave={(input) => void save(input)}
            saving={saving}
            browserChecksEnabled={browserChecksEnabled}
          />
        </div>
      )}
    </>
  );
}
export function SettingsPage() {
  const browserChecksEnabled = useAppSelector(
    (state) => serverMode || isPlaywrightEnabled(state.workspace.executionMode),
  );
  const project = useProject();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const active = useAppSelector(
    (state) =>
      state.workspace.active?.projectId === project.id ||
      state.workspace.activeRun?.projectId === project.id,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function save(input: ProjectInput & { checks?: UiChecks }) {
    if (serverMode) {
      setSaving(true);
      setError('');
      try {
        await dispatch(updateProject({ id: project.id, settings: input })).unwrap();
        void navigate('/projects/' + project.id, { state: { projectSaved: true } });
      } catch (value) {
        setError(messageFor(value));
      } finally {
        setSaving(false);
      }
      return;
    }
    const changed =
      input.frontendUrl !== project.frontendUrl || input.specification !== project.specification;
    dispatch(
      projectSaved({
        ...project,
        ...input,
        ...(changed ? { jobs: [], plans: [], runs: [], excludedRouteIds: [] } : {}),
      }),
    );
    void navigate(`/projects/${project.id}`);
  }
  return (
    <>
      <PageHeading
        title="Настройки проекта"
        description={
          serverMode
            ? 'После изменения адреса или OpenAPI потребуется построить новый граф. Прежние отчёты останутся в истории.'
            : 'При замене адреса или спецификации предыдущая история будет очищена. Сначала сохраните экспорт.'
        }
      />
      {active ? (
        <Notice>
          Дождитесь завершения построения графа или тестирования либо отмените запуск перед
          изменением настроек.
        </Notice>
      ) : (
        <div className="form-width">
          {error ? <Notice kind="error">{error}</Notice> : null}
          <ProjectForm
            key={project.id}
            saving={saving}
            initial={project}
            onSave={(input) => void save(input)}
            browserChecksEnabled={browserChecksEnabled}
          />
        </div>
      )}
    </>
  );
}
