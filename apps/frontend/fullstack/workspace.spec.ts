import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { exampleSpecification } from '../src/core/examples';

const password = 'FaultView fullstack test password';

async function register(page: Page, verifyEmailError = false) {
  const email = randomUUID() + '@example.test';
  await page.goto('/');
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  const emailInput = page.getByLabel('Email');
  await emailInput.fill(verifyEmailError ? 'bad-email' : email);
  await page.getByLabel('Пароль').fill(password);
  if (verifyEmailError) {
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
    await expect(page.getByRole('alert')).toHaveText('Укажите корректный email.');
    await expect(emailInput).toBeFocused();
    await expect(emailInput).toHaveAccessibleDescription('Укажите корректный email.');
    await emailInput.fill(email);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  return email;
}

test('account CRUD uses the real API and persists in a new browser session', async ({
  page,
  browser,
}) => {
  const email = await register(page, true);
  await expect(page.getByRole('heading', { name: 'Нет проектов' })).toBeVisible();
  const examples = page.getByRole('region', { name: 'Примеры проектов' });
  await expect(examples.getByRole('heading', { level: 3 })).toHaveText([
    'Storefront · демопроект',
    'Spring Petclinic',
    'Conduit / RealWorld',
    'Fullstack Todo',
    "Stan's Robot Shop",
    'React + Express + MongoDB',
  ]);
  await page.getByRole('link', { name: 'Новый проект', exact: true }).click();
  await page.getByLabel('Название проекта').fill('Серверный проект');
  await page.getByLabel('Адрес приложения').fill('https://shop.example.test');
  await page.getByLabel('Файл OpenAPI').setInputFiles({
    name: 'shop.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exampleSpecification),
  });
  await page.getByRole('button', { name: 'Сохранить проект' }).click();
  await expect(page.getByRole('heading', { name: 'Серверный проект', exact: true })).toBeVisible();
  const projectPage = page.url();
  await page.getByRole('link', { name: 'Настройки проекта', exact: true }).click();
  await page.getByLabel('Название проекта').fill('Обновлённый проект');
  await page.getByRole('button', { name: 'Сохранить проект' }).click();
  await expect(page.getByText('Проект сохранён.')).toBeVisible();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Вход в FaultView' })).toBeVisible();

  const context = await browser.newContext();
  try {
    const second = await context.newPage();
    await second.goto(projectPage);
    await second.getByLabel('Email').fill(email);
    await second.getByLabel('Пароль').fill(password);
    await second.getByRole('button', { name: 'Войти', exact: true }).click();
    await expect(
      second.getByRole('heading', { name: 'Обновлённый проект', exact: true }),
    ).toBeVisible();
    await second.getByRole('link', { name: 'Все проекты' }).click();
    await second.getByRole('button', { name: 'Удалить проект Обновлённый проект' }).click();
    await second
      .getByRole('dialog')
      .getByRole('button', { name: 'Удалить проект', exact: true })
      .click();
    await expect(second.getByText('Проект удалён.')).toBeVisible();
    await second.reload();
    await expect(second.getByRole('heading', { name: 'Нет проектов' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('live Storefront runs save private S3 screenshots and can be compared after reload', async ({
  page,
  request,
}) => {
  await register(page);
  await page.getByRole('button', { name: 'Открыть демопроект' }).click();
  await page.getByRole('button', { name: 'Построить граф', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Граф приложения' })).toBeVisible({
    timeout: 40_000,
  });
  await page.getByRole('link', { name: 'Запустить проверки', exact: true }).click();
  await page.getByRole('button', { name: 'Снять все' }).click();
  await page.getByRole('checkbox', { name: /^Healthy/ }).check();
  await page.getByRole('button', { name: 'Запустить проверки', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Тестирование завершено', exact: true }),
  ).toBeVisible({ timeout: 50_000 });
  const screenshot = page.getByRole('link', { name: /Открыть скриншот/ }).first();
  await expect(screenshot).toBeVisible();
  const src = (await screenshot.getAttribute('href'))!;
  const stored = await page.request.get(src);
  expect(stored.status()).toBe(200);
  expect(stored.headers()['content-type']).toContain('image/jpeg');
  expect((await stored.body()).subarray(0, 3).toString('hex')).toBe('ffd8ff');
  expect((await request.get(src)).status()).toBe(401);

  const firstRunUrl = page.url();
  await page.getByRole('button', { name: 'Повторить проверки' }).click();
  await expect(page).not.toHaveURL(firstRunUrl);
  await expect(
    page
      .getByText('Идут проверки', { exact: true })
      .or(page.getByRole('heading', { name: 'Тестирование завершено', exact: true })),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Тестирование завершено', exact: true }),
  ).toBeVisible({ timeout: 50_000 });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Тестирование завершено', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'История', exact: true }).click();
  await page.getByRole('link', { name: 'Сравнить прогоны', exact: true }).click();
  await page.getByRole('button', { name: 'Сравнить', exact: true }).click();
  await expect(page.getByText(/Сравнение готово/)).toBeVisible();
  await expect(
    page
      .getByRole('table', { name: 'Результаты сопоставления проверок' })
      .getByText('Healthy', { exact: true })
      .first(),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Все проекты' }).click();
  await page.getByRole('button', { name: 'Открыть «Spring Petclinic»' }).click();
  await expect(page.getByRole('heading', { name: 'Spring Petclinic', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Построить граф', exact: true }).click();
  const graph = page.getByRole('region', { name: 'Граф приложения' });
  await expect(
    graph.locator('path.observed title').filter({ hasText: 'GET /api/vets' }),
  ).toHaveCount(1);
});
