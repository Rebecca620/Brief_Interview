import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDataset,
  profileCollection,
  numericValue,
  dateValue,
  valueAt,
} from '../src/domain/datasets/parse.js';
import { evaluationCollection } from '../src/domain/datasets/evaluation.js';
import { analyzeDataset } from '../src/domain/datasets/analyze.js';
const parse = (rows) => parseDataset(JSON.stringify(rows), 'data.json').collections[0];
const analyze = (rows, options = {}) => {
  const c = parse(rows);
  return analyzeDataset(c, profileCollection(c).fields, {
    metric: '/score',
    mode: 'numeric',
    ...options,
  });
};

test('JSONL preserves physical line locations and rejects malformed rows atomically', () => {
  const c = parseDataset('\uFEFF{"score":1}\n\n{"score":3}\r\n', 'x.jsonl').collections[0];
  assert.deepEqual(c.positions, ['line 1', 'line 3']);
  assert.throws(() => parseDataset('{"score":1}\nBAD\n{"score":3}', 'x.jsonl'), /line 2/);
  assert.throws(() => parseDataset('[]', 'x.json'), /no records/);
  assert.throws(() => parseDataset('[{},1]', 'x.json'), /mixes/);
  assert.throws(() => parse(Array.from({ length: 10001 }, () => ({ score: 1 }))), /10,000/);
});
test('wrapped collections and escaped keys retain exact access without inherited fields', () => {
  const c = parseDataset('{"data":[{"a/b":{"x~y":2},"__proto__":{"score":4}}]}', 'x.json')
    .collections[0];
  const fields = profileCollection(c).fields;
  assert.equal(c.id, '/data');
  assert.equal(c.positions[0], '/data/0');
  const field = fields.find((f) => f.id === '/a~1b/x~0y');
  assert.equal(valueAt(c.rows[0], field.parts), 2);
  assert.equal(valueAt({}, ['constructor']), undefined);
  assert.equal({}.score, undefined);
});
test('numbers and dates are deliberately strict', () => {
  for (const value of [null, true, '', ' ', '0x10', Infinity, 9007199254740992])
    assert.equal(numericValue(value, true), null);
  assert.equal(numericValue('3'), null);
  assert.equal(numericValue('3', true), 3);
  assert.equal(dateValue('2026-02-30'), null);
  assert.equal(dateValue('2026-01-01T10:00:00'), null);
  assert.equal(dateValue('2026-01-01T23:00:00-02:00'), '2026-01-02');
});
test('evaluation rates use explicit threshold and exclude missing scores', () => {
  const result = analyze([{ score: 3 }, { score: 1 }, { score: null }, { score: '3' }], {
    mode: 'evaluation',
    passRule: 'gte',
    threshold: '3',
  });
  assert.match(result[0].body, /2\/4/);
  assert.match(result.find((f) => f.title.startsWith('Pass rate')).body, /1\/2.*50%/);
  assert.equal(
    analyze([{ score: 1 }], { mode: 'evaluation', passRule: 'none' }).some((f) =>
      f.title.startsWith('Pass'),
    ),
    false,
  );
  assert.throws(
    () => analyze([{ score: 1 }], { mode: 'evaluation', passRule: 'gte', threshold: '' }),
    /threshold/,
  );
  assert.match(analyze([{ score: '3' }], { numericStrings: true })[0].body, /1\/1/);
});
test('group stats disclose coverage and dates sort chronologically with daily aggregation', () => {
  const result = analyze(
    [
      { score: 6, g: 'A', d: '2026-02-02' },
      { score: 2, g: 'A', d: '2026-02-01' },
      { score: 4, g: 'B', d: '2026-02-02' },
      { score: 0, g: null, d: 'bad' },
    ],
    { group: '/g', date: '/d' },
  );
  assert.deepEqual(result.find((f) => f.title.startsWith('Breakdown')).visual.rows[0], [
    '"A"',
    4,
    2,
  ]);
  assert.match(
    result.find((f) => f.title.startsWith('Breakdown')).visual.caption,
    /1 numeric records lack a group/,
  );
  assert.match(result.find((f) => f.title.startsWith('First')).body, /Absolute change 3/);
});
test('IQR observations point to source records and do not label anomalies errors', () => {
  const result = analyze([1, 2, 3, 4, 5, 6, 7, 100].map((score) => ({ score })));
  const outlier = result.find((f) => f.title === 'Values to inspect');
  assert.match(outlier.body, /1\/8/);
  assert.match(outlier.source, /\/7: 100/);
});
test('Eval Studio keeps GT separate and never reads masked evaluations', () => {
  const masked = { role: 'assistant', loss: false };
  Object.defineProperty(masked, 'evaluate', {
    get() {
      throw Error('must not read');
    },
  });
  const collection = {
    id: '$',
    label: 'records',
    positions: ['line 1'],
    rows: [
      {
        id: 'case-1',
        type: 'compress',
        dialog: [
          { role: 'user', turn_index: 0 },
          masked,
          {
            role: 'assistant',
            turn_index: 2,
            metrics: { human: 99 },
            evaluate: {
              B: { metrics: { human: { score: 1 } } },
              A: { metrics: { human: { score: 3 } } },
            },
          },
        ],
      },
    ],
  };
  const c = evaluationCollection(collection);
  assert.equal(c.rows.length, 2);
  assert.equal(c.rows[0].model, 'B');
  assert.match(c.positions[0], /^1-2-1/);
  assert.match(c.positions[1], /^1-2-2/);
  assert.match(c.note, /1 masked/);
  assert.deepEqual(
    profileCollection(c).fields.find((f) => f.id === '/candidate/metrics/human/score').sample,
    ['1', '3'],
  );
});
test('single compress object preserves record context; invalid coordinates are rejected', () => {
  const raw = {
    type: 'compress',
    dialog: [{ role: 'assistant', turn_index: 0, evaluate: { A: { score: 2 } } }],
  };
  assert.equal(evaluationCollection(parse(raw)).rows.length, 1);
  raw.dialog[0].turn_index = 4;
  assert.throws(() => evaluationCollection(parse(raw)), /turn_index/);
});
