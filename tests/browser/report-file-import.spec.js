import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { buildTestKit } from '../../scripts/testing/build-test-kit.mjs';
import { readFile } from 'node:fs/promises';
let kit;
test.beforeAll(async () => {
  kit = await buildTestKit('.build/report-file-kit');
});

test('normal upload recognizes report backups and preserves headings, cards, charts and owners', async ({
  page,
}) => {
  await page.goto('/#new');
  await page
    .locator('#intake-files')
    .setInputFiles(`${kit}/reference/01-retrospective-backup.json`);
  await expect(page.getByRole('heading', { name: 'Open report file' })).toBeVisible();
  await expect(page.locator('#data-mode')).toHaveCount(0);
  await expect(page.locator('#import-report-preview .email-card')).toHaveCount(8);
  await expect(page.locator('#import-report-preview')).not.toContainText('Record 1');
  expect((await new AxeBuilder({ page }).include('#modal').analyze()).violations).toEqual([]);
  await page.locator('#import-report-open').click();
  await expect(page.locator('#cards .card')).toHaveCount(10);
  await expect(page.locator('#report-title')).toHaveValue(/Critical Case/);
  await expect(page.locator('#cards')).toContainText('林晨');
  await expect(page.locator('#cards')).not.toContainText('person-a');
  await expect(page.locator('#cards')).not.toContainText('"mentions"');
  await expect(page.locator('#cards h2')).toHaveCount(5);
  await expect(page.locator('#cards h3')).toHaveCount(10);
  const sizes = await page.evaluate(() =>
    ['#report-title', '#cards h2', '#cards h3', '#cards .email-card p'].map((s) =>
      parseFloat(getComputedStyle(document.querySelector(s)).fontSize),
    ),
  );
  expect(sizes[0]).toBeGreaterThan(sizes[1]);
  expect(sizes[1]).toBeGreaterThanOrEqual(14); // Compact section labels sit above stronger card titles.
  expect(sizes[2]).toBeGreaterThan(sizes[3]);
  await page.screenshot({ path: '.build/report-hierarchy-desktop.png', fullPage: true });
  await page.reload();
  await expect(page.locator('#cards .card')).toHaveCount(10);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect
    .poll(() => page.locator('#report-title').evaluate((el) => el.scrollHeight <= el.clientHeight))
    .toBe(true);
  await page.screenshot({ path: '.build/report-hierarchy-mobile.png', fullPage: true });
});

test('cancel and invalid report backups cannot pollute or replace an existing draft', async ({
  page,
}) => {
  await page.goto('/#new');
  await page.getByLabel('What happened').fill('Keep this original report.');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  const route = page.url();
  await page
    .locator('#intake-files')
    .setInputFiles(`${kit}/reference/01-retrospective-backup.json`);
  await page.locator('#import-report-cancel').click();
  await expect(page.locator('#intake-files')).toBeEnabled();
  expect(page.url()).toBe(route);
  await expect(page.locator('#cards .card')).toHaveCount(1);
  const raw = JSON.parse(await readFile(`${kit}/reference/01-retrospective-backup.json`, 'utf8'));
  raw.reports[0].cards[0].owner = 'missing-owner';
  await page.locator('#intake-files').setInputFiles({
    name: 'broken-report.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(raw)),
  });
  await expect(page.locator('#error-banner')).toContainText('broken references');
  await expect(page.locator('#data-mode')).toHaveCount(0);
  await expect(page.locator('#cards .card')).toHaveCount(1);
});

test('text records use content titles and retain nested technical fields only as evidence', async ({
  page,
}) => {
  await page.goto('/#new');
  await page.locator('#intake-files').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify([
        {
          id: 'hidden-record-id',
          title: 'Sample definition needs review',
          body: 'The cohort changed this week.',
          metadata: { internal: 'keep this original' },
        },
      ]),
    ),
  });
  await page.locator('#data-analyze').click();
  await page.locator('#data-add').click();
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#cards h3')).toHaveText('Sample definition needs review');
  await expect(page.locator('#cards')).not.toContainText('hidden-record-id');
  await expect(page.locator('#cards')).not.toContainText('keep this original');
  await expect(page.locator('#sources')).toContainText('keep this original');
});

test('long report titles follow container and viewport changes without clipping', async ({
  page,
}) => {
  await page.goto('/#new');
  await page.getByLabel('What happened').fill('Progress: Resize regression.');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  const title = page.locator('#report-title');
  await title.fill(
    'Critical Case 项目复盘与策略对齐 — deployment evidence, ownership and decisions for the next reporting period',
  );
  for (const width of [280, 440, 240, 600]) {
    await page.locator('#report-heading').evaluate((node, width) => {
      node.style.width = `${width}px`;
      node.style.maxWidth = '100%';
    }, width);
    await expect
      .poll(() => title.evaluate((node) => node.scrollHeight <= node.clientHeight))
      .toBe(true);
  }
  await page.locator('#report-heading').evaluate((node) => node.removeAttribute('style'));
  for (const width of [375, 768, 1440, 320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => title.evaluate((node) => node.scrollHeight <= node.clientHeight))
      .toBe(true);
  }
});
