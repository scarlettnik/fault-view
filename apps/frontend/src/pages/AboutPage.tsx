import { Link } from 'react-router-dom';
import { isPlaywrightEnabled } from '../core/runner';
import { serverMode } from '../core/workspaceApi';
import { PageHeading } from '../components/ui';
import { useAppSelector } from '../store';
export function AboutPage() {
  const browserChecksEnabled = useAppSelector((state) =>
    isPlaywrightEnabled(state.workspace.executionMode),
  );
  return (
    <>
      <PageHeading title="О проекте" />
      <section className="quiet-panel">
        <h2>FaultView · Frontend MVP</h2>
        <p>
          Подготовка сценариев отказа API: проект со спецификацией, граф зависимостей, каскадный
          план и результаты симуляции.
        </p>
        <p>
          {serverMode
            ? 'Проекты и отчёты сохраняются в аккаунте. Playwright проверяет реакцию интерфейса на отказы API и делает скриншоты.'
            : browserChecksEnabled
              ? 'Playwright открывает приложение, применяет отказы API и проверяет интерфейс по нескольким критериям. Скриншоты и результаты хранятся на локальном сервере.'
              : 'В статической версии выполняется учебная симуляция. Для браузерной проверки и скриншотов используйте локальный запуск npm run dev:all.'}
        </p>
        {serverMode ? null : (
          <>
            <p>Проекты и история сохраняются в этом браузере.</p>
            <Link to="/runner">Подключение Playwright</Link>
          </>
        )}
      </section>
    </>
  );
}
