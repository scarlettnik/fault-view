import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ExecutePlan } from '../components/Execution';
import {
  ArrowDownIcon,
  ArrowRightIcon,
  DownloadSimpleIcon,
  NetworkIcon,
  PathIcon,
  PlayIcon,
} from '@phosphor-icons/react';
import { executePlan } from '../store/operations';
import { usePreparedPlan } from '../hooks/usePreparedPlan';
import {
  allProfiles,
  downloadJson,
  latestDiscovery,
  messageFor,
  profileInfo,
  type PlanInput,
  type Profile,
  type SavedPlan,
} from '../core/model';
import { useAppDispatch, useAppSelector } from '../store';
import { planSaved } from '../store/workspace';
import { Busy, EmptyState, NeedDiscovery, Notice, PageHeading } from '../components/ui';
import { useProject } from './ProjectPages';
import { MAX_RUN_CASES, planExecutionProblem, previewPlan } from '../core/planning';

export function PlanCases({ saved }: { saved: SavedPlan }) {
  const [limit, setLimit] = useState(50);
  return (
    <section className="table-panel">
      <div className="table-toolbar">
        <div>
          <h2>
            Комбинации проверок <span className="counter">{saved.result.cases.length}</span>
          </h2>
          <p className="muted">
            {saved.input.mode === 'route' ? 'От страницы' : 'От API'} ·{' '}
            <code>{saved.input.targetId}</code>
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() =>
            downloadJson(`faultview-plan-${saved.id}.json`, {
              format: 'faultview-plan',
              version: 1,
              ...saved,
            })
          }
        >
          <DownloadSimpleIcon />
          Экспорт плана
        </button>
      </div>
      {saved.result.warnings.map((warning) => (
        <div className="table-subtoolbar muted" key={warning}>
          {warning}
        </div>
      ))}
      {saved.result.cases.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>МАРШРУТ</th>
                  <th>ENDPOINT</th>
                  <th>ПРОФИЛЬ</th>
                  <th>ОСНОВАНИЕ</th>
                </tr>
              </thead>
              <tbody>
                {saved.result.cases.slice(0, limit).map((item) => (
                  <tr key={`${item.routeId}:${item.endpointId}:${item.profile}`}>
                    <td>
                      <code>{item.routeId}</code>
                    </td>
                    <td>
                      <code>{item.endpointId}</code>
                    </td>
                    <td>
                      <span className="profile-tag">{profileInfo[item.profile].name}</span>
                    </td>
                    <td>
                      <span className="muted">
                        {item.basis === 'local-fixture'
                          ? 'Локальный сценарий'
                          : 'Объявлен в OpenAPI Link'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {saved.result.cases.length > limit ? (
            <button className="text-button load-more" onClick={() => setLimit(limit + 50)}>
              Показать ещё · {Math.min(limit, saved.result.cases.length)} из{' '}
              {saved.result.cases.length}
            </button>
          ) : null}
        </>
      ) : (
        <EmptyState title="Нет подходящих комбинаций">
          У выбранного узла не обнаружены связи с активными страницами.
        </EmptyState>
      )}
    </section>
  );
}
export function PlansPage() {
  const project = useProject();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const busy = useAppSelector((state) => !!state.workspace.active || !!state.workspace.activeRun);
  const [params] = useSearchParams();
  const job = latestDiscovery(project);
  const graph = job?.graph;
  const [mode, setMode] = useState<'route' | 'endpoint'>(
    params.get('mode') === 'endpoint' ? 'endpoint' : 'route',
  );
  const [selection, setSelection] = useState({
    route: params.get('mode') !== 'endpoint' ? (params.get('target') ?? '') : '',
    endpoint: params.get('mode') === 'endpoint' ? (params.get('target') ?? '') : '',
  });
  const [profiles, setProfiles] = useState<Profile[]>([...allProfiles]);
  const { prepare, isPreparing } = usePreparedPlan(project.id);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState<{ key: string; saved: SavedPlan }>();
  if (!job || !graph)
    return (
      <>
        <PageHeading title="Каскадные планы" />
        <NeedDiscovery projectId={project.id} />
      </>
    );
  const options =
    mode === 'route'
      ? graph.routes.filter((route) => !project.excludedRouteIds.includes(route.id))
      : graph.endpoints;
  const observedIds = new Set(
    graph.routeDependencies
      .filter((edge) => !project.excludedRouteIds.includes(edge.routeId))
      .map((edge) => (mode === 'route' ? edge.routeId : edge.endpointId)),
  );
  const targetId = options.some((option) => option.id === selection[mode])
    ? selection[mode]
    : (options.find((option) => observedIds.has(option.id))?.id ?? options[0]?.id ?? '');
  const input: PlanInput = {
    discoveryId: job.id,
    mode,
    targetId,
    profiles,
    excludedRouteIds: project.excludedRouteIds,
  };
  const key = JSON.stringify(input);
  const result = generated?.key === key ? generated.saved : undefined;
  const preview = previewPlan(graph, input);
  async function submit(alsoRun = false) {
    setError('');
    try {
      const prepared = await prepare(input);
      const result = prepared.result;
      if (alsoRun) {
        const problem = planExecutionProblem(result);
        if (problem) throw new Error(problem.message);
      }
      const saved: SavedPlan = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        input: prepared.input,
        result,
      };
      dispatch(planSaved({ projectId: project.id, plan: saved }));
      setGenerated({ key: JSON.stringify(prepared.input), saved });
      if (alsoRun) {
        const task = dispatch(executePlan({ projectId: project.id, plan: prepared.input }));
        void task.unwrap().catch(() => undefined);
        void navigate(`/projects/${project.id}/runs/${task.requestId}`);
      }
    } catch (value) {
      setError(messageFor(value));
    }
  }
  return (
    <>
      <PageHeading title="Проверки" />
      <div className="plan-layout">
        <section className="plan-controls">
          <h2>Направление каскада</h2>
          <div className="mode-choices">
            {(
              [
                ['route', 'От страницы', 'Все API страницы и объявленные переходы', PathIcon],
                ['endpoint', 'От API', 'Страницы, затронутые отказом API', NetworkIcon],
              ] as const
            ).map(([value, title, description, Icon]) => (
              <button
                key={value}
                className={`mode-choice ${mode === value ? 'selected' : ''}`}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                <Icon size={24} />
                <span>
                  <strong>{title}</strong>
                  <small>{description}</small>
                </span>
                <span className="radio-indicator" />
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="cascade-target">
              {mode === 'route' ? 'Начальная страница' : 'Начальный API'}
            </label>
            <select
              id="cascade-target"
              value={targetId}
              onChange={(event) => setSelection({ ...selection, [mode]: event.target.value })}
            >
              {options.length ? (
                options.map((option) => (
                  <option value={option.id} key={option.id}>
                    {option.id}
                    {observedIds.has(option.id) ? '' : ' · нет в сценарии'}
                  </option>
                ))
              ) : (
                <option value="">Нет активных узлов</option>
              )}
            </select>
          </div>
          <div className="section-heading">
            <h2>Профили отказа</h2>
            <button
              className="text-button"
              onClick={() =>
                setProfiles(profiles.length === allProfiles.length ? [] : [...allProfiles])
              }
            >
              {profiles.length === allProfiles.length ? 'Снять все' : 'Выбрать все'}
            </button>
          </div>
          <div className="profile-grid">
            {allProfiles.map((profile) => (
              <label
                className={`profile-choice ${profiles.includes(profile) ? 'selected' : ''}`}
                key={profile}
              >
                <input
                  type="checkbox"
                  checked={profiles.includes(profile)}
                  onChange={() =>
                    setProfiles(
                      profiles.includes(profile)
                        ? profiles.filter((value) => value !== profile)
                        : allProfiles.filter(
                            (value) => value === profile || profiles.includes(value),
                          ),
                    )
                  }
                />
                <span>
                  <strong>{profileInfo[profile].name}</strong>
                  <small>{profileInfo[profile].detail}</small>
                </span>
              </label>
            ))}
          </div>
        </section>
        <aside className="plan-summary">
          <div className="cascade-path">
            <span>{mode === 'route' ? 'Страница' : 'Endpoint'}</span>
            <ArrowDownIcon />
            <code>{targetId || '—'}</code>
            <ArrowDownIcon />
            <span>{mode === 'route' ? 'Зависимые операции' : 'Затронутые страницы'}</span>
          </div>
          <dl>
            <div>
              <dt>Профилей</dt>
              <dd>{profiles.length} / 7</dd>
            </div>
            <div>
              <dt>Исключено страниц</dt>
              <dd>{project.excludedRouteIds.length}</dd>
            </div>
            <div>
              <dt>Пар страница → API</dt>
              <dd>{preview.pairs}</dd>
            </div>
            <div>
              <dt>Проверок в прогоне</dt>
              <dd aria-live="polite" aria-label="Количество проверок">
                {preview.count} / {MAX_RUN_CASES}
              </dd>
            </div>
          </dl>
          {preview.problem ? (
            <Notice>
              {preview.problem.message}{' '}
              <Link className="text-link" to={`/projects/${project.id}/dependencies`}>
                Открыть граф зависимостей
              </Link>
            </Notice>
          ) : null}
          {!result ? (
            <button
              className="button primary"
              disabled={busy || isPreparing || !targetId || !!preview.problem}
              onClick={() => {
                void submit(true);
              }}
            >
              {isPreparing ? (
                <Busy>Запускаем проверки…</Busy>
              ) : (
                <>
                  <PlayIcon />
                  Запустить проверки
                </>
              )}
            </button>
          ) : null}
          <button
            className="button secondary plan-only"
            disabled={busy || isPreparing || !targetId || !!preview.problem}
            onClick={() => {
              void submit();
            }}
          >
            {isPreparing ? (
              <Busy>Строим каскад…</Busy>
            ) : (
              <>
                Сформировать план <ArrowRightIcon />
              </>
            )}
          </button>
        </aside>
      </div>

      {error ? <Notice kind="error">{error}</Notice> : null}
      {result ? (
        <>
          <Notice kind="success">План сохранён: {result.result.cases.length} комбинаций. </Notice>
          <ExecutePlan key={result.id} saved={result} projectId={project.id} />
          <PlanCases key={`cases-${result.id}`} saved={result} />
        </>
      ) : generated ? (
        <Notice>Параметры изменились. Обновите план.</Notice>
      ) : null}
    </>
  );
}
