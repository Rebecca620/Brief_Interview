import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function word(page, xml) {
  await page.addScriptTag({ url: '/vendor/jszip.min.js' });
  const bytes = await page.evaluate(async (xml) => {
    const zip = new window.JSZip();
    zip.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file('word/document.xml', xml);
    return [...(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }))];
  }, xml);
  return {
    name: 'notes.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(bytes),
  };
}
const documentXML = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Deployment review</w:t></w:r></w:p><w:p><w:r><w:t>Pilot is ready. 中文测试.</w:t></w:r></w:p><w:p><w:del><w:r><w:t>Deleted statement</w:t></w:r></w:del><w:r><w:t>&lt;script&gt;unsafe()&lt;/script&gt;</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Team</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>IT</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`;
test('Word upload reviews text locally, assigns section, escapes text and persists source', async ({
  page,
}) => {
  await page.goto('/#new');
  const payload = await word(page, documentXML);
  const posts = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') posts.push(r.url());
  });
  await page.locator('#intake-files').setInputFiles(payload);
  await expect(page.getByRole('heading', { name: 'Review document import' })).toBeVisible();
  await page.getByText('Review extracted text', { exact: true }).click();
  await expect(page.locator('#modal-body')).toContainText('中文测试');
  await expect(page.locator('#modal-body')).not.toContainText('Deleted statement');
  await expect(page.locator('#modal-body script')).toHaveCount(0);
  await page.locator('#document-section').selectOption('discussion');
  expect((await new AxeBuilder({ page }).include('#modal').analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Add selected cards' }).click();
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#cards')).toContainText('Needs discussion');
  await expect(page.locator('#cards')).toContainText('Pilot is ready');
  await page.reload();
  await expect(page.locator('#sources')).toContainText('paragraph');
  expect(posts).toEqual([]);
});
test('PDF extracts page text and discloses blank/image-only pages before import', async ({
  page,
  browser,
}) => {
  const source = await browser.newPage();
  await source.setContent(
    '<p>Progress: The pilot is live.</p><div style="break-before:page;height:100px;background:red"></div>',
  );
  const bytes = await source.pdf();
  await source.close();
  await page.goto('/#new');
  await page
    .locator('#intake-files')
    .setInputFiles({ name: 'report.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(page.locator('#modal-body')).toContainText('1 of 2 pages');
  await expect(page.locator('#modal-body')).toContainText('pages 2');
  await page.getByText('Review extracted text', { exact: true }).click();
  await expect(page.locator('#modal-body')).toContainText('The pilot is live');
  await page.getByRole('button', { name: 'Add selected cards' }).click();
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#cards')).toContainText('The pilot is live');
});
test('image-only PDFs and legacy Word provide actionable errors', async ({ page, browser }) => {
  const source = await browser.newPage();
  await source.setContent('<div style="height:200px;background:red"></div>');
  const bytes = await source.pdf();
  await source.close();
  await page.goto('/#new');
  await page
    .locator('#intake-files')
    .setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(page.locator('#error-banner')).toContainText('Run OCR first');
  await page
    .locator('#intake-files')
    .setInputFiles({ name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from('old') });
  await expect(page.locator('#error-banner')).toContainText('Save the document as .docx');
  await expect(page.locator('#material-list')).toBeEmpty();
});
test('cancelled document review stages nothing and malformed or oversized Word archives fail', async ({
  page,
}) => {
  await page.goto('/#new');
  await page.locator('#intake-files').setInputFiles(await word(page, documentXML));
  await page.getByRole('button', { name: 'Cancel import' }).click();
  await expect(page.locator('#material-list')).toBeEmpty();
  await expect(page.locator('#intake-files')).toBeEnabled();
  await page.locator('#intake-files').setInputFiles({
    name: 'bad.docx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not a zip'),
  });
  await expect(page.locator('#error-banner')).toContainText('Invalid Word');
  const payload = await word(page, 'x'.repeat(17 * 1024 * 1024));
  await page.locator('#intake-files').setInputFiles(payload);
  await expect(page.locator('#error-banner')).toContainText('Expanded Word document exceeds');
});
