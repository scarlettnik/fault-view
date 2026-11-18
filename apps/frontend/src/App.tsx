import { AboutPage } from './pages/AboutPage';
import { Component, lazy, type ErrorInfo, type ReactNode } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { WorkspaceShell } from './components/WorkspaceShell';
import { EmptyState, PageHeading } from './components/ui';
import { ProjectsPage } from './pages/ProjectsPage';
import { NewProjectPage, ProjectBoundary, SettingsPage } from './pages/ProjectPages';
const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((module) => ({ default: module.OverviewPage })),
);
const DependenciesPage = lazy(() =>
  import('./pages/DependenciesPage').then((module) => ({ default: module.DependenciesPage })),
);
const PlansPage = lazy(() =>
  import('./pages/PlansPage').then((module) => ({ default: module.PlansPage })),
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPages').then((module) => ({ default: module.HistoryPage })),
);
const DiscoveryDetailsPage = lazy(() =>
  import('./pages/HistoryPages').then((module) => ({ default: module.DiscoveryDetailsPage })),
);
const SavedPlanPage = lazy(() =>
  import('./pages/HistoryPages').then((module) => ({ default: module.SavedPlanPage })),
);

const RunDetailsPage = lazy(() =>
  import('./pages/HistoryPages').then((module) => ({ default: module.RunDetailsPage })),
);

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* No project contents are sent to external logging services. */
  }
  render() {
    return this.state.failed ? (
      <main className="fatal-error">
        <p className="eyebrow">FAULTVIEW</p>
        <h1>Не удалось открыть интерфейс</h1>
        <p>Ваши сохранённые проекты останутся в браузере. Обновите страницу и повторите.</p>
        <button className="button primary" onClick={() => window.location.reload()}>
          Обновить страницу
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  return (
    <Routes>
      <Route element={<WorkspaceShell />}>
        <Route index element={<ProjectsPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="projects/new" element={<NewProjectPage />} />
        <Route path="projects/:projectId" element={<ProjectBoundary />}>
          <Route index element={<OverviewPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="dependencies" element={<DependenciesPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="plans/:planId" element={<SavedPlanPage />} />
          <Route path="runs/:runId" element={<RunDetailsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="discoveries/:jobId" element={<DiscoveryDetailsPage />} />
        </Route>
        <Route
          path="*"
          element={
            <>
              <PageHeading title="Страница не найдена" />
              <EmptyState
                title="Такого адреса нет"
                action={
                  <Link className="button primary" to="/">
                    Открыть проекты
                  </Link>
                }
              >
                Вернитесь в рабочую область и выберите проект.
              </EmptyState>
            </>
          }
        />
      </Route>
    </Routes>
  );
}
