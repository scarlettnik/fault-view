import { Link, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store';
import { projectSaved } from '../store/workspace';
import { selectProjectCount, selectProjectById } from '../store/selectors';
import { type Project, type ProjectInput } from '../core/model';
import { EmptyState, Notice, PageHeading } from '../components/ui';
import { ProjectForm } from '../components/ProjectForm';

export function ProjectBoundary() {
  const { projectId } = useParams();
  const project = useAppSelector((state) => selectProjectById(state, projectId ?? ''));
  if (!project)
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
  return <Outlet context={project} />;
}
export const useProject = () => useOutletContext<Project>();

export function NewProjectPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const count = useAppSelector(selectProjectCount);
  function save(input: ProjectInput) {
    if (count >= 30) return;
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
          <ProjectForm onSave={save} />
        </div>
      )}
    </>
  );
}
export function SettingsPage() {
  const project = useProject();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const active = useAppSelector(
    (state) =>
      state.workspace.active?.projectId === project.id ||
      state.workspace.activeRun?.projectId === project.id,
  );
  function save(input: ProjectInput) {
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
        description="При замене адреса или спецификации предыдущая история будет очищена. Сначала сохраните экспорт."
      />
      {active ? (
        <Notice>
          Дождитесь завершения построения графа или тестирования либо отмените запуск перед
          изменением настроек.
        </Notice>
      ) : (
        <div className="form-width">
          <ProjectForm key={project.id} initial={project} onSave={save} />
        </div>
      )}
    </>
  );
}
