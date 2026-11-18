import { expect, test } from '@playwright/test';
import { exampleSpecification } from '../src/core/examples';

test('project CRUD validates input and survives reload without HTTP API', async ({ page }) => {
  const forbidden: string[] = [];
  page.on('request', (request) => {
    if (
      /\/api\/|runner-health/.test(request.url()) ||
      new URL(request.url()).hostname !== '127.0.0.1'
    )
      forbidden.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Нет проектов' })).toBeVisible();
  await page.getByRole('link', { name: 'Новый проект', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить проект' }).click();
  await expect(page.getByText('Укажите название проекта.')).toBeVisible();
  await page.getByLabel('Название проекта').fill('Local shop');
  await page.getByLabel('Адрес приложения').fill('https://shop.example');
  await page.getByLabel('Файл OpenAPI').setInputFiles({
    name: 'shop.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exampleSpecification),
  });
  await page.getByRole('button', { name: 'Сохранить проект' }).click();
  await expect(page.getByRole('heading', { name: 'Local shop', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Local shop', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Настройки проекта', exact: true }).click();
  await page.getByLabel('Название проекта').fill('Updated shop');
  await page.getByRole('button', { name: 'Сохранить проект' }).click();
  await expect(page.getByRole('heading', { name: 'Updated shop', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт JSON' }).click();
  expect((await download).suggestedFilename()).toMatch(/^faultview-.*\.json$/);
  await page.getByRole('link', { name: 'Все проекты' }).click();
  await page.getByRole('button', { name: 'Удалить проект Updated shop' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Удалить проект', exact: true })
    .click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Нет проектов' })).toBeVisible();
  expect(forbidden).toEqual([]);
});

test('example graph, cascade and results remain local; matrix precedes preview', async ({
  page,
}) => {
  const forbidden: string[] = [];
  page.on('request', (request) => {
    if (
      /\/api\/|runner-health/.test(request.url()) ||
      new URL(request.url()).hostname !== '127.0.0.1'
    )
      forbidden.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Открыть пример' }).click();
  await page.getByRole('button', { name: 'Построить граф', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Отменить построение' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Локальный граф' })).toBeVisible();
  await page.getByRole('link', { name: 'Запустить проверки', exact: true }).click();
  await page.getByRole('button', { name: 'Запустить проверки', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Тестирование завершено', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Проверка', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Предпросмотр локального сценария')).toBeVisible();
  const order = await page.evaluate(() => {
    const matrix = document.querySelector('.results-matrix');
    const preview = document.querySelector('.scenario-preview');
    return (
      !!matrix &&
      !!preview &&
      !!(matrix.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
  });
  expect(order).toBe(true);
  await page.screenshot({ path: 'test-results/e2e/report-desktop.png', fullPage: true });
  const runUrl = page.url();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Тестирование завершено', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'История', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Открыть результаты', exact: true })).toBeVisible();
  await page.goto(runUrl);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Открыть меню' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/e2e/report-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('link', { name: 'Зависимости', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Карта зависимостей', exact: true }),
  ).toBeVisible();
  expect(forbidden).toEqual([]);
});
