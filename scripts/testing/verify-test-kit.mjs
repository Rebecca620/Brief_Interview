import { chromium } from '@playwright/test';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = '.build/brief-test-kit';
const browser = await chromium.launch({ executablePath: process.env.BRIEF_CHROME_PATH });
const page = await browser.newPage();
const results = [];
try {
  await page.goto(process.env.BRIEF_TEST_URL || 'http://127.0.0.1:4174');
  for (const folder of ['valid', 'invalid']) {
    for (const name of await readdir(`${root}/${folder}`)) {
      if (name.includes('backup-version')) continue;
      const bytes = [...(await readFile(`${root}/${folder}/${name}`))];
      const mime = /\.png$/.test(name)
        ? 'image/png'
        : /\.jpg$/.test(name)
          ? 'image/jpeg'
          : /\.webp$/.test(name)
            ? 'image/webp'
            : 'application/octet-stream';
      const result = await page.evaluate(
        async ({ bytes, name, mime }) => {
          const { readMaterial } = await import('/src/features/intake/material-reader.js');
          try {
            const value = await readMaterial(
              new File([new Uint8Array(bytes)], name, { type: mime }),
              true,
            );
            return {
              ok: true,
              cards: value.cards?.length,
              collections: value.dataset?.collections.length,
              text: value.cards?.map((c) => c.body).join('\n'),
              detail: value.detail,
            };
          } catch (e) {
            return { ok: false, error: e.message };
          }
        },
        { bytes, name, mime },
      );
      // These valid JSON files fail later during paired/evaluation analysis, not parsing.
      const parseableInvalid = /^(07-|08-|18-)/.test(name);
      assert.equal(
        result.ok,
        folder === 'valid' || parseableInvalid,
        `${folder}/${name}: ${JSON.stringify(result)}`,
      );
      if (name === '18-selectable-text.pdf') {
        assert.match(result.text, /END OF TEST/);
        assert.match(result.text, /项目复盘/);
        assert.equal(result.cards, 2);
      }
      if (name === '17-project-brief.docx') assert.match(result.text, /END OF TEST/);
      if (name === '19-mixed-pages.pdf') assert.match(result.detail, /pages 2/);
      results.push({ file: `${folder}/${name}`, passed: true, ...result });
    }
  }
  assert.equal(await page.evaluate(() => window.__briefUnsafeExecuted), undefined);
  await writeFile(`${root}/FIXTURE-VERIFICATION.json`, JSON.stringify(results, null, 2));
  console.log(
    `${results.length} material fixtures verified through the real browser import module.`,
  );
} finally {
  await browser.close();
}
