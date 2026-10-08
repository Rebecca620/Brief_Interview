import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRisks, RISK_SOURCE } from '../src/domain/risk-review.js';
const report = (body, extra = {}) => ({
  cards: [{ id: 'a', title: 'Update', body, source: '', ...extra }],
});
test('risk review finds bilingual evidence without inventing metric semantics', () => {
  const found = projectRisks(report('Approval is pending. 人手不足。预算超支。'), '2026-09-26');
  assert.equal(found.length, 3);
  assert.equal(found[0].evidence, 'Approval is pending');
  assert.equal(
    projectRisks(report('40% of target', { type: 'metric', value: 40, target: 100 })).length,
    0,
  );
});
test('resolved and negated signals are suppressed while contrasting unresolved clauses remain', () => {
  assert.equal(
    projectRisks(report('Not delayed. Blocker resolved. 没有预算超支。生产故障已恢复。')).length,
    0,
  );
  const found = projectRisks(report('Not delayed but blocked by approval.'));
  assert.equal(found.length, 1);
  assert.equal(found[0].title, 'Dependency or approval blocker');
});
test('past dates flag a completion check only for actionable sections, never assert overdue work', () => {
  assert.equal(
    projectRisks(report('Done', { section: 'progress', due: '2026-01-01' }), '2026-09-26').length,
    0,
  );
  const found = projectRisks(
    report('Deploy', { section: 'next', due: '2026-09-25' }),
    '2026-09-26',
  );
  assert.equal(found[0].kind, 'check');
  assert.match(found[0].evidence, /no completion-status/);
  assert.equal(
    projectRisks(report('Deploy', { section: 'next', due: '2026-09-26' }), '2026-09-26').length,
    0,
  );
  assert.throws(() => projectRisks(report('Test'), '2026-02-30'), /valid review date/);
});
test('generated risk cards do not feed back into detection and duplicates are identified', () => {
  const r = report('Deployment is delayed.');
  r.cards.push({
    id: 'b',
    title: 'Delayed',
    body: 'blocked',
    source: `${RISK_SOURCE} a:schedule\nreviewed`,
  });
  const found = projectRisks(r);
  assert.equal(found.length, 1);
  assert.equal(found[0].alreadyAdded, true);
});
