import { test, expect } from '@playwright/test';
import { htmlDocument, reportHTML } from '../../src/domain/export.js';
import { emptyReport, createCard } from '../../src/domain/report.js';

async function createReport(page) {
  await page.goto('/#new');
  await page.getByLabel('What happened').fill('Pilot is ready.\n\n80 of 100 devices deployed.');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await page.getByLabel('Report title', { exact: true }).fill('Rollout & 進度');
  await page.getByRole('button', { name: 'Share…' }).click();
}

test('downloaded report and single card are centered and reflow on narrow screens', async ({
  page,
}) => {
  const report = emptyReport('Alignment example');
  report.cards = [
    createCard('update', { title: 'Pilot is ready', body: 'Deployment can proceed.' }),
  ];
  for (const document of [
    reportHTML(report),
    htmlDocument('Single card', '<section>Single card</section>'),
  ]) {
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(document);
      const box = await page.locator('.export-page').boundingBox();
      expect(Math.abs(box.x - (width - box.x - box.width))).toBeLessThan(2);
      expect(box.width).toBeLessThanOrEqual(728);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(reportHTML(report));
  await page.screenshot({ path: '.build/export-centered.png' });
});

test('email opens a complete prefilled mailto draft without copying or setting a recipient', async ({
  page,
}) => {
  await createReport(page);
  // Observe the launch URI but prevent an actual email app opening in automated tests.
  await page.locator('#email-open').evaluate((link) =>
    link.addEventListener('click', (event) => {
      event.preventDefault();
      window.__emailDraft = link.href;
    }),
  );
  await page.locator('.copy-options > summary').click();
  await page.getByRole('link', { name: /Open email app/ }).click();
  const url = new URL(await page.evaluate(() => window.__emailDraft));
  expect(url.protocol).toBe('mailto:');
  expect(url.pathname).toBe('');
  expect(url.searchParams.get('subject')).toBe('Rollout & 進度');
  expect(url.searchParams.get('body')).toContain('Pilot is ready');
  expect(url.searchParams.get('body')).toContain('80 of 100 devices deployed');
  await expect(page.locator('#share-status')).toContainText('handoff requested');
});

test('native share passes only selected report text and treats cancellation as normal', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (data) => !data.files,
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        window.__shared = data;
        throw new DOMException('User cancelled', 'AbortError');
      },
    });
  });
  await createReport(page);
  await page.getByRole('button', { name: /Share to apps/ }).click();
  await expect(page.locator('#share-status')).toHaveText('Sharing cancelled.');
  const payload = await page.evaluate(() => window.__shared);
  expect(Object.keys(payload).sort()).toEqual(['text', 'title']);
  expect(payload.text).toContain('80 of 100');
  await expect(page.locator('#native-share')).toBeEnabled();
  await expect(page.locator('#native-file-share')).toHaveCount(0);
});

test('supported native file sharing contains the centered HTML for only the selected card', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        window.__sharedFile = {
          type: data.files[0].type,
          text: await data.files[0].text(),
          count: data.files.length,
        };
      },
    });
  });
  await createReport(page);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByLabel('Options for Pilot is ready', { exact: true }).click();
  await page.getByRole('button', { name: 'Share Pilot is ready', exact: true }).click();
  await page.locator('#share-format').selectOption('html');
  await page.locator('#native-share').click();
  await expect(page.locator('#share-status')).toContainText('Opened in the selected app');
  const shared = await page.evaluate(() => window.__sharedFile);
  expect(shared.type).toBe('text/html');
  expect(shared.count).toBe(1);
  expect(shared.text).toContain('export-page');
  expect(shared.text).toContain('Pilot is ready');
  expect(shared.text).not.toContain('80 of 100');
});

test('unavailable or failed native sharing leaves email and downloads available', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await createReport(page);
  await expect(page.locator('#native-share')).toBeDisabled();
  await page.locator('.copy-options > summary').click();
  await expect(page.getByRole('link', { name: /Open email app/ })).toBeVisible();
  await expect(page.locator('#share-export')).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        throw Error('Rejected');
      },
    });
  });
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Share…' }).click();
  await page.locator('#native-share').click();
  await expect(page.locator('#share-status')).toContainText('Could not open sharing');
  await expect(page.locator('#native-share')).toBeEnabled();
});
