import { expect, test } from '@playwright/test';
import examples from '../projects.json' with { type: 'json' };

async function open(page, id, hash = '') {
  await page.goto(`./examples/${id}/${hash}`);
  await expect(page.locator('html')).toHaveAttribute('data-examples-ready', id);
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось' })).toHaveCount(0);
}

test('original Storefront preserves catalogue checkout profile and controlled failures', async ({
  page,
}) => {
  await open(page, 'storefront');
  await expect(page.getByRole('heading', { name: 'Good things. Simply made.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Studio headphones' })).toBeVisible();
  await page.getByRole('link', { name: 'Checkout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your bag.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your bag.' })).toBeVisible();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page.getByText('Welcome, Alex Morgan. You have 3 orders.')).toBeVisible();
  await page.getByLabel('Сценарий API').selectOption('http503');
  await expect(page.getByText('Profile unavailable. Please try again.')).toBeVisible();
  await page.getByLabel('Сценарий API').selectOption('healthy');
  await expect(page.getByText('Welcome, Alex Morgan. You have 3 orders.')).toBeVisible();
});

test('original Petclinic lists upstream seed records and persists a new owner', async ({
  page,
}) => {
  await open(page, 'petclinic', '#/owners');
  await expect(page.getByText('George Franklin', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add Owner', exact: true }).click();
  await page.getByLabel('First Name', { exact: true }).fill('Alice');
  await page.getByLabel('Last Name', { exact: true }).fill('Example');
  await page.getByLabel('Address', { exact: true }).fill('12 Test Street');
  await page.getByLabel('City', { exact: true }).fill('London');
  await page.getByLabel('Telephone', { exact: true }).fill('1234567890');
  await page.getByRole('button', { name: 'Add Owner', exact: true }).click();
  await expect(page.getByText('Alice Example', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Alice Example', { exact: true })).toBeVisible();
  await open(page, 'petclinic', '#/vets');
  await expect(page.getByText('James Carter', { exact: true })).toBeVisible();
});

test('original Conduit supports its feed and publication form', async ({ page }) => {
  await open(page, 'conduit');
  await expect(
    page.getByRole('heading', { name: 'Welcome to RealWorld', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Login/ }).click();
  await page.getByPlaceholder('Email', { exact: true }).fill('demo@example.test');
  await page.getByPlaceholder('Password', { exact: true }).fill('demo-pass');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.getByRole('link', { name: /New Article/ }).click();
  await page.getByPlaceholder('Article Title', { exact: true }).fill('Published original frontend');
  await page
    .getByPlaceholder("What's this article about?", { exact: true })
    .fill('Local API adapter');
  await page
    .getByPlaceholder('Write your article (in markdown)', { exact: true })
    .fill('This is the original Conduit editor.');
  await page.getByRole('button', { name: 'Publish Article', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Published original frontend', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Published original frontend', exact: true }),
  ).toBeVisible();
});

test('original Fullstack Todo creates tasks and survives reload', async ({ page }) => {
  await open(page, 'todo');
  await expect(page.getByRole('heading', { name: 'My Tasks' })).toBeVisible();
  await page.getByPlaceholder('Enter your task', { exact: true }).fill('Persist original task');
  await page
    .getByPlaceholder('Enter your Description', { exact: true })
    .filter({ visible: true })
    .fill('Created in the upstream UI');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'Persist original task', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('cell', { name: 'Persist original task', exact: true }),
  ).toBeVisible();
});

test('original Robot Shop loads upstream catalogue and persists its shopping cart', async ({
  page,
}) => {
  await open(page, 'robot-shop', '#/product/HPTD');
  await expect(page.getByRole('heading', { name: 'High-Powered Travel Droid' })).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect(page.getByText('Added to cart', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Cart', exact: true }).click();
  await expect(
    page.getByRole('cell', { name: 'High-Powered Travel Droid', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('cell', { name: 'High-Powered Travel Droid', exact: true }),
  ).toBeVisible();
});

test('original Docker Samples MongoDB Todo persists entries', async ({ page }) => {
  await open(page, 'react-express-mongodb');
  await expect(page.getByRole('heading', { name: 'Todos', exact: true })).toBeVisible();
  await page.locator('input[name="value"]').fill('Persist MongoDB sample');
  await page.getByRole('button', { name: 'Add Todo', exact: true }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Persist MongoDB sample' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Persist MongoDB sample' }),
  ).toBeVisible();
});

test('landing catalogue and workspace provide all six original projects', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: 'Исходные демопроекты', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Шесть исходных проектов', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Открыть приложение ↗', exact: true })).toHaveCount(
    6,
  );
  await page.getByRole('link', { name: '← FaultView', exact: true }).click();
  for (const example of examples) {
    await page.getByRole('button', { name: `Проверить ${example.name}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: example.name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Построить граф', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Локальный граф' })).toBeVisible();
    await page.getByRole('link', { name: 'Все проекты', exact: true }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'test-results/site/six-original-projects-mobile.png',
    fullPage: true,
  });
});
