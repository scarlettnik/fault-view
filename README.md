# FaultView

FaultView показывает, как интерфейс реагирует на отказ API. Пользователь создаёт приватный проект, загружает OpenAPI, получает граф связей страниц с API, задаёт сценарий отказа и запускает проверку в Chromium. Отчёт содержит вердикты, сетевые наблюдения и скриншоты. Два прогона можно сравнить по одним и тем же проверкам.

## Ссылки

- [Презентация первого этапа](frontend_pro.pdf)
- [Публичный лендинг](https://scarlettnik.github.io/fault-view/)
- [Демонстрационный SPA третьего этапа](https://scarlettnik.github.io/fault-view/app/)
- [Storybook](https://scarlettnik.github.io/fault-view/storybook/)
- [Исходный код](https://github.com/scarlettnik/fault-view)

Лендинг, full-stack SPA и REST API открываются с домена VPS, заданного при развёртывании. Адреса после выпуска — `https://<домен>/`, `https://<домен>/app/`, `https://<домен>/health` и `https://<домен>/api/v1/`. Storybook и шесть исходных демонстрационных приложений доступны на GitHub Pages.

## Запуск в Docker из клона

На Linux x86-64 с Docker и Compose v2.24.4 или новее выполните:

```bash
git clone --branch develop https://github.com/scarlettnik/fault-view.git
cd fault-view
cp .env.example .env
```

Заполните в `.env` четыре пустых поля. Для каждого используйте отдельное случайное значение, например вывод `openssl rand -hex 32`.

| Переменная                          | Что хранит                                   |
| ----------------------------------- | -------------------------------------------- |
| `FAULTVIEW_PUBLIC_HOST`             | `localhost` или домен VPS без `https://`     |
| `FAULTVIEW_POSTGRES_PASSWORD`       | Пароль роли приложения в PostgreSQL          |
| `FAULTVIEW_POSTGRES_ADMIN_PASSWORD` | Пароль роли `postgres`                       |
| `AWS_ACCESS_KEY_ID`                 | Идентификатор ключа встроенного хранилища S3 |
| `AWS_SECRET_ACCESS_KEY`             | Секрет ключа встроенного хранилища S3        |

```bash
docker compose up -d
```

Откройте `http://localhost/app/`. Проверка бэкенда доступна на `http://localhost/health`. Compose скачивает [готовые образы FaultView с Docker Hub](https://hub.docker.com/r/scarlettnik/faultview/tags). Файл `compose.override.yaml` ограничивает локальный доступ адресом `127.0.0.1`.

### Запуск на VPS

Нужны Linux, Docker Engine с Compose v2 и домен с DNS-записью на публичный IP VPS. Откройте TCP 80/443 для Caddy. Chromium запускается от непривилегированного пользователя с sandbox. Профиль seccomp адаптирован из Playwright 1.65 и разрешает `chroot` с проверкой прав ядром внутри пространства имён Chromium. Ядро VPS должно поддерживать пользовательские пространства имён. [Профиль Playwright 1.65](https://github.com/microsoft/playwright/blob/v1.65.0/utils/docker/seccomp_profile.json)

В `.env` установите `FAULTVIEW_PUBLIC_HOST` равным вашему домену. Запустите основной Compose-файл с настройками HTTPS:

```bash
docker compose -f compose.yaml up -d
```

Compose запускает Caddy, Fastify со статической SPA, PostgreSQL, приватный S3 на SeaweedFS и демостенд в отдельной сети runner. Наружу опубликованы только порты Caddy. PostgreSQL и S3 сохраняют данные в именованных томах. Роль API в PostgreSQL владеет своей базой и не имеет прав суперпользователя сервера.

После запуска проверьте `https://<домен>/health`, затем откройте `https://<домен>/app/`. В разделе **Примеры проектов** доступны Storefront, Spring Petclinic, Conduit / RealWorld, Fullstack Todo, Stan's Robot Shop и React + Express + MongoDB. Выберите проект, постройте граф, запустите проверки дважды и откройте **История → Сравнить прогоны**. При обновлении используйте прежний `.env` и то же имя Compose-проекта. Если использовался файл `.env.production`, перенесите его под именем `.env` с сохранением значений. Команда `down -v` удаляет данные.

## Локальная разработка

Версия Node.js указана в [`.nvmrc`](.nvmrc). Подготовьте PostgreSQL-базу `faultview` с ролью, которой разрешено создавать таблицы, и приватный S3-бакет `faultview-shots`. Для тестов создайте отдельные `faultview_test` и `faultview-test`. Миграции применяются при старте API и выполняются с блокировкой от параллельного применения.

    nvm use
    npm run setup
    cp .env.dev.example .env.dev
    # Укажите в .env.dev DSN PostgreSQL, endpoint и ключи S3.
    set -a
    . ./.env.dev
    set +a
    npm run dev:fullstack

Откройте SPA на `http://127.0.0.1:5173`, проверку API на `http://127.0.0.1:3001/health`. Демостенд по умолчанию запускается на порту 4400. При первом запуске `dev:fullstack` собирает оригинальные примеры. Повторить их сборку можно командой `npm run build:workspace-examples`. Чтобы проверить собственный локальный стенд, перечислите origin его интерфейса, API и ресурсов в `FAULTVIEW_TARGET_ORIGINS`. Без `DATABASE_URL` команда `npm run dev` запускает режим третьего этапа с локальным runner и хранилищем браузера.

| Переменная                                                                | Назначение                                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                            | DSN PostgreSQL. Обязателен для серверного режима.                                |
| `FAULTVIEW_CLIENT_ORIGINS`                                                | Точные разрешённые origin SPA через запятую. В production нужен HTTPS.           |
| `PORT`, `FAULTVIEW_HOST`                                                  | Порт и адрес привязки HTTP API.                                                  |
| `FAULTVIEW_DEMO_URL`, `FAULTVIEW_TARGET_ORIGINS`                          | Origin доверенного демостенда и дополнительные локальные цели проверки.          |
| `FAULTVIEW_S3_BUCKET`, `FAULTVIEW_S3_ENDPOINT`, `FAULTVIEW_S3_PATH_STYLE` | Бакет, S3-адрес и настройка адресации. Для внешнего S3 в production нужен HTTPS. |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`                | Регион и данные подключения к S3.                                                |
| `VITE_API_URL`, `VITE_BASE_PATH`                                          | Адрес API и базовый путь SPA. Docker строит SPA с `/api/v1` и `/app/`.           |
| `TEST_DATABASE_URL`, `FAULTVIEW_S3_TEST_BUCKET`                           | Изолированные ресурсы для тестов.                                                |

## Архитектура и данные

- **SPA** в `apps/frontend` использует React, TypeScript, React Router и Redux Toolkit. Запросы идут через `createAsyncThunk`. Слайсы хранят сессию, проекты и состояние операций. В серверном режиме данные аккаунта остаются в памяти Redux до выхода.
- **API** в `apps/backend` использует Fastify. Модуль `workspace` разделяет маршруты, проверку доступа, бизнес-операции и запросы к PostgreSQL. BrowserEngine открывает проверяемый стенд.
- **Хранилища.** PostgreSQL хранит аккаунты, сессии, настройки проектов, графы, планы и результаты. S3 хранит JPEG, а PostgreSQL — ключи объектов, размеры и готовность. При удалении проекта фоновая очередь повторяет удаление объектов из S3.
- **Надёжность запуска.** При перезапуске завершённые отчёты остаются доступны. Прерванная проверка получает статус ошибки. Один экземпляр runner удерживает блокировку PostgreSQL. Хранятся до пяти последних отчётов на проект.

| Сущность               | Связь                                                                           |
| ---------------------- | ------------------------------------------------------------------------------- |
| `users`, `sessions`    | Аккаунт владеет сессиями. Пароли хешируются scrypt, в БД хранятся хеши токенов. |
| `projects`             | У проекта один владелец и версия настроек.                                      |
| `discoveries`, `plans` | Графы и планы относятся к проекту и версии его настроек.                        |
| `runs`, `screenshots`  | Прогоны относятся к проекту, снимки — к прогону.                                |

Сервер проверяет владельца при чтении и изменении ресурсов. Cookie сессии имеет `HttpOnly` и `SameSite=Lax`, на HTTPS включены `Secure` и префикс `__Host-`. Изменяющие запросы проходят проверку `Origin`. Для входа и тяжёлых операций есть лимиты. Публичный runner запускает Chromium только на встроенном демостенде, блокирует редиректы и Service Worker. Примеры читают тестовые данные из HTTP API демостенда. Снимки выдаются через авторизованный API.

## REST API

Пути в таблице относительны к `/api/v1`. Браузер передаёт cookie сессии, а изменяющие запросы — разрешённый `Origin`. Поля ошибок — `code`, `message` и, для ошибок формы, `fields`.

| Метод и путь                                                                                          | Параметры и ответ                                                                                                     |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`, `POST /auth/login`                                                             | JSON с `email` и `password` (12–128 символов). `201` или `200`, пользователь и cookie.                                |
| `GET /auth/session`, `POST /auth/logout`                                                              | `200` с пользователем, `401` без сессии или `204` после выхода.                                                       |
| `GET /projects`, `GET /projects/:projectId`                                                           | `200`, список карточек или один проект с графами, планами и сводкой прогонов.                                         |
| `POST /projects`                                                                                      | JSON с `name`, `frontendUrl`, `specification`, `specificationName`, `maxPages`. `201` и проект.                       |
| `GET /capabilities`                                                                                   | `200`; список готовых примеров в `examples`.                                                                          |
| `POST /projects/demo`                                                                                 | Необязательный `exampleId`: `storefront`, `checkout` или `account`. `201` при создании, `200` при повторном открытии. |
| `PATCH /projects/:projectId`, `DELETE /projects/:projectId`                                           | Частичное изменение настроек или удаление с ответом `204`.                                                            |
| `POST /projects/:projectId/discoveries`, `GET /projects/:projectId/discoveries/:jobId`                | Запуск графа `202`, чтение статуса и графа `200`.                                                                     |
| `POST /projects/:projectId/plans/preview`, `POST /projects/:projectId/plans`                          | `discoveryId`, `mode`, `targetId`, `profiles`, `excludedRouteIds`. Предпросмотр `200`, сохранение `201`.              |
| `POST /projects/:projectId/runs`, `GET /projects/:projectId/runs/:runId`                              | Запуск по параметрам плана `202`, статус и отчёт `200`.                                                               |
| `POST /projects/:projectId/runs/:runId/cancel`, `POST /projects/:projectId/discoveries/:jobId/cancel` | Остановить свою операцию, `200` с итоговым состоянием.                                                                |
| `GET /projects/:projectId/runs/compare?baseline=<uuid>&candidate=<uuid>`                              | Сравнение двух завершённых прогонов одного проекта, `200`.                                                            |
| `GET /projects/:projectId/runs/:runId/screenshots/:name`                                              | Закрытый JPEG, например `0-final`.                                                                                    |

Фрагмент ответа при запуске прогона (`202`).

    {
      "id": "e51c6eef-b300-4557-ac43-475c9f49b1cb",
      "source": "playwright",
      "status": "running",
      "progress": { "completed": 0, "total": 2 },
      "results": []
    }

Ответ чужому пользователю и для отсутствующего ресурса (`404`).

    { "code": "NOT_FOUND", "message": "Ресурс не найден." }

Ошибки валидации дают `400`, отсутствие сессии — `401`, неподходящий origin или цель — `403`, конфликт состояния — `409`, превышение лимита — `429`.

## Каскадные проверки и сравнение

Каскад учитывает наблюдённые связи страниц с API и переходы OpenAPI Links. Playwright строит граф по сетевым запросам, применяет отказ на контролируемом стенде, проверяет загрузку и содержимое интерфейса, сохраняет скриншоты и формирует вердикт. Сравнение сопоставляет строки по странице, операции API и профилю отказа. Оно показывает регрессии, улучшения, новые и исчезнувшие проверки. Для строк с `SKIP` и `ERROR` сравнение отмечает недостаток данных.

## Тесты

| Команда                 | Что проверяет                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `npm run check`         | Формат, ESLint, TypeScript, unit- и компонентные тесты.                            |
| `npm run test:runner`   | Логика сетевых наблюдений и вердиктов браузерного runner.                          |
| `npm run test:api`      | CRUD, валидация, сессии, CORS, доступ к проектам, отчётам и снимкам на PostgreSQL. |
| `npm run test:e2e:full` | Путь SPA → Fastify → PostgreSQL и путь Storefront → Chromium → S3 → сравнение.     |
| `npm run storybook`     | Истории Button, StatusBadge, Notice и ProjectForm.                                 |
| `npm run verify`        | Сборка, unit, демопроекты, браузерные и визуальные проверки статического режима.   |

Для `test:api` и `test:e2e:full` задайте `TEST_DATABASE_URL` на отдельную тестовую БД. Для полного E2E также задайте отдельный `FAULTVIEW_S3_TEST_BUCKET`, endpoint и тестовые ключи S3. CI поднимает обе зависимости. Для проверки скриншотов Storybook выполните `npm run build:storybook` и `npm run test:visual`.

Статическая сборка описана в [документации третьего этапа](docs/frontend.md). Шесть исходных демоприложений перечислены в [каталоге примеров](examples/README.md).
