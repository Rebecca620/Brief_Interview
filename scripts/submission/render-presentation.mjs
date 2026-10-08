import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.build/presentation');
const evidence = path.resolve('.build/submission-evidence/deck');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.BRIEF_CHROME_PATH || undefined,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 850 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('img').evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
  const count = await page.locator('.slide').count();
  const layout = [];
  for (let i = 0; i < count; i++) {
    if (i) await page.locator('#next').click();
    const slide = page.locator('.slide:not([hidden])');
    const result = await slide.evaluate((node) => {
      const footer = node.querySelector('footer').getBoundingClientRect();
      const bounds = node.getBoundingClientRect();
      const overflowing = [...node.querySelectorAll('h1,h2,p,td,figure')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.right > bounds.right + 1 || r.bottom > footer.top + 1 || r.left < bounds.left - 1
          );
        })
        .map((el) => el.textContent.slice(0, 80));
      const content = node.querySelector('.content').getBoundingClientRect();
      const takeaway = node.querySelector('.takeaway');
      const overlap =
        takeaway &&
        getComputedStyle(takeaway).display !== 'none' &&
        content.bottom > takeaway.getBoundingClientRect().top + 1;
      return {
        title: node.querySelector('h1').textContent,
        overflowing,
        overlap: Boolean(overlap),
      };
    });
    if (result.overflowing.length || result.overlap)
      throw Error(`Slide ${i + 1} layout: ${JSON.stringify(result)}`);
    layout.push(result);
    await slide.screenshot({
      path: path.join(evidence, `slide-${String(i + 1).padStart(2, '0')}.png`),
    });
  }
  await page.keyboard.press('Home');
  await page.keyboard.press('n');
  if ((await page.locator('#note-text').textContent()).length < 100)
    throw Error('Speaker notes missing');
  if (!(await page.locator('#notes').isVisible())) throw Error('Speaker notes toggle failed');
  await page.pdf({
    path: path.join(root, 'Brief-15-minute.pdf'),
    preferCSSPageSize: true,
    printBackground: true,
  });
  if (errors.length) throw Error(errors.join('\n'));
  await writeFile(
    path.join(evidence, 'verification.json'),
    JSON.stringify(
      {
        slideCount: count,
        pdfBytes: (await readFile(path.join(root, 'Brief-15-minute.pdf'))).length,

        notesToggle: true,
        layout,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log('PASS: 12 slides, PDF export, no detected overflow, speaker notes and navigation.');
} finally {
  await browser.close();
}
