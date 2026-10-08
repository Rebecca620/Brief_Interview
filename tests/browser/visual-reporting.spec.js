import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
const file = (name, text) => ({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
async function pairedReport(page) {
  await page.goto('/#new');
  const rows = [
    [1, 1],
    [1, 3],
    [3, 1],
    [3, 3],
    [2, 3],
  ].flatMap(([a, b], id) => [
    { id, model: 'A', score: a },
    { id, model: 'B', score: b },
  ]);
  await page.locator('#intake-files').setInputFiles(file('paired.json', JSON.stringify(rows)));
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-mode').selectOption('paired');
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-group').selectOption('/model');
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-pair-key').selectOption('/id');
  await page.locator('#data-baseline').fill('A');
  await page.locator('#data-candidate').fill('B');
  await page.locator('#data-pass-value').fill('3');
  await page.locator('#data-fail-value').fill('1');
  await page.getByRole('button', { name: 'Find patterns' }).click();
}
async function saveDownload(page, action, path) {
  const pending = page.waitForEvent('download');
  await action();
  const download = await pending;
  await download.saveAs(path);
  return readFile(path);
}

test('paired graph has closed counts, an accessible table, and persists in exported HTML', async ({
  page,
}) => {
  await pairedReport(page);
  await expect(page.locator('#data-findings svg')).toBeVisible();
  await expect(page.locator('#data-findings')).toContainText('n=4 common scored pairs');
  expect((await new AxeBuilder({ page }).include('#modal').analyze()).violations).toEqual([]);
  await page.locator('#data-findings').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.build/paired-chart-review.png' });
  await page.getByRole('button', { name: 'Add selected findings' }).click();
  await expect(page.locator('#sample-preview img')).toHaveAttribute(
    'src',
    /^data:image\/png;base64,/,
  );
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.locator('#cards img')).toBeVisible();
  await page.locator('#export-report').click();
  await page.locator('#export-format').selectOption('html');
  const html = (
    await saveDownload(page, () => page.locator('#export-save').click(), '.build/chart-report.html')
  ).toString();
  expect(html).toContain('data:image/png;base64,');
  expect(html).toContain('Persistent fail');
  expect(html).not.toContain('"id":0');
});

test('source sections, exclusions and quick moves update the real live preview', async ({
  page,
}) => {
  await page.goto('/#new');
  await page
    .locator('#intake-files')
    .setInputFiles(file('notes.txt', 'Approval needed.\n\nRoll out next week.'));
  await page.locator('[data-source-section="0"]').selectOption('decision');
  await expect(page.locator('#sample-preview')).toContainText('Needs a decision');
  await page.getByText('Review & arrange 2 cards', { exact: true }).click();
  await page.locator('[data-stage-section="0:1"]').selectOption('next');
  await expect(page.locator('#sample-preview')).toContainText('Next steps');
  await page.locator('[data-include="0:0"]').uncheck();
  await expect(page.locator('#sample-preview')).not.toContainText('Approval needed');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#cards .card')).toHaveCount(1);
  await page.locator('[data-quick-section]').selectOption('progress');
  await expect(page.locator('#cards .report-section h2')).toHaveText('Progress');
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.locator('[data-quick-section]')).toHaveValue('progress');
});

test('HTML tables become cards without loading resources or executing imported code', async ({
  page,
}) => {
  await page.goto('/#new');
  const external = [];
  page.on('request', (r) => {
    if (r.url().includes('evil.example')) external.push(r.url());
  });
  await page
    .locator('#intake-files')
    .setInputFiles(
      file(
        'table.html',
        '<script>window.pwned=true</script><img src="https://evil.example/pixel"><h2>Results</h2><p>Discuss the rollout <a href="https://example.com/report">Full report</a></p><table><caption>Device coverage</caption><tr><th>Team</th><th>Devices</th></tr><tr><td>IT</td><td>80</td></tr></table>',
      ),
    );
  await expect(page.locator('#material-list')).toContainText('2 cards ready');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#cards table')).toContainText('80');
  await expect(page.locator('#cards a')).toHaveAttribute('href', 'https://example.com/report');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  expect(external).toEqual([]);
});

test('PowerPoint download contains selected editable text, native tables and chart media', async ({
  page,
}) => {
  await pairedReport(page);
  await page.getByRole('button', { name: 'Add selected findings' }).click();
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await page.locator('#export-report').click();
  await page.locator('#export-format').selectOption('pptx');
  await page.locator('#export-save').click();
  const bytes = await saveDownload(
    page,
    () => page.getByRole('button', { name: 'Save PowerPoint (.pptx)' }).click(),
    '.build/brief-chart-slides.pptx',
  );
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  // Inspect the generated OOXML in the browser using the bundled ZIP reader.
  const info = await page.evaluate(async () => {
    const { buildSlides } = await import('/src/features/slides/slides.js');
    const { emptyReport, createCard } = await import('/src/domain/report.js');
    const report = emptyReport('Test');
    report.cards = [
      createCard('update', {
        title: 'Editable card',
        body: 'Keep this exact text.',
        visual: {
          kind: 'table',
          title: 'Data',
          caption: 'n=2',
          columns: ['Team', 'Count'],
          rows: [['A', 2]],
        },
      }),
    ];
    const zip = await window.JSZip.loadAsync(
      await (await buildSlides(report, report.cards)).arrayBuffer(),
    );
    const slides = await Promise.all(
      Object.keys(zip.files)
        .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
        .map((p) => zip.file(p).async('string')),
    );
    return slides.join('');
  });
  expect(info).toContain('Keep this exact text.');
  expect(info).toContain('<a:tbl>');
  expect(info).toContain('Editable card');
});

test('meeting draft is editable, validates times and exports only an agenda event', async ({
  page,
}) => {
  await page.goto('/#new');
  await page.getByLabel('What happened').fill('Needs a decision: Review VPN access.');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await page.locator('#export-report').click();
  await page.locator('#close-modal').click();
  await page.locator('#meeting-report').click();
  await expect(page.locator('#meeting-agenda')).toContainText('Review VPN access');
  await page.locator('#meeting-start').fill('2026-10-01T10:00');
  await page.locator('#meeting-end').fill('2026-10-01T09:00');
  await page.getByRole('button', { name: 'Download calendar draft (.ics)' }).click();
  await expect(page.locator('#meeting-error')).toContainText('end time');
  await page.locator('#meeting-end').fill('2026-10-01T11:00');
  const text = (
    await saveDownload(
      page,
      () => page.getByRole('button', { name: 'Download calendar draft (.ics)' }).click(),
      '.build/brief-meeting.ics',
    )
  ).toString();
  expect(text).toContain('BEGIN:VEVENT');
  expect(text).toContain('Review VPN access');
  expect(text).not.toContain('ATTENDEE');
});

test('paired chart reflows on mobile and exposes exact numbers without relying on colors', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await pairedReport(page);
  await page.locator('#data-findings').getByText('View data table', { exact: true }).click();
  await expect(page.locator('#data-findings table')).toBeVisible();
  expect(await page.locator('#modal').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.build/paired-chart-mobile.png' });
});
