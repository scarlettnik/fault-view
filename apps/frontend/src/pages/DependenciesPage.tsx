import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  ArrowUUpLeftIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { latestDiscovery } from '../core/model';
import { useRouteExclusion } from '../hooks/useRouteExclusion';
import {
  ConfirmDialog,
  EmptyState,
  NeedDiscovery,
  Notice,
  PageHeading,
  ProjectExport,
} from '../components/ui';
import { useProject } from './ProjectPages';
import { DependencyGraph } from '../components/DependencyGraph';

export function DependenciesPage() {
  const project = useProject();
  const { setExcluded, exclusionError } = useRouteExclusion(project);
  const graph = latestDiscovery(project)?.graph;
  const [tab, setTab] = useState<'graph' | 'routes' | 'endpoints' | 'links'>('graph');
  const [search, setSearch] = useState('');
  const [showExcluded, setShowExcluded] = useState(false);
  const [deleting, setDeleting] = useState<string>();
  const [limit, setLimit] = useState(50);
  if (!graph)
    return (
      <>
        <PageHeading title="Карта зависимостей" />
        <NeedDiscovery projectId={project.id} />
      </>
    );
  const term = search.toLocaleLowerCase();
  const routes = graph.routes.filter(
    (route) =>
      (showExcluded || !project.excludedRouteIds.includes(route.id)) &&
      (route.id.toLowerCase().includes(term) ||
        graph.routeDependencies.some(
          (edge) => edge.routeId === route.id && edge.endpointId.toLowerCase().includes(term),
        )),
  );
  const endpoints = graph.endpoints.filter((endpoint) => endpoint.id.toLowerCase().includes(term));
  const links = graph.operationLinks.filter((link) =>
    `${link.source} ${link.target}`.toLowerCase().includes(term),
  );
  return (
    <>
      <PageHeading title="Карта зависимостей" actions={<ProjectExport project={project} />} />
      {exclusionError ? <Notice kind="error">{exclusionError}</Notice> : null}
      <div className="graph-summary">
        <div>
          <span className="project-dot" />
          <strong>{project.name}</strong>
          <span className="muted">/</span>
          <span>
            Страниц в проверке:{' '}
            {graph.routes.filter((route) => !project.excludedRouteIds.includes(route.id)).length}
          </span>
          <span className="muted">→</span>
          <span>{graph.routeDependencies.length} связей</span>
        </div>
        <Link className="text-link" to={`/projects/${project.id}/plans`}>
          Настроить каскад <ArrowRightIcon size={16} />
        </Link>
      </div>
      {graph.warnings.length ? (
        <Notice>
          Обход содержит {graph.warnings.length} предупреждений. Граф может быть неполным.{' '}
          <Link to={`/projects/${project.id}/discoveries/${latestDiscovery(project)!.id}`}>
            Посмотреть ограничения
          </Link>
        </Notice>
      ) : null}
      <div className="table-panel">
        <div className="table-toolbar">
          <div className="segmented" aria-label="Представление зависимостей">
            {(
              [
                ['graph', 'Граф', graph.routes.length + graph.endpoints.length],
                ['routes', 'Страницы', graph.routes.length],
                ['endpoints', 'API', graph.endpoints.length],
                ['links', 'Связи API', graph.operationLinks.length],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                className={tab === value ? 'selected' : ''}
                aria-pressed={tab === value}
                onClick={() => {
                  setTab(value);
                  setLimit(50);
                }}
              >
                {label}
                <span>{count}</span>
              </button>
            ))}
          </div>
          <label className="search-field">
            <MagnifyingGlassIcon size={17} />
            <input
              aria-label="Поиск зависимостей"
              placeholder="Страница или API"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLimit(50);
              }}
            />
          </label>
        </div>
        {tab === 'graph' ? (
          <>
            <div className="table-subtoolbar">
              <span>Страницы и запросы</span>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showExcluded}
                  onChange={(event) => setShowExcluded(event.target.checked)}
                />
                Показать удалённые ({project.excludedRouteIds.length})
              </label>
            </div>
            <DependencyGraph
              graph={graph}
              projectId={project.id}
              excluded={project.excludedRouteIds}
              search={search}
              showExcluded={showExcluded}
              onExclude={setDeleting}
              onRestore={(routeId) => void setExcluded(routeId, false)}
            />
          </>
        ) : null}
        {tab === 'routes' ? (
          <>
            <div className="table-subtoolbar">
              <span className="muted">Страница → наблюдаемые HTTP-запросы</span>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={showExcluded}
                  onChange={(event) => setShowExcluded(event.target.checked)}
                />
                Показать удалённые ({project.excludedRouteIds.length})
              </label>
            </div>
            {routes.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>МАРШРУТ</th>
                      <th>API-ЗАВИСИМОСТИ</th>
                      <th>СОСТОЯНИЕ</th>
                      <th>
                        <span className="sr-only">Действия</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((route) => {
                      const excluded = project.excludedRouteIds.includes(route.id);
                      const dependencies = graph.routeDependencies.filter(
                        (edge) => edge.routeId === route.id,
                      );
                      return (
                        <tr key={route.id} className={excluded ? 'excluded-row' : ''}>
                          <td>
                            <code className="route-code">{route.id}</code>
                            <small>
                              {dependencies.length} {dependencies.length === 1 ? 'связь' : 'связей'}
                            </small>
                          </td>
                          <td>
                            <div className="endpoint-stack">
                              {dependencies.length ? (
                                dependencies.map((edge) => (
                                  <code key={edge.endpointId}>
                                    <span className="method">{edge.endpointId.split(' ')[0]}</span>
                                    {edge.endpointId.substring(edge.endpointId.indexOf(' ') + 1)}
                                  </code>
                                ))
                              ) : (
                                <span className="muted">Нет связей в сценарии</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`badge ${excluded ? 'cancelled' : route.status === 'error' ? 'failed' : 'completed'}`}
                            >
                              <span className="status-dot" />
                              {excluded
                                ? 'Исключён'
                                : route.status === 'error'
                                  ? 'Ошибка загрузки'
                                  : 'В сценарии'}
                            </span>
                          </td>
                          <td>
                            {excluded ? (
                              <button
                                className="icon-button"
                                aria-label={`Вернуть маршрут ${route.id}`}
                                onClick={() => void setExcluded(route.id, false)}
                              >
                                <ArrowUUpLeftIcon size={18} />
                              </button>
                            ) : (
                              <button
                                className="icon-button"
                                aria-label={`Удалить маршрут ${route.id}`}
                                onClick={() => setDeleting(route.id)}
                              >
                                <TrashIcon size={18} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Маршруты не найдены">
                Измените поиск или включите отображение удалённых маршрутов.
              </EmptyState>
            )}
          </>
        ) : null}
        {tab === 'endpoints' ? (
          endpoints.length ? (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>ОПЕРАЦИЯ</th>
                      <th>ИСПОЛЬЗУЕТСЯ НА СТРАНИЦАХ</th>
                      <th>ИСТОЧНИК</th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoints.slice(0, limit).map((endpoint) => {
                      const used = graph.routeDependencies
                        .filter((edge) => edge.endpointId === endpoint.id)
                        .map((edge) => edge.routeId);
                      return (
                        <tr key={endpoint.id}>
                          <td>
                            <code>
                              <span className="method">{endpoint.method}</span>
                              {endpoint.path}
                            </code>
                            <small>{endpoint.operationId}</small>
                          </td>
                          <td>
                            {used.length ? (
                              <div className="tag-list">
                                {used.map((id) => (
                                  <code key={id}>{id}</code>
                                ))}
                              </div>
                            ) : (
                              <span className="muted">Не наблюдался в обходе</span>
                            )}
                          </td>
                          <td>
                            <span className="subtle-label">OPENAPI</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {endpoints.length > limit ? (
                <button className="text-button load-more" onClick={() => setLimit(limit + 50)}>
                  Показать ещё · {limit} из {endpoints.length}
                </button>
              ) : null}
            </>
          ) : (
            <EmptyState title="Операции не найдены">Попробуйте другой поисковый запрос.</EmptyState>
          )
        ) : null}
        {tab === 'links' ? (
          links.length ? (
            <>
              <div className="table-subtoolbar muted">
                OpenAPI Links описывают переходы операций; это не доказательство внутренних
                серверных зависимостей.
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>ОТ ОПЕРАЦИИ</th>
                      <th>К ОПЕРАЦИИ</th>
                      <th>ИСТОЧНИК</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.slice(0, limit).map((link, index) => (
                      <tr key={`${link.source}:${link.target}:${index}`}>
                        <td>
                          <code>{link.source}</code>
                        </td>
                        <td>
                          <code>{link.target}</code>
                        </td>
                        <td>
                          <span className="badge ready">OpenAPI Link</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {links.length > limit ? (
                <button className="text-button load-more" onClick={() => setLimit(limit + 50)}>
                  Показать ещё
                </button>
              ) : null}
            </>
          ) : (
            <EmptyState title="В спецификации нет OpenAPI Links"></EmptyState>
          )
        ) : null}
      </div>
      {deleting !== undefined ? (
        <ConfirmDialog
          title={`Удалить маршрут ${deleting}?`}
          confirm="Удалить маршрут"
          onClose={() => setDeleting(undefined)}
          onConfirm={() => {
            void setExcluded(deleting, true);
            setDeleting(undefined);
          }}
        >
          Маршрут будет исключён из новых каскадных планов. Исходный граф сохранится; маршрут можно
          вернуть через «Показать удалённые».
        </ConfirmDialog>
      ) : null}
    </>
  );
}
