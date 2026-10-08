import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function create(page) {
  await page.goto('/#new');
  await page
    .getByLabel('What happened')
    .fill('Progress: Pilot is ready.\n\nNext steps: Review deployment.');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await page.getByRole('button', { name: 'Share…' }).click();
}
test('PNG preview downloads a real image and unsupported sharing has a download fallback', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'canShare', { value: () => false }),
  );
  await create(page);
  await page.locator('#close-modal').click();
  await page.locator('#export-report').click();
  await page.locator('#export-format').selectOption('png');
  await page.locator('#export-save').click();
  await expect(page.locator('#image-status')).toContainText('PNG page ready');
  await expect(page.locator('[data-send]')).toBeDisabled();
  expect((await new AxeBuilder({ page }).include('#modal').analyze()).violations).toEqual([]);
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const stream = await (await promise).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const png = Buffer.concat(chunks);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1520);
  expect(png.readUInt32BE(20)).toBeLessThanOrEqual(2240);
  expect(png.readUInt32BE(20)).toBeGreaterThan(400);
  await page.screenshot({ path: '.build/image-share-preview.png', fullPage: true });
});
test('prepared PNG sharing uses files and cancellation leaves the preview usable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: () => true });
    Object.defineProperty(navigator, 'share', {
      value: async (data) => {
        window.sharedImage = { type: data.files?.[0]?.type, size: data.files?.[0]?.size };
        throw new DOMException('Cancelled', 'AbortError');
      },
    });
  });
  await create(page);
  await page.locator('#close-modal').click();
  await page.locator('#export-report').click();
  await page.locator('#export-format').selectOption('png');
  await page.locator('#export-save').click();
  await page.getByRole('button', { name: 'Share image…' }).click();
  await expect(page.locator('#image-status')).toContainText('cancelled');
  expect(await page.evaluate(() => window.sharedImage.type)).toBe('image/png');
  expect(await page.evaluate(() => window.sharedImage.size)).toBeGreaterThan(1000);
  await expect(page.getByRole('button', { name: 'Download PNG' })).toBeEnabled();
});
test('long text produces multiple readable PNG pages; print document retains escaped text and exact tables', async ({
  page,
}) => {
  await page.goto('/#new');
  const result = await page.evaluate(async () => {
    const { reportImages } = await import('/src/features/sharing/report-images.js');
    const { printDocument } = await import('/src/features/sharing/visual-sharing.js');
    const card = {
      id: 'one',
      type: 'update',
      title: 'Unicode 测试',
      body: 'Review this long report carefully. '.repeat(220) + ' END OF REPORT',
      section: 'progress',
    };
    const report = { title: 'Report <unsafe>', period: 'This week', people: [], cards: [card] };
    const files = await reportImages(report, report.cards);
    const html = printDocument(report, report.cards);
    return { count: files.length, html };
  });
  expect(result.count).toBeGreaterThan(1);
  expect(result.html).toContain('END OF REPORT');
  expect(result.html).toContain('Report &lt;unsafe&gt;');
  expect(result.html).toContain('Unicode 测试');
  expect(result.html).toContain('size: A4');
});
test('blocked PDF popup provides recovery and formatted email is prominent', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await create(page);
  await expect(page.locator('#email-copy')).toBeVisible();
  await page.locator('#email-copy').click();
  await expect(page.locator('#toast')).toContainText('Formatted content copied');
  await page.evaluate(() => (window.open = () => null));
  await page.locator('#close-modal').click();
  await page.locator('#export-report').click();
  await page.locator('#export-save').click();
  await expect(page.locator('#export-description')).toContainText('Allow pop-ups');
});
