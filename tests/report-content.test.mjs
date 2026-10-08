import test from 'node:test';
import assert from 'node:assert/strict';
import { recordCards } from '../src/domain/datasets/record-cards.js';
import { reportBodyHTML } from '../src/domain/report-copy.js';
import { escapeHTML } from '../src/domain/export.js';
test('record presentation promotes content while retaining nested and technical source data', () => {
  const row = {
    id: 'internal-1',
    title: 'Review the sample',
    body: 'Definition changed.',
    count: 0,
    metadata: { evidence: 'keep me' },
  };
  const [card] = recordCards({ id: '/records', rows: [row], positions: ['/records/0'] });
  assert.equal(card.title, row.title);
  assert.match(card.body, /Definition changed/);
  assert.match(card.body, /Count: 0/);
  assert.doesNotMatch(card.body, /internal-1|keep me/);
  assert.match(card.source, /internal-1/);
  assert.match(card.source, /keep me/);
});
test('technical-only records request review instead of inventing a summary', () => {
  const [card] = recordCards({
    id: '$',
    rows: [{ id: 'only-id', metadata: { score: 0 } }],
    positions: ['/0'],
  });
  assert.match(card.body, /Review this record/);
  assert.match(card.source, /"score": 0/);
});
test('body typography preserves literal markup and formats only explicit lists and takeaways', () => {
  const html = reportBodyHTML(
    '- First item\n- <script>unsafe()</script>\n\n结论：需要核对。',
    escapeHTML,
  );
  assert.match(html, /<ul/);
  assert.match(html, /<li>First item/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /结论：需要核对。/);
  assert.doesNotMatch(reportBodyHTML('Some evidence.', escapeHTML), /border-left/);
});
