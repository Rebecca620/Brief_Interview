import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
async function createReport(page, notes = 'Pilot is live.\n\nAccess approval needed.') {
  await page.goto('/#new');
  await page.getByLabel('What happened').fill(notes);
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await page.getByLabel('Report title', { exact: true }).fill('Pilot report');
  await expect(page.locator('#cards .card')).toHaveCount(2);
}

test('import, edit, reorder, share one card, reload, append and undo', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await createReport(page);
  await page.getByRole('button', { name: 'Edit Pilot is live', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Launch complete');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByLabel('Options for Launch complete', { exact: true }).click();
  await page.getByRole('button', { name: 'Move Launch complete down' }).click();
  await expect(page.locator('#cards h3').last()).toHaveText('Launch complete');
  // Reload only after the asynchronous library transaction has committed.
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.locator('#cards h3').last()).toHaveText('Launch complete');
  await page.getByLabel('Options for Launch complete', { exact: true }).click();
  await page.getByRole('button', { name: 'Share Launch complete', exact: true }).click();
  await page.locator('.copy-options > summary').click();
  await page.locator('#share-export').click();
  await page.locator('#export-format').selectOption('html');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download HTML' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let html = '';
  for await (const chunk of stream) html += chunk;
  expect(html).toContain('Launch complete');
  expect(html).not.toContain('Access approval needed');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('#intake-files').setInputFiles({
    name: 'metrics.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('title,value,target\nDevices,84,100'),
  });
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#cards .card')).toHaveCount(3);
  await expect(page.locator('#cards')).toContainText('84% of target');
  await page.locator('#undo-addition').click();
  await expect(page.locator('#cards .card')).toHaveCount(2);
  await page.screenshot({ path: '.build/report-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('image descriptions gate formatted sharing and asset downloads work', async ({ page }) => {
  await createReport(page);
  await page
    .locator('#intake-files')
    .setInputFiles({ name: 'rollout.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#material-count')).toHaveText('1 source ready');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await page.getByLabel('Options for rollout', { exact: true }).click();
  await page.getByRole('button', { name: 'Share rollout', exact: true }).click();
  await expect(page.locator('#email-copy')).toBeDisabled();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Edit rollout', exact: true }).click();
  await page.getByLabel('Image description').fill('Pilot rollout screenshot');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByLabel('Options for rollout', { exact: true }).click();
  await page.getByRole('button', { name: 'Share rollout', exact: true }).click();
  await expect(page.locator('#email-copy')).toBeEnabled();
  await page.locator('.copy-options > summary').click();
  await page.locator('#share-export').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download image: rollout' }).click();
  expect((await download).suggestedFilename()).toBe('brief-image.png');
});

test('restore adds copies and invalid backup leaves reports intact', async ({ page }) => {
  await createReport(page);
  await page.getByRole('button', { name: 'My reports' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up all reports' }).click();
  const path = await (await promise).path();
  await page.locator('#restore-library').setInputFiles(path);
  await expect(page.locator('.library-card')).toHaveCount(2);
  await page.locator('#restore-library').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.locator('#error-banner')).toBeVisible();
  await expect(page.locator('.library-card')).toHaveCount(2);
});

test('skip link preserves route and small screens reflow without horizontal scrolling', async ({
  page,
}) => {
  await createReport(page);
  const route = page.url();
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  expect(page.url()).toBe(route);
  await expect(page.locator('#main-content')).toBeFocused();
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.getByRole('button', { name: 'My reports' })).toBeVisible();
    if (width === 375) await page.screenshot({ path: '.build/report-mobile.png', fullPage: true });
  }
});

test('automated accessibility scan of home, editor, settings and export in both themes', async ({
  page,
}) => {
  await page.goto('/#new');
  await page.screenshot({ path: '.build/home-desktop.png', fullPage: true });
  for (const theme of ['light', 'dark']) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Appearance').selectOption(theme);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Close settings' }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await createReport(page);
  for (const theme of ['light', 'dark']) {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Appearance').selectOption(theme);
    await page.getByRole('button', { name: 'Close settings' }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await page.getByRole('button', { name: 'Edit Pilot is live', exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('#share-button').click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('clipboard denial provides selectable text fallback', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        write: async () => {
          throw Error('Denied');
        },
        writeText: async () => {
          throw Error('Denied');
        },
      },
    }),
  );
  await createReport(page);
  await page.getByLabel('Options for Pilot is live', { exact: true }).click();
  await page.getByRole('button', { name: 'Share Pilot is live', exact: true }).click();
  await page.locator('#email-copy').click();
  await expect(page.locator('#copy-fallback')).toHaveValue('Pilot is live');
});

test('failed storage keeps an unsaved status and warns on reload', async ({ page }) => {
  await page.addInitScript(() => {
    window.IDBObjectStore.prototype.put = function () {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await page.goto('/#new');
  await page.getByLabel('What happened').fill('Unsaved report.');
  await page.locator('#create-report').click();
  await expect(page.locator('#persistence-status')).toContainText('Not saved');
  const dialogPromise = page.waitForEvent('dialog');
  const reload = page.reload({ timeout: 2000 }).catch(() => {});
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.accept();
  await reload;
  await expect(page.locator('#home-title')).toContainText('New report');
});

test('formatted clipboard contains only the selected card with both MIME types', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await createReport(page);
  await page.getByLabel('Options for Pilot is live', { exact: true }).click();
  await page.getByRole('button', { name: 'Share Pilot is live', exact: true }).click();
  await page.locator('#email-copy').click();
  await expect(page.locator('#toast')).toContainText('Formatted content copied');
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return {
      types: item.types,
      text: await (await item.getType('text/plain')).text(),
      html: await (await item.getType('text/html')).text(),
    };
  });
  expect(copied.types).toContain('text/html');
  expect(copied.types).toContain('text/plain');
  expect(copied.html).toContain('Pilot is live');
  expect(copied.html).not.toContain('Access approval needed');
  expect(copied.text).not.toContain('Pilot report');
});

test('keyboard editing returns focus to the rebuilt edit control', async ({ page }) => {
  await createReport(page);
  const edit = page.getByRole('button', { name: 'Edit Pilot is live', exact: true });
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Title', { exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Keyboard edit');
  await page.getByRole('button', { name: 'Save changes' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Edit Keyboard edit', exact: true })).toBeFocused();
});

test('example creates an editable report with preserved numbers and explicit sections', async ({
  page,
}) => {
  await page.goto('/#new');
  await page.getByRole('button', { name: 'Try an example' }).click();
  await expect(page.locator('#material-count')).toHaveText('1 source ready');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#cards .card')).toHaveCount(4);
  await expect(page.locator('#cards')).toContainText('80% of target');
  await expect(page.locator('#cards .report-section > h2')).toHaveText([
    'Progress',
    'Needs a decision',
    'Next steps',
  ]);
  await page.getByRole('button', { name: /Edit VPN access approval/ }).click();
  await page.getByLabel('Owner (optional)', { exact: true }).fill('Sam Rivera');
  await page.getByLabel('Due date (optional)').fill('2026-10-02');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('#review-summary')).toBeHidden();
  await page.reload();
  await expect(page.locator('#cards')).toContainText('Owner: Sam Rivera');
  await expect(page.locator('#cards')).toContainText('Due: 2026-10-02');
  await page.getByRole('button', { name: /Edit Complete the rollout/ }).click();
  await expect(page.getByLabel('Report section', { exact: true })).toHaveValue('next');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('#report-title').fill('Device rollout · Weekly update');
  await page.locator('#report-period').fill('September 21–25, 2026 · fictional example');
  await page.locator('#toggle-material').click();
  await page.locator('#intake-notes').click();
  await page.screenshot({ path: '.build/report-desktop.png', fullPage: true });
});

test('formatted copy fallback includes the complete report and uses the preview card HTML', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await createReport(page);
  const previewTitle = await page.locator('#cards h3').first().textContent();
  await page.getByRole('button', { name: 'Share…' }).click();
  await page.locator('#email-copy').click();
  await expect(page.locator('#toast')).toContainText('Formatted content copied');
  const copied = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return {
      html: await (await item.getType('text/html')).text(),
      text: await (await item.getType('text/plain')).text(),
    };
  });
  expect(copied.html).toContain(previewTitle);
  expect(copied.html).not.toContain('contenteditable');
  expect(copied.text).toContain('Pilot report');
  expect(copied.text).toContain('Access approval needed');
  expect(copied.text.match(/Pilot is live/g)).toHaveLength(1);
});

test('mobile switches between material and preview and preserves edits', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/#new');
  await page.getByLabel('What happened').fill('Mobile pilot is ready.');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('#sample-preview')).toBeVisible();
  await page.getByRole('button', { name: 'Material', exact: true }).click();
  await expect(page.getByLabel('What happened')).toHaveValue('Mobile pilot is ready.');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#cards')).toContainText('Mobile pilot is ready');
  await expect(page.locator('#builder-view')).toBeVisible();
  await expect(page.locator('#material-panel')).toBeHidden();
  await page.locator('#toggle-material').click();
  await page.getByLabel('What happened').fill('Another paragraph.');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#cards .card')).toHaveCount(2);
});

test('long reports keep sharing reachable and respect increased contrast', async ({ page }) => {
  await createReport(
    page,
    `${'Project evidence and progress. '.repeat(90)}\n\nNext steps: Review the rollout.`,
  );
  await page.locator('#add-card').scrollIntoViewIfNeeded();
  await expect(page.locator('#share-button')).toBeInViewport();
  await page.emulateMedia({ contrast: 'more', reducedMotion: 'reduce' });
  await expect(page.locator('#report-toolbar')).toHaveCSS('backdrop-filter', 'none');
  await page.locator('#share-button').click();
  await page.locator('#modal').evaluate((dialog) => {
    dialog.scrollTop = dialog.scrollHeight;
  });
  const close = page.getByRole('button', { name: 'Close dialog', exact: true });
  await expect(close).toBeInViewport();
  await close.click();
  await expect(page.locator('#modal')).not.toBeVisible();
});
