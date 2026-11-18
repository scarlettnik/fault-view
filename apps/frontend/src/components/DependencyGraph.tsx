import { useId, useRef, useState, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowsOutIcon, MinusIcon, PlusIcon } from '@phosphor-icons/react';
import type { Graph } from '../core/model';

interface Props {
  graph: Graph;
  projectId: string;
  excluded: string[];
  search: string;
  showExcluded: boolean;
  onExclude: (id: string) => void;
  onRestore: (id: string) => void;
}
export function DependencyGraph({
  graph,
  projectId,
  excluded,
  search,
  showExcluded,
  onExclude,
  onRestore,
}: Props) {
  const marker = useId().replace(/:/g, '');
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<{ kind: 'route' | 'endpoint'; id: string }>();
  const term = search.toLowerCase();
  const routes = graph.routes.filter((route) => showExcluded || !excluded.includes(route.id));
  const positions = new Map<string, { x: number; y: number }>();
  routes.forEach((route, index) =>
    positions.set(`route:${route.id}`, { x: 40, y: 85 + index * 112 }),
  );
  graph.endpoints.forEach((endpoint, index) =>
    positions.set(`endpoint:${endpoint.id}`, { x: 550, y: 85 + index * 112 }),
  );
  const height = Math.max(routes.length, graph.endpoints.length, 2) * 112 + 100;
  const selectedKey = selected ? `${selected.kind}:${selected.id}` : '';
  const connected = new Set([selectedKey]);
  for (const edge of graph.routeDependencies) {
    if (selectedKey === `route:${edge.routeId}`) connected.add(`endpoint:${edge.endpointId}`);
    if (selectedKey === `endpoint:${edge.endpointId}`) connected.add(`route:${edge.routeId}`);
  }
  for (const edge of graph.operationLinks) {
    if (selectedKey === `endpoint:${edge.source}`) connected.add(`endpoint:${edge.target}`);
    if (selectedKey === `endpoint:${edge.target}`) connected.add(`endpoint:${edge.source}`);
  }
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest('[role="button"]') || event.button !== 0) return;
    const box = viewport.current!;
    drag.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop };
    box.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    viewport.current!.scrollLeft = drag.current.left + drag.current.x - event.clientX;
    viewport.current!.scrollTop = drag.current.top + drag.current.y - event.clientY;
  }
  const nodes = [
    ...routes.map((route) => ({
      kind: 'route' as const,
      id: route.id,
      label: route.id,
      detail: excluded.includes(route.id)
        ? 'Исключена из проверок'
        : route.status === 'error'
          ? 'Ошибка загрузки'
          : 'Страница',
    })),
    ...graph.endpoints.map((endpoint) => ({
      kind: 'endpoint' as const,
      id: endpoint.id,
      label: endpoint.id,
      detail: endpoint.operationId ?? 'Операция OpenAPI',
    })),
  ];
  const matches = nodes.filter((node) => node.label.toLowerCase().includes(term));
  const related =
    selected?.kind === 'route'
      ? graph.routeDependencies
          .filter((edge) => edge.routeId === selected.id)
          .map((edge) => edge.endpointId)
      : graph.routeDependencies
          .filter((edge) => edge.endpointId === selected?.id)
          .map((edge) => edge.routeId);
  return (
    <section className="graph-panel" aria-label="Интерактивный граф зависимостей">
      <div className="graph-toolbar">
        <div>
          <h2>Страницы и API</h2>
          <p className="muted">Связи страниц с API</p>
        </div>
        <div className="row graph-controls">
          <button
            className="icon-button"
            aria-label="Уменьшить граф"
            disabled={zoom <= 0.4}
            onClick={() => setZoom((value) => Math.max(0.4, value - 0.2))}
          >
            <MinusIcon />
          </button>
          <output aria-label="Масштаб графа">{Math.round(zoom * 100)}%</output>
          <button
            className="icon-button"
            aria-label="Увеличить граф"
            disabled={zoom >= 2}
            onClick={() => setZoom((value) => Math.min(2, value + 0.2))}
          >
            <PlusIcon />
          </button>
          <button
            className="icon-button"
            aria-label="Вписать граф"
            onClick={() => {
              setZoom(Math.min(1, (viewport.current?.clientWidth ?? 1100) / 1100));
              viewport.current?.scrollTo(0, 0);
            }}
          >
            <ArrowsOutIcon />
          </button>
        </div>
      </div>
      <div className="graph-legend">
        <span>
          <i className="legend-solid" />
          Связь локального сценария
        </span>
        <span>
          <i className="legend-dashed" />
          OpenAPI Link · объявленный переход
        </span>
        <span>
          Страницы: {routes.length} · API: {graph.endpoints.length}
        </span>
      </div>
      <div
        className="graph-viewport"
        ref={viewport}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <svg
          className="dependency-canvas"
          width={1100 * zoom}
          height={height * zoom}
          viewBox={`0 0 1100 ${height}`}
          role="group"
          aria-label="Карта страниц, API и направленных связей"
        >
          <defs>
            <marker
              id={`${marker}-observed`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0 0L8 4L0 8" fill="none" stroke="var(--accent)" />
            </marker>
            <marker
              id={`${marker}-declared`}
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0 0L8 4L0 8" fill="none" stroke="var(--link-color)" />
            </marker>
          </defs>
          <text x="40" y="40" className="graph-column-label">
            СТРАНИЦЫ
          </text>
          <text x="550" y="40" className="graph-column-label">
            ОПЕРАЦИИ API
          </text>
          {graph.routeDependencies.map((edge) => {
            const source = positions.get(`route:${edge.routeId}`);
            const target = positions.get(`endpoint:${edge.endpointId}`);
            if (!source || !target) return null;
            const active =
              !selected || selected.id === edge.routeId || selected.id === edge.endpointId;
            return (
              <path
                key={`${edge.routeId}:${edge.endpointId}`}
                className={`graph-edge observed ${active ? '' : 'dim'}`}
                d={`M${source.x + 290} ${source.y + 36} C440 ${source.y + 36} 440 ${target.y + 36} ${target.x - 6} ${target.y + 36}`}
                markerEnd={`url(#${marker}-observed)`}
              >
                <title>
                  {edge.routeId} → {edge.endpointId} · связь локального сценария
                </title>
              </path>
            );
          })}
          {graph.operationLinks.map((edge, index) => {
            const source = positions.get(`endpoint:${edge.source}`);
            const target = positions.get(`endpoint:${edge.target}`);
            if (!source || !target) return null;
            const bend = 965 + (index % 4) * 26;
            return (
              <path
                key={`${edge.source}:${edge.target}:${index}`}
                className={`graph-edge declared ${selected && selected.id !== edge.source && selected.id !== edge.target ? 'dim' : ''}`}
                d={`M${source.x + 290} ${source.y + 20} C${bend} ${source.y - 35} ${bend} ${target.y + 100} ${target.x + 297} ${target.y + 53}`}
                markerEnd={`url(#${marker}-declared)`}
              >
                <title>
                  {edge.source} → {edge.target} · {edge.name} · OpenAPI Link
                </title>
              </path>
            );
          })}
          {nodes.map((node) => {
            const key = `${node.kind}:${node.id}`;
            const pos = positions.get(key)!;
            const dim =
              (selected && !connected.has(key)) ||
              (term && !node.label.toLowerCase().includes(term));
            return (
              <g
                key={key}
                transform={`translate(${pos.x} ${pos.y})`}
                className={`graph-node ${node.kind} ${dim ? 'dim' : ''} ${selectedKey === key ? 'selected' : ''} ${excluded.includes(node.id) ? 'excluded' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${node.kind === 'route' ? 'Страница' : 'API'} ${node.label}`}
                aria-pressed={selectedKey === key}
                onClick={() => setSelected(node)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(node);
                  }
                }}
              >
                <title>
                  {node.label} · {node.detail}
                </title>
                <rect width="290" height="76" rx="6" />
                <rect className="node-accent" width="3" height="34" x="0" y="21" />
                <text x="19" y="31" className="graph-node-title">
                  {node.label.length > 32 ? node.label.slice(0, 30) + '…' : node.label}
                </text>
                <text x="19" y="54" className="graph-node-detail">
                  {node.detail.length > 37 ? node.detail.slice(0, 35) + '…' : node.detail}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {term ? (
        <p className="graph-search-status" role="status" aria-label="Результаты поиска графа">
          Найдено узлов: {matches.length}.
        </p>
      ) : null}
      {selected ? (
        <div className="graph-inspector">
          <div>
            <p className="eyebrow">{selected.kind === 'route' ? 'СТРАНИЦА' : 'API'}</p>
            <h3>
              <code>{selected.id}</code>
            </h3>
            <p className="muted">
              {related.length ? related.join(' · ') : 'Связей сценария с активными страницами нет.'}
            </p>
            {selected.kind === 'endpoint'
              ? graph.operationLinks
                  .filter((edge) => edge.source === selected.id || edge.target === selected.id)
                  .map((edge, index) => (
                    <p className="muted" key={index}>
                      OpenAPI Link: {edge.source} → {edge.target}. Объявлен в спецификации.
                    </p>
                  ))
              : null}
          </div>
          <div className="row">
            {selected.kind === 'route' ? (
              excluded.includes(selected.id) ? (
                <button className="button secondary" onClick={() => onRestore(selected.id)}>
                  Вернуть страницу в проверки
                </button>
              ) : (
                <button className="button secondary" onClick={() => onExclude(selected.id)}>
                  Исключить страницу
                </button>
              )
            ) : null}
            {!excluded.includes(selected.id) ? (
              <Link
                className="button primary"
                to={`/projects/${projectId}/plans?mode=${selected.kind === 'route' ? 'route' : 'endpoint'}&target=${encodeURIComponent(selected.id)}`}
              >
                Настроить проверку
              </Link>
            ) : null}
            <button className="text-button" onClick={() => setSelected(undefined)}>
              Сбросить выбор
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
