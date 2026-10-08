import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('risk review stays local, requires selection, adds evidence, avoids duplicates and supports undo', async ({
  page,
}) => {
  await page.goto('/#new');
  await page.getByLabel('What happened').fill('Approval is pending.\n\n人手不足。');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  const posts = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') posts.push(r.url());
  });
  await page.getByRole('button', { name: 'Review project risks', exact: true }).click();
  await expect(page.locator('[data-risk]')).toHaveCount(2);
  await expect(page.locator('[data-risk]:checked')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include('#modal').analyze()).violations).toEqual([]);
  await expect(page.locator('#risk-add')).toBeDisabled();
  await page.locator('[data-risk="0"]').check();
  await page.locator('#risk-add').click();
  await expect(page.locator('#cards .card')).toHaveCount(3);
  await expect(page.locator('[data-risk="0"]')).toBeDisabled();
  await page.locator('#risk-undo').click();
  await expect(page.locator('#cards .card')).toHaveCount(2);
  await page.locator('[data-risk="0"]').check();
  await page.locator('#risk-add').click();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  // Reload only after the asynchronous library transaction has committed.
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.locator('#cards')).toContainText('Needs discussion');
  await expect(page.locator('#sources')).toContainText('[Brief risk review]');
  await page.getByRole('button', { name: 'Review project risks', exact: true }).click();
  await expect(page.locator('[data-risk]')).toHaveCount(2);
  await expect(page.locator('[data-risk="0"]')).toBeDisabled();
  expect(posts).toEqual([]);
});
test('empty review avoids claiming safety and date errors clear results', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/#new');
  await page.getByLabel('What happened').fill('Pilot completed successfully.');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await page.getByRole('button', { name: 'Review project risks', exact: true }).click();
  await expect(page.locator('#risk-status')).toContainText(
    'does not mean the project is risk-free',
  );
  await expect(page.locator('#risk-add')).toBeDisabled();
  await page.locator('#risk-date').fill('');
  await page.locator('#risk-rescan').click();
  await expect(page.locator('#risk-status')).toContainText('valid review date');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
