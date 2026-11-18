import { expect, test } from '@playwright/test';
for (const story of [
  'ui-button--primary',
  'ui-button--disabled',
  'ui-button--loading',
  'ui-statusbadge--completed',
  'ui-statusbadge--failed',
  'ui-notice--error',
  'forms-projectform--filled',
]) {
  test(story, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story}&viewMode=story`);
    await page.locator('#storybook-root').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#storybook-root')).not.toBeEmpty();
    await expect(page).toHaveScreenshot(`${story}.png`, { fullPage: true });
  });
}
