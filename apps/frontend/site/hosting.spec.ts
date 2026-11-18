import { expect, test } from '@playwright/test';
test('published Storybook loads a component under the hosting prefix', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  await page.goto('./storybook/');
  await expect(page.locator('#storybook-preview-iframe')).toBeVisible();
  await page.goto('./storybook/iframe.html?id=ui-button--primary&viewMode=story');
  await expect(page.locator('#storybook-root').getByRole('button')).toBeVisible();
  expect(failures).toEqual([]);
});

test('built landing links to the SPA, assets load under the hosting prefix and deep links reload', async ({
  page,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('API упал.');
  await page.getByRole('link', { name: 'Открыть приложение', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible();
  const appUrl = page.url();
  const skip = page.getByRole('link', { name: 'К содержимому' });
  await skip.focus();
  await skip.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  expect(page.url()).toBe(appUrl);
  await page.getByRole('button', { name: 'Открыть пример' }).click();
  await expect(page.getByRole('heading', { name: 'Storefront', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Storefront', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/site/project-desktop.png', fullPage: true });
  expect(failures).toEqual([]);
});
