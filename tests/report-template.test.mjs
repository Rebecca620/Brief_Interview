import test from 'node:test';
import assert from 'node:assert/strict';
import { createCard, emptyReport, isReport } from '../src/domain/report.js';
import { reportHTML, reportText } from '../src/domain/export.js';
import { parseBackup, backupDTO } from '../src/data/report-repository.js';

test('retrospective preserves content, escapes action cells and retains rich action cards', () => {
  const report = emptyReport('<Title>', 'Period');
  report.template = 'retrospective';
  report.people = [{ id: 'owner', name: '<Owner>', role: 'Lead' }];
  report.cards = [
    createCard('update', {
      section: 'next',
      title: '<Action>',
      body: 'Evidence & details',
      owner: 'owner',
      due: '2026-10-02',
    }),
    createCard('metric', { section: 'next', title: 'Ready', value: 0, target: 10 }),
    createCard('update', { section: 'consensus', title: 'Consensus', body: 'Keep the evidence.' }),
  ];
  const original = JSON.stringify(report);
  const html = reportHTML(report);
  assert.match(html, /&lt;Action&gt;/);
  assert.match(html, /&lt;Owner&gt;/);
  assert.match(html, /2026-10-02/);
  assert.match(html, /0% of target/);
  assert.match(html, /Keep the evidence/);
  assert.match(html, /max-width: 1040px/);
  assert.equal(JSON.stringify(report), original);
  assert.match(reportText(report), /Key takeaways/);
  assert.ok(isReport(parseBackup(JSON.stringify(backupDTO([report])))[0]));
});
test('legacy reports stay valid, while unknown templates are rejected', () => {
  const report = emptyReport('Legacy');
  assert.ok(isReport(report));
  assert.match(reportHTML(report), /max-width: 728px/);
  report.template = 'unknown';
  assert.equal(isReport(report), false);
});
