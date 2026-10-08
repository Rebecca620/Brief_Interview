import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.nativeCalls = [];
    window.briefHost = {
      storage: window.localStorage,
      send: async (action, payload) => {
        window.nativeCalls.push({ action, payload });
        return { status: 'handed-off', saved: true };
      },
    };
  });
  await page.goto('/#new');
  await page.waitForFunction(() => typeof window.briefCapture === 'function');
});

const capture = {
  title: 'Menu bar update',
  notes: 'Progress: Shipping the prototype.',
  destination: '',
  template: 'standard',
  files: [],
};
const file = (value) => ({
  name: 'metrics.json',
  type: 'application/json',
  data: Buffer.from(JSON.stringify(value)).toString('base64'),
});

test('native capture creates readable cards, flushes and appends to saved reports', async ({
  page,
}) => {
  const result = await page.evaluate((payload) => window.briefCapture(payload), {
    ...capture,
    files: [
      file([
        { date: '2026-09-01', completed: 0 },
        { date: '2026-09-02', completed: 20 },
      ]),
    ],
  });
  expect(result.consumed).toBe(true);
  await expect(page.locator('#cards h3')).toHaveCount(4);
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('brief-library-v2'))[0].id);
  await page.evaluate((payload) => window.briefCapture(payload), {
    ...capture,
    destination: id,
    notes: 'Next steps: Review with the team.',
  });
  await expect(page.locator('#cards h3')).toHaveCount(5);
  expect(await page.evaluate(() => window.briefFlush())).toBe(true);
  await page.reload();
  await expect(page.locator('#cards h3')).toHaveCount(5);
});

test('ambiguous import cancellation and malformed inputs leave the library untouched', async ({
  page,
}) => {
  await page.evaluate((payload) => window.briefCapture(payload), capture);
  const before = await page.evaluate(() => localStorage.getItem('brief-library-v2'));
  await page.evaluate(
    (payload) => {
      window.pendingCapture = window.briefCapture(payload);
    },
    {
      ...capture,
      files: [
        file([
          { team: 'A', cost: 20, revenue: 30 },
          { team: 'B', cost: 30, revenue: 50 },
        ]),
      ],
    },
  );
  await expect(page.getByRole('heading', { name: 'Review data import' })).toBeVisible();
  await page.locator('#data-cancel').click();
  expect((await page.evaluate(() => window.pendingCapture)).consumed).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('brief-library-v2'))).toBe(before);
  const error = await page.evaluate(
    async (payload) => {
      try {
        await window.briefCapture(payload);
      } catch (error) {
        return error.message;
      }
    },
    {
      ...capture,
      files: [{ name: 'broken.json', type: 'application/json', data: btoa('{invalid') }],
    },
  );
  expect(error).toBeTruthy();
  expect(await page.evaluate(() => localStorage.getItem('brief-library-v2'))).toBe(before);
});

test('native file handoff preserves bytes and handles cancellation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { shareWithApps } = await import('/src/features/sharing/native-share.js');
    const status = await shareWithApps({
      title: 'Report',
      files: [new File(['card content'], 'report.html', { type: 'text/html' })],
    });
    const sent = window.nativeCalls.find((call) => call.action === 'share');
    window.briefHost.send = async () => ({ status: 'cancelled' });
    return { status, sent, cancelled: await shareWithApps({ text: 'Report' }) };
  });
  expect(result.status).toBe('handed-off');
  expect(Buffer.from(result.sent.payload.files[0].data, 'base64').toString()).toBe('card content');
  expect(result.cancelled).toBe('cancelled');
});

test('report names stay synchronized with the native destination list', async ({ page }) => {
  const result = await page.evaluate((payload) => window.briefCapture(payload), capture);
  expect(result.reportId).toBeTruthy();
  await page.locator('#report-title').fill('Renamed without navigating');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.nativeCalls.filter((c) => c.action === 'reports').at(-1).payload.reports[0].title,
      ),
    )
    .toBe('Renamed without navigating');
});

test('Word and PDF from native capture append to one existing report after review', async ({
  page,
  browser,
}) => {
  const created = await page.evaluate((payload) => window.briefCapture(payload), capture);
  await page.addScriptTag({ url: '/vendor/jszip.min.js' });
  const word = await page.evaluate(async () => {
    const zip = new window.JSZip();
    zip.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word evidence: rollout owner confirmed.</w:t></w:r></w:p></w:body></w:document>',
    );
    return {
      name: 'follow-up.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      data: await zip.generateAsync({ type: 'base64' }),
    };
  });
  const source = await browser.newPage();
  await source.setContent('<p>PDF evidence: training completed.</p>');
  const pdf = {
    name: 'follow-up.pdf',
    type: 'application/pdf',
    data: (await source.pdf()).toString('base64'),
  };
  await source.close();
  for (const document of [word, pdf]) {
    await page.evaluate(
      (payload) => {
        window.pendingCapture = window.briefCapture(payload);
      },
      { ...capture, destination: created.reportId, notes: '', files: [document] },
    );
    await expect(page.getByRole('heading', { name: 'Review document import' })).toBeVisible();
    await page.locator('#document-section').selectOption('discussion');
    await expect(page.locator('#modal')).toBeVisible();
    await page.locator('#document-add').click();
    const added = await page.evaluate(() => window.pendingCapture);
    expect(added.consumed).toBe(true);
    expect(added.reportId).toBe(created.reportId);
  }
  await expect(page.locator('#cards h3')).toHaveCount(3);
  await expect(page.locator('#cards')).toContainText('rollout owner confirmed');
  await expect(page.locator('#cards')).toContainText('training completed');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('brief-library-v2')).length),
  ).toBe(1);
  await page.reload();
  await expect(page.locator('#cards h3')).toHaveCount(3);
});

test('outside click cancels native review atomically and permits another capture', async ({
  page,
}) => {
  const created = await page.evaluate((payload) => window.briefCapture(payload), capture);
  await page.evaluate(
    (payload) => {
      window.pendingCapture = window.briefCapture(payload);
    },
    {
      ...capture,
      destination: created.reportId,
      notes: '',
      files: [
        file([
          { cost: 1, revenue: 5 },
          { cost: 2, revenue: 6 },
        ]),
      ],
    },
  );
  await expect(page.locator('#modal')).toBeVisible();
  await page.mouse.click(3, 3);
  expect((await page.evaluate(() => window.pendingCapture)).consumed).toBe(false);
  await expect(page.locator('#cards h3')).toHaveCount(1);
  const added = await page.evaluate((payload) => window.briefCapture(payload), {
    ...capture,
    destination: created.reportId,
    notes: 'Next steps: Retry after review.',
  });
  expect(added.consumed).toBe(true);
  await expect(page.locator('#cards h3')).toHaveCount(2);
});

test('outside click dismisses settings and editing without applying unsaved card changes', async ({
  page,
}) => {
  await page.evaluate((payload) => window.briefCapture(payload), capture);
  await page.locator('[data-edit]').first().click();
  await page.locator('#edit-title').fill('Do not save this');
  await expect(page.locator('#modal')).toBeVisible();
  await page.mouse.click(3, 3);
  await expect(page.locator('#modal')).not.toBeVisible();
  await expect(page.locator('#cards')).not.toContainText('Do not save this');
  await page.locator('#settings-button').click();
  await expect(page.locator('#settings-modal')).toBeVisible();
  await page.mouse.click(3, 3);
  await expect(page.locator('#settings-modal')).not.toBeVisible();
});
