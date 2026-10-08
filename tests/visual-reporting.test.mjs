import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDataset, profileCollection } from '../src/domain/datasets/parse.js';
import { evaluationCollection } from '../src/domain/datasets/evaluation.js';
import { pairedFindings } from '../src/domain/datasets/paired.js';
import { isVisual } from '../src/domain/visuals/contract.js';
import { chartSVG, visualHTML } from '../src/domain/visuals/render.js';
import { calendarFile } from '../src/domain/calendar.js';
import {
  createCard,
  emptyReport,
  isReport,
  assignSection,
  cardSection,
} from '../src/domain/report.js';
import { cardText, reportHTML } from '../src/domain/export.js';
const config = {
  metric: '/score',
  group: '/model',
  pairKey: '/id',
  baseline: 'A',
  candidate: 'B',
  passValue: '3',
  failValue: '1',
};
const data = (rows) => parseDataset(JSON.stringify(rows), 'input.json').collections[0];
const paired = (rows) => {
  const c = data(rows);
  return pairedFindings(c, profileCollection(c).fields, config)[0];
};
const rows = [
  [1, 1],
  [1, 3],
  [3, 1],
  [3, 3],
  [2, 3],
  [null, 1],
].flatMap(([a, b], id) => [
  { id, model: 'A', score: a },
  { id, model: 'B', score: b },
]);
test('paired transitions close on common mapped scores; other/missing are excluded', () => {
  const f = paired([...rows, { id: 99, model: 'A', score: 3 }]);
  assert.deepEqual(
    f.visual.rows.map((r) => r[1]),
    [1, 1, 1, 1],
  );
  assert.match(f.body, /50.00% → 50.00%/);
  assert.match(f.visual.caption, /1 keys missing a model; 2 pairs/);
  assert.ok(isVisual(f.visual));
  assert.equal((chartSVG(f.visual).match(/<path fill=/g) || []).length, 4);
});
test('duplicate pair keys and ambiguous mappings fail rather than averaging', () => {
  assert.throws(() => paired([...rows, rows[0]]), /Duplicate pair key/);
  const c = data(rows);
  assert.throws(
    () => pairedFindings(c, profileCollection(c).fields, { ...config, passValue: '1' }),
    /different numeric/,
  );
  assert.throws(() => paired(rows.map((r) => ({ ...r, score: 2 }))), /No common pairs/);
});
test('compress pair key is stable across candidate order changes and excludes masked turns', () => {
  const c = evaluationCollection(
    data([
      {
        type: 'compress',
        dialog: [
          { role: 'assistant', turn_index: 0, evaluate: { A: { score: 1 }, B: { score: 3 } } },
          { role: 'assistant', turn_index: 1, evaluate: { B: { score: 1 }, A: { score: 3 } } },
          {
            role: 'assistant',
            turn_index: 2,
            loss: false,
            evaluate: { A: { score: 3 }, B: { score: 3 } },
          },
        ],
      },
    ]),
  );
  const f = pairedFindings(c, profileCollection(c).fields, {
    ...config,
    pairKey: '/pair_key',
    metric: '/candidate/score',
  })[0];
  assert.deepEqual(
    f.visual.rows.map((r) => r[1]),
    [0, 1, 1, 0],
  );
  assert.match(f.source, /1-1-2.*1-1-1/);
  assert.doesNotMatch(f.source, /1-2-/);
});
test('visual DTOs survive report validation and HTML/text export with escaped content', () => {
  const f = paired(rows);
  f.visual.baseline = '<script>alert(1)</script>';
  const card = createCard('update', f),
    report = emptyReport('Report');
  report.cards = [card];
  assert.ok(isReport(report));
  assert.match(reportHTML(report), /&lt;script&gt;/);
  assert.doesNotMatch(reportHTML(report), /<script>/);
  assert.match(cardText(report, card), /Persistent fail \| 1 \| 25/);
  assert.match(visualHTML(f.visual), /<table/);
  assert.match(visualHTML(f.visual), /scope="col"/);
  card.visual.rows[0][1] = -1;
  assert.equal(isReport(report), false);
});
test('unsafe visual data and links cannot enter restored reports', () => {
  const report = emptyReport();
  report.cards = [createCard('update', { link: 'javascript:alert(1)' })];
  assert.equal(isReport(report), false);
  report.cards[0].link = 'https://example.com/report';
  report.cards[0].visual = {
    kind: 'bar',
    title: 'x',
    caption: 'x',
    columns: ['a', 'b'],
    rows: [['x', Infinity]],
  };
  assert.equal(isReport(report), false);
});
test('changing sections preserves visuals and ownership while updating text action semantics', () => {
  const card = createCard('update', { visual: paired(rows).visual });
  assignSection(card, 'decision');
  assert.equal(card.type, 'decision');
  assignSection(card, 'next');
  assert.equal(cardSection(card), 'next');
  assert.equal(card.type, 'update');
  assert.ok(card.visual);
});
test('calendar drafts escape injection, fold UTF-8 lines, preserve UTC and never send invites', () => {
  const file = calendarFile({
    title: 'Review\nATTENDEE:evil',
    description: '讨论,项目;\\'.repeat(30),
    start: '2026-10-01T09:00:00+08:00',
    end: '2026-10-01T10:00:00+08:00',
    uid: 'test',
    now: '2026-09-26T00:00:00Z',
  });
  assert.match(file, /DTSTART:20261001T010000Z/);
  assert.match(file, /METHOD:PUBLISH/);
  assert.doesNotMatch(file, /\r\nATTENDEE:/);
  assert.ok(file.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
  assert.match(file.replace(/\r\n /g, ''), /SUMMARY:Review\\nATTENDEE:evil/);
  assert.throws(
    () => calendarFile({ title: 'Bad', start: '2026-10-01', end: '2026-09-01' }),
    /end time/,
  );
});
