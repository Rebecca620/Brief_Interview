import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const upload = (page, name, value) =>
  page.locator('#intake-files').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
  });

test('numeric import reviews fields, selected findings, original data and persistence', async ({
  page,
}) => {
  await page.goto('/#new');
  const requests = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') requests.push(request.url());
  });
  await upload(page, 'progress.json', {
    records: [
      { value: 2, team: 'IT', date: '2026-01-01' },
      { value: 6, team: 'IT', date: '2026-01-02' },
      { value: null, team: 'IT' },
    ],
  });
  await expect(page.getByRole('heading', { name: 'Review data import' })).toBeVisible();
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.getByRole('combobox', { name: 'Group by', exact: true }).selectOption('/team');
  await page.getByRole('combobox', { name: 'Date field', exact: true }).selectOption('/date');
  await page.getByRole('button', { name: 'Find patterns' }).click();
  await expect(page.locator('#data-findings')).toContainText('2/3 records');
  await expect(page.locator('#data-findings')).toContainText('Absolute change 4');
  expect((await new AxeBuilder({ page }).include('#modal').analyze()).violations).toEqual([]);
  await page.locator('[data-finding="2"]').uncheck();
  await page.screenshot({ path: '.build/data-import-review.png' });
  await page.getByRole('button', { name: 'Add selected findings' }).click();
  await expect(page.locator('#material-list')).toContainText('3 cards ready');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#builder-view')).toBeVisible();
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.locator('#sources')).toContainText('progress.json');
  await expect(page.locator('#sources')).toContainText('"value":2');
  await expect(page.locator('#sources')).toContainText('SHA-256');
  expect(requests).toEqual([]);
});

test('evaluation JSONL uses explicit passing rule, and edits invalidate old findings', async ({
  page,
}) => {
  await page.goto('/#new');
  await upload(
    page,
    'scores.jsonl',
    '{"score":3,"model":"A"}\n{"score":1,"model":"A"}\n{"score":null,"model":"B"}',
  );
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.getByRole('combobox', { name: 'Report type', exact: true }).selectOption('evaluation');
  await page.getByRole('combobox', { name: 'Passing rule', exact: true }).selectOption('gte');
  await page.getByLabel('Pass threshold', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Find patterns' }).click();
  await expect(page.locator('#data-findings')).toContainText('1/2 eligible evaluations pass (50%)');
  await page.getByLabel('Pass threshold', { exact: true }).fill('1');
  await expect(page.getByRole('button', { name: 'Add selected findings' })).toBeHidden();
  await page.getByRole('button', { name: 'Find patterns' }).click();
  await expect(page.locator('#data-findings')).toContainText(
    '2/2 eligible evaluations pass (100%)',
  );
  await page.getByRole('button', { name: 'Cancel import' }).click();
  await expect(page.locator('#material-list')).toBeEmpty();
  await expect(page.locator('#intake-files')).toBeEnabled();
});

test('compress schema selects evaluation mode and exposes candidate score owners', async ({
  page,
}) => {
  await page.goto('/#new');
  await upload(page, 'compress.json', {
    type: 'compress',
    id: 'case-1',
    dialog: [
      {
        role: 'assistant',
        turn_index: 0,
        content: 'GT',
        metrics: { human: 99 },
        evaluate: { A: { metrics: { human: { score: 3 } } } },
      },
      {
        role: 'assistant',
        turn_index: 1,
        loss: false,
        evaluate: { A: { metrics: { human: { score: 1 } } } },
      },
    ],
  });
  await expect(page.locator('#data-mode')).toHaveValue('evaluation');
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-metric').selectOption('/candidate/metrics/human/score');
  await page.getByRole('button', { name: 'Find patterns' }).click();
  await expect(page.locator('#data-findings')).toContainText('1/1 records');
  await expect(page.locator('#data-findings')).toContainText('1 masked assistant turns excluded');
  await expect(page.locator('#data-findings')).toContainText('1-0-1');
  await page.keyboard.press('Escape');
  await expect(page.locator('#intake-files')).toBeEnabled();
});

test('malformed JSONL gives line error and mobile review stays inside viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/#new');
  await upload(page, 'broken.jsonl', '{"score":2}\ninvalid');
  await expect(page.locator('#error-banner')).toContainText('line 2');
  await page.locator('.example-data > summary').click();
  await page.getByRole('button', { name: 'JSON project data', exact: true }).click();
  await page.getByRole('button', { name: 'Find patterns' }).click();
  expect(
    await page.evaluate(
      () =>
        document.querySelector('#modal').scrollWidth <=
        document.querySelector('#modal').clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: '.build/data-import-mobile.png' });
});

test('multiple data files each receive their own review and can be cancelled independently', async ({
  page,
}) => {
  await page.goto('/#new');
  await page.locator('#intake-files').setInputFiles(
    ['one.json', 'two.json'].map((name) => ({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from('[{"score":2}]'),
    })),
  );
  await expect(page.locator('#modal-body')).toContainText('one.json');
  await page.getByRole('button', { name: 'Find patterns' }).click();
  await page.getByRole('button', { name: 'Add selected findings' }).click();
  await expect(page.locator('#modal-body')).toContainText('two.json');
  await page.getByRole('button', { name: 'Cancel import' }).click();
  await expect(page.locator('#material-list')).toContainText('one.json');
  await expect(page.locator('#material-list')).not.toContainText('two.json');
  await expect(page.locator('#intake-files')).toBeEnabled();
});
