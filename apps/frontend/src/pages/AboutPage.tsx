import { browserChecksEnabled } from '../core/runner';
import { PageHeading } from '../components/ui';
export function AboutPage() {
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
          {browserChecksEnabled
            ? 'Playwright открывает приложение, применяет отказы API и проверяет интерфейс по нескольким критериям. Скриншоты и результаты хранятся на локальном сервере.'
            : 'В статической версии выполняется учебная симуляция. Для браузерной проверки и скриншотов используйте локальный запуск npm run dev:all.'}
        </p>
        <p>Проекты и история сохраняются в этом браузере.</p>
      </section>
    </>
  );
}
