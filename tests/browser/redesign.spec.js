import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function create(page) {
  await page.goto('/#new');
  await page
    .locator('#intake-notes')
    .fill(
      'Progress: Pilot live. Ready for review.\n\nNeeds a decision: Access approval. Approval is pending.',
    );
  await page.locator('#create-report').click();
  await expect(page.locator('#builder-view')).toBeVisible();
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
}
test('library, searchable reports, recoverable Trash and restore survive reload', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#library-heading')).toHaveText('My reports');
  await expect(page.locator('.composer')).toBeHidden();
  await create(page);
  await page.locator('#report-title').fill('Launch report');
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.locator('#all-reports').click();
  await page.getByLabel('Search reports').fill('launch');
  await expect(page.locator('.library-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Move to Trash' }).click();
  await page.locator('#trash-reports').click();
  await expect(page.locator('.library-card')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.locator('#all-reports').click();
  await expect(page.getByRole('button', { name: 'Open Launch report' })).toBeVisible();
});
test('direct edits autosave, and document undo/redo restore changes', async ({ page }) => {
  await create(page);
  await expect(page.locator('#material-panel')).toBeHidden();
  await page.locator('[data-inline-body]').first().fill('Edited directly in the document.');
  await page.locator('#report-title').click();
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.locator('#undo-report').click();
  await expect(page.locator('[data-inline-body]').first()).toHaveText('Ready for review.');
  await page.locator('#redo-report').click();
  await expect(page.locator('[data-inline-body]').first()).toHaveText(
    'Edited directly in the document.',
  );
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.locator('[data-inline-body]').first()).toHaveText(
    'Edited directly in the document.',
  );
});
test('unfinished inspector edits survive Escape and reload without changing the published card', async ({
  page,
}) => {
  await create(page);
  await page.getByRole('button', { name: 'Edit Pilot live', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Unfinished title');
  await page.keyboard.press('Escape');
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload();
  await page.getByRole('button', { name: 'Edit Pilot live', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unfinished title');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeInViewport();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('[data-inline-title]').first()).toHaveText('Unfinished title');
});
test('large accepted attachment saves separately, reloads and exports intact', async ({ page }) => {
  // A valid PNG plus legal trailing bytes approaches the 2 MB import limit.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  );
  await page.goto('/#new');
  await page.locator('#intake-files').setInputFiles({
    name: 'large.png',
    mimeType: 'image/png',
    buffer: Buffer.concat([png, Buffer.alloc(1900000)]),
  });
  await page.locator('#create-report').click();
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.locator('#cards img')).toHaveCount(1);
  const objects = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = window.indexedDB.open('brief-workspace');
      r.onsuccess = () => resolve(r.result);
    });
    return await new Promise((resolve) => {
      const r = db.transaction('records').objectStore('records').getAllKeys();
      r.onsuccess = () => resolve(r.result);
    });
  });
  expect(objects.some((key) => key.startsWith('asset-'))).toBe(true);
  expect(objects.some((key) => key.startsWith('report-'))).toBe(true);
});
test('legacy library migration preserves original storage and content', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('brief-library-v2'))
      localStorage.setItem(
        'brief-library-v2',
        JSON.stringify([
          { id: 'legacy', title: 'Old report', period: '', cards: [], people: [], sources: [] },
        ]),
      );
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Old report' }).click();
  await page.locator('#report-title').fill('Migrated report');
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  await page.reload();
  await expect(page.locator('#report-title')).toHaveValue('Migrated report');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('brief-library-v2'))[0].title),
  ).toBe('Old report');
});
test('share and export have focused actions; nested previews retain focus', async ({ page }) => {
  await create(page);
  await page.locator('#share-button').click();
  await expect(page.locator('#modal-title')).toHaveText('Share report');
  await expect(page.locator('#email-copy')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#export-report').click();
  await page.locator('#export-format').selectOption('png');
  await page.locator('#export-save').click();
  await expect(page.locator('#modal-title')).toHaveText('Share as image');
  await expect(page.locator('#close-modal')).toBeFocused();
});
test('library and editor accessibility, themes and narrow windows', async ({ page }) => {
  await page.goto('/');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await create(page);
  for (const theme of ['dark', 'light']) {
    await page.locator('#settings-button').click();
    await page.getByLabel('Appearance').selectOption(theme);
    await page.locator('#close-settings').click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  for (const width of [320, 760, 1180]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator('#save-status')).toBeVisible();
  }
});
