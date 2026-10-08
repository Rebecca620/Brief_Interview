import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticPlan } from '../src/features/native-capture/automatic-material.js';
import { parseDataset } from '../src/domain/datasets/parse.js';
const dataset = (value) => parseDataset(JSON.stringify(value), 'capture.json');
test('automatic capture uses one real measure, preserving zero and explicit dates', () => {
  const plan = automaticPlan(
    dataset([
      { date: '2026-09-01', completed: 0 },
      { date: '2026-09-02', completed: 20 },
    ]),
  );
  assert.equal(plan.config.metric, '/completed');
  assert.equal(plan.config.date, '/date');
  assert.match(plan.findings[0].body, /2\/2/);
  assert.match(plan.findings[1].body, /Mean 10/);
  assert.ok(plan.findings.some((f) => f.visual?.kind === 'line'));
});
test('multiple measures, numeric strings and multiple collections require review', () => {
  for (const rows of [
    [
      { completed: 0, budget: 10 },
      { completed: 20, budget: 30 },
    ],
    [{ completed: '0' }, { completed: '20' }],
    { a: [{ value: 0 }], b: [{ value: 1 }] },
  ])
    assert.equal(automaticPlan(dataset(rows)), null);
});
test('text captures use source titles without inventing scores', () => {
  const plan = automaticPlan(dataset([{ title: 'Approval pending', body: 'Ask the owner.' }]));
  assert.equal(plan.config.mode, 'records');
  assert.equal(plan.findings[0].title, 'Approval pending');
  assert.equal(plan.findings[0].visual, undefined);
});
test('parse notices force review rather than silently using a partial dataset', () => {
  const parsed = dataset({ valid: [{ value: 0 }, { value: 1 }], mixed: [{ value: 1 }, 2] });
  assert.ok(parsed.notices.length);
  assert.equal(automaticPlan(parsed), null);
});
