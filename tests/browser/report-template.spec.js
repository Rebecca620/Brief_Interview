import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { buildTestKit } from '../../scripts/testing/build-test-kit.mjs';
let kit;
test.beforeAll(async () => {
  kit = await buildTestKit('.build/browser-test-kit');
});

test('reference report restores, switches layouts without changing cards and previews accessibly', async ({
  page,
}) => {
  await page.goto('/#new');
  await page.locator('#settings-button').click();
  await page
    .locator('#restore-library')
    .setInputFiles(`${kit}/reference/01-retrospective-backup.json`);
  await expect(page.locator('#toast')).toContainText('1 reports restored');
  await page.locator('#close-settings').click();
  // Library navigation is a normal user action, not a storage fixture shortcut.
  await page.goto('/#library');
  await page.locator('[data-open-report]').first().click();
  await expect(page.locator('#cards .card')).toHaveCount(10);
  await expect(page.locator('#report-template')).toHaveValue('retrospective');
  await page.locator('#preview-layout').click();
  await expect(page.locator('#modal-body')).toContainText('核心共识');
  await expect(page.locator('#modal-body table').last().locator('tbody tr')).toHaveCount(2);
  expect((await new AxeBuilder({ page }).include('#modal').analyze()).violations).toEqual([]);
  await page.screenshot({ path: '.build/retrospective-preview-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('#report-template').selectOption('standard');
  await expect(page.locator('#cards .card')).toHaveCount(10);
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.locator('#report-template')).toHaveValue('standard');
  await page.locator('#report-template').selectOption('retrospective');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator('#preview-layout').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    await page.locator('#modal-body').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: '.build/retrospective-preview-mobile.png', fullPage: true });
});

test('test-kit numeric and paired gold values agree with the rendered analysis', async ({
  page,
}) => {
  await page.goto('/#new');
  await page.locator('#intake-files').setInputFiles(`${kit}/valid/04-project-data.json`);
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-metric').selectOption('/completed');
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-group').selectOption('/team');
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-date').selectOption('/date');
  await page.locator('#data-analyze').click();
  await expect(page.locator('#data-findings')).toContainText('8/10');
  await expect(page.locator('#data-findings')).toContainText('Mean 45; median 35');
  await expect(page.locator('#data-findings')).toContainText('1/8 values');
  await page.locator('#data-cancel').click();
  await expect(page.locator('#intake-files')).toBeEnabled();
  await page.locator('#intake-files').setInputFiles(`${kit}/valid/06-paired-models.json`);
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-mode').selectOption('paired');
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-metric').selectOption('/score');
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-group').selectOption('/model');
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-pair-key').selectOption('/case_id');
  await page.locator('#data-baseline').fill('Baseline');
  await page.locator('#data-candidate').fill('Candidate');
  await page.locator('#data-pass-value').fill('3');
  await page.locator('#data-fail-value').fill('1');
  await page.locator('#data-analyze').click();
  await expect(page.locator('#data-findings')).toContainText('50.00% → 66.67%');
  await expect(page.locator('#data-findings')).toContainText('2 improved; 1 regressed');
});

test('downloaded reference HTML stays centered and does not overflow on mobile', async ({
  page,
}) => {
  const html = await readFile(`${kit}/reference/02-retrospective-preview.html`, 'utf8');
  await page.setContent(html);
  const box = await page.locator('.export-page').boundingBox();
  expect(Math.abs(box.x - (1440 - box.width) / 2)).toBeLessThan(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: '.build/retrospective-export-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.build/retrospective-export-mobile.png', fullPage: true });
});
