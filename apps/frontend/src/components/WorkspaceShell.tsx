import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router-dom';
import {
  CaretRightIcon,
  ClockCounterClockwiseIcon,
  FileCodeIcon,
  FolderOpenIcon,
  ListChecksIcon,
  ListIcon,
  NetworkIcon,
  SquaresFourIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useAppSelector } from '../store';
import { Busy, Notice } from './ui';
import { isPlaywrightEnabled } from '../core/runner';

export function WorkspaceShell() {
  const browserChecksEnabled = useAppSelector((state) =>
    isPlaywrightEnabled(state.workspace.executionMode),
  );
  const match = useMatch('/projects/:projectId/*');
  const project = useAppSelector((state) =>
    state.workspace.projects.find((item) => item.id === match?.params.projectId),
  );
  const storageError = useAppSelector((state) => state.workspace.storageError);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const projectName = project?.name;
  useEffect(() => {
    document.title = projectName
      ? `${projectName} · FaultView`
      : `${location.pathname === '/about' ? 'О проекте' : location.pathname === '/runner' ? 'Подключение Playwright' : 'Проекты'} · FaultView`;
  }, [location.pathname, projectName]);
  const closeMobile = () => setMobileOpen(false);
  const base = project ? `/projects/${project.id}` : '';
  return (
    <div className="workspace">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
          document.getElementById('main')?.scrollIntoView();
        }}
      >
        К содержимому
      </a>
      <aside
        className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}
        aria-label="Основная навигация"
      >
        <div className="brand-row">
          <Link className="wordmark" to="/" onClick={closeMobile}>
            <span className="brand-symbol" aria-hidden>
              F<span>↗</span>
            </span>
            FAULT<span>VIEW</span>
          </Link>
          <button
            className="icon-button mobile-only"
            aria-label="Закрыть меню"
            onClick={closeMobile}
          >
            <XIcon />
          </button>
        </div>
        <nav
          onClick={(event) => {
            if ((event.target as Element).closest('a')) closeMobile();
          }}
        >
          <NavLink className="nav-item" to="/" end>
            <SquaresFourIcon />
            Все проекты
          </NavLink>
          {project ? (
            <>
              <div className="nav-project">
                <span className="project-dot" />
                {project.name}
              </div>
              <NavLink className="nav-item" to={base} end>
                <FolderOpenIcon />
                Обзор
              </NavLink>
              <NavLink className="nav-item" to={`${base}/dependencies`}>
                <NetworkIcon />
                Зависимости
              </NavLink>
              <NavLink className="nav-item" to={`${base}/plans`}>
                <ListChecksIcon />
                Каскадные планы
              </NavLink>
              <NavLink className="nav-item" to={`${base}/history`}>
                <ClockCounterClockwiseIcon />
                История
              </NavLink>
              <NavLink className="nav-item" to={`${base}/settings`}>
                <FileCodeIcon />
                Настройки проекта
              </NavLink>
            </>
          ) : null}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/about">О проекте</Link>
        </div>
      </aside>
      {mobileOpen ? (
        <button className="mobile-backdrop" aria-label="Закрыть навигацию" onClick={closeMobile} />
      ) : null}
      <div className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            aria-label="Открыть меню"
            onClick={() => setMobileOpen(true)}
          >
            <ListIcon />
          </button>
          <div className="breadcrumbs">
            <Link to="/">Проекты</Link>
            {project ? (
              <>
                <CaretRightIcon size={12} />
                <span>{project.name}</span>
              </>
            ) : null}
          </div>
          <span className="connection online">
            <span className="status-dot" />
            {browserChecksEnabled ? 'Playwright' : 'Локальная симуляция'}
          </span>
        </header>
        <main id="main" tabIndex={-1}>
          {storageError ? (
            <Notice kind="error">
              Браузер не смог восстановить или сохранить данные. Не закрывайте вкладку: выгрузите
              проекты через «Экспорт JSON».
            </Notice>
          ) : null}
          <Suspense
            fallback={
              <div className="route-loading" role="status">
                <Busy>Открываем раздел…</Busy>
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
