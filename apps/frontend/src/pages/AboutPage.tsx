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
          Третья сдача: данные и результаты хранятся в этом браузере. Внешние приложения не
          проверяются, регистрация и сервер не требуются.
        </p>
        <p>Реальный обход, HTTP API и постоянная серверная база запланированы на четвёртый этап.</p>
      </section>
    </>
  );
}
