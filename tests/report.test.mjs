import test from 'node:test';
import assert from 'node:assert/strict';
import { percent, checks, audienceCards, validateCard, isReport } from '../src/domain/report.js';
import { reportHTML, reportText } from '../src/domain/export.js';
import { parseMetricCSV } from '../src/domain/csv.js';
import { appendMaterial } from '../src/domain/materials.js';
test('metrics use deterministic arithmetic and reject invalid denominators', () => {
  assert.equal(percent(840, 1000), 84);
  assert.equal(percent(0, 100), 0);
  assert.equal(percent(1, 0), null);
  assert.equal(percent('bad', 100), null);
  assert.equal(percent(1, -5), null);
});
test('pre-share checks catch missing ownership, deadlines and image alternatives', () => {
  assert.equal(
    checks([
      { id: '1', title: 'Decision', type: 'decision' },
      { id: '2', title: 'Image', type: 'image' },
    ]).length,
    4,
  );
  assert.deepEqual(
    checks([
      { id: '1', title: 'Decision', type: 'decision', owner: 'p', due: '2026-10-10' },
      {
        id: '2',
        title: 'Image',
        type: 'image',
        alt: 'Rollout view',
        image: 'data:image/png;base64,YQ==',
      },
    ]),
    [],
  );
});
test('exports escape user content and preserve owners, metric data, and descriptions', () => {
  const s = {
    title: '<script>alert(1)</script>',
    period: 'Week 1',
    people: [{ id: 'p', name: 'Sam & Alex' }],
    cards: [
      {
        type: 'metric',
        title: 'Rollout',
        body: '<img onerror=alert(1)>',
        owner: 'p',
        value: 84,
        target: 100,
      },
      {
        type: 'image',
        title: 'Visual',
        body: 'Context',
        image: 'javascript:alert(1)',
        alt: 'Progress chart',
      },
    ],
  };
  const html = reportHTML(s);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img onerror'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('Sam &amp; Alex'));
  assert.ok(reportText(s).includes('84%'));
  assert.ok(reportText(s).includes('Progress chart'));
});

test('blank metrics are invalid while zero is a valid numerator', () => {
  for (const input of ['', '  ', null, undefined, NaN, Infinity])
    assert.equal(percent(input, 100), null);
  assert.equal(percent(0, 100), 0);
  assert.equal(percent(150, 100), 150);
});

test('leadership lens prioritizes decisions without dropping or mutating content', () => {
  const cards = [
    { type: 'image', id: 1 },
    { type: 'update', id: 2 },
    { type: 'metric', id: 3 },
    { type: 'decision', id: 4 },
    { type: 'decision', id: 5 },
  ];
  const before = structuredClone(cards);
  assert.deepEqual(
    audienceCards(cards, 'leadership').map((c) => c.id),
    [4, 5, 3, 2, 1],
  );
  assert.deepEqual(cards, before);
  assert.deepEqual(audienceCards(cards, 'team'), cards);
  assert.notEqual(audienceCards(cards), cards);
});

test('CSV handles BOM, CRLF, escaped quotes and multiline titles', () => {
  const rows = parseMetricCSV(
    '\uFEFFtitle,value,target\r\n"Devices, \"\"pilot\"\"",84,100\r\n"Teams\nonboarded",0,12',
  );
  assert.deepEqual(rows, [
    { title: 'Devices, "pilot"', value: 84, target: 100, row: 2 },
    { title: 'Teams\nonboarded', value: 0, target: 12, row: 3 },
  ]);
});

test('CSV errors identify invalid inputs before any cards are committed', () => {
  for (const input of [
    'a,b,c\n1,2,3',
    'title,value,target',
    'title,value,target\nx,,100',
    'title,value,target\nx,1,0',
    'title,value,target\n"x,1,2',
  ])
    assert.throws(() => parseMetricCSV(input));
  assert.throws(
    () => parseMetricCSV('title,value,target\n' + Array(101).fill('x,1,2').join('\n')),
    /100/,
  );
  assert.throws(() => parseMetricCSV('title,value,target\nok,1,2\nbad,x,2'), /Row 3/);
});

test('card validation gives actionable errors', () => {
  assert.match(validateCard({ title: '  ', type: 'update' }), /title/);
  assert.match(validateCard({ title: 'Rollout', type: 'metric', value: 4, target: 0 }), /target/);
  assert.equal(validateCard({ title: 'Rollout', type: 'metric', value: 0, target: 10 }), null);
});

test('malformed saved drafts are rejected before rendering', () => {
  const report = { title: 'Weekly', period: 'Week 1', cards: [], people: [], sources: [] };
  assert.equal(isReport(report), true);
  for (const invalid of [
    null,
    {},
    { ...report, cards: [null] },
    { ...report, people: [{}] },
    { ...report, sources: [{ name: 5 }] },
  ])
    assert.equal(isReport(invalid), false);
});

test('exports group progress and decisions while preserving owners and deadlines', () => {
  const report = {
    title: 'Weekly',
    period: 'Week 1',
    people: [{ id: 'sam', name: 'Sam' }],
    cards: [
      { type: 'update', title: 'Progress', body: 'Done' },
      {
        type: 'decision',
        title: 'Approval',
        body: 'Approve support',
        owner: 'sam',
        due: '2026-10-12',
      },
    ],
  };
  const output = reportText({ ...report, cards: audienceCards(report.cards, 'leadership') });
  assert.ok(output.indexOf('Progress') < output.indexOf('Needs a decision'));
  assert.ok(output.includes('Approval'));
  assert.ok(output.includes('Owner: Sam'));
  assert.ok(output.includes('Due: 2026-10-12'));
});

function luminance(hex) {
  const values = hex
    .match(/[a-f\d]{2}/gi)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('primary, secondary, links and warning text meet 4.5:1 in both palettes', () => {
  const palettes = [
    { surfaces: ['#f5f5f7', '#ffffff', '#f0f0f3'], text: ['#1d1d1f', '#64646b', '#0066cc'] },
    { surfaces: ['#161617', '#242426', '#202022'], text: ['#f5f5f7', '#b0b0b8', '#79b8ff'] },
  ];
  for (const p of palettes)
    for (const bg of p.surfaces)
      for (const fg of p.text) assert.ok(contrast(fg, bg) >= 4.5, `${fg} on ${bg}`);
  assert.ok(contrast('#795000', '#fff2d6') >= 4.5);
  assert.ok(contrast('#f3cc7a', '#403521') >= 4.5);
});

test('appending material preserves edited cards, people and report identity', () => {
  const report = {
    id: 'r1',
    title: 'Edited title',
    people: [{ id: 'maya' }],
    cards: [{ id: 'old', body: 'User edits' }],
    sources: [],
  };
  const before = structuredClone(report);
  const result = appendMaterial(report, [
    { name: 'Notes', fingerprint: 'abc', cards: [{ id: 'new', body: 'New text' }] },
  ]);
  assert.deepEqual(report, before);
  assert.equal(result.report.id, 'r1');
  assert.deepEqual(result.report.cards, [...before.cards, { id: 'new', body: 'New text' }]);
  assert.deepEqual(result.report.people, before.people);
  assert.deepEqual(result.addedIds, ['new']);
});

test('duplicate source content is skipped within the report and batch', () => {
  const report = { cards: [], sources: [{ fingerprint: 'existing' }] };
  const source = (fingerprint, id) => ({ fingerprint, name: 'file', cards: [{ id }] });
  const result = appendMaterial(report, [
    source('existing', 'a'),
    source('new', 'b'),
    source('new', 'c'),
  ]);
  assert.deepEqual(result.addedIds, ['b']);
  assert.equal(result.skipped, 2);
  assert.equal(result.report.sources.length, 2);
});

test('the same source can be used independently in a new report', () => {
  const material = { name: 'Metrics', fingerprint: 'abc', cards: [{ id: 'metric' }] };
  const result = appendMaterial({ id: 'new', cards: [], sources: [] }, [material]);
  assert.equal(result.addedIds.length, 1);
  assert.equal(result.skipped, 0);
});
