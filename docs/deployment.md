# Сборка и публикация лендинга

## Локальная проверка

Из корня репозитория (Node.js 22.22+ в ветке 22 или 24.8+; для просмотра — Python 3):

```sh
npm run setup:landing
npm run dev:landing
npm run check:landing
npm run build:landing
```

Для просмотра откройте <http://127.0.0.1:4173>. Остановите сервер через `Ctrl+C`,
затем выполните проверку и сборку. Результат — `apps/landing/dist/`.
При добавлении публичных файлов обновите список в `apps/landing/tooling/build.mjs`.

Необязательная проверка перед коммитом: `npm run hooks:install`.

## GitHub Pages

1. В **Settings → Pages → Build and deployment** выберите **GitHub Actions**.
2. Слейте изменения лендинга в `main`: `.github/workflows/pages.yml` проверит,
   соберёт и опубликует `apps/landing/dist/`. PR запускает только проверки.
3. Откройте URL из job **Publish landing**, проверьте стили и работу демо.

Повторная публикация: **Actions → Landing checks and Pages → Run workflow → main**.
Для отката отмените проблемный коммит через `git revert` и слейте изменения в `main`.

Старое окружение `checks` можно удалить в **Settings → Environments**, если оно
больше не используется. Окружение `github-pages` оставьте.
