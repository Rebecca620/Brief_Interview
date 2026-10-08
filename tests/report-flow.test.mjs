import test from 'node:test';
import assert from 'node:assert/strict';
import { noteCards } from '../src/features/intake/material-reader.js';
import { emptyReport, createCard, isReport, reportSections } from '../src/domain/report.js';
import { reportText, reportFragment, cardHTML, displayBody } from '../src/domain/export.js';

test('only explicit section labels organize notes and originals remain intact', () => {
  const original =
    'Needs a decision: Approve 2 devices.\n\nNext steps: Deploy 80 of 100.\n\nApproval might be pending.';
  const cards = noteCards(original, 'Notes', true);
  assert.deepEqual(
    cards.map((card) => card.section),
    ['decision', 'next', 'progress'],
  );
  assert.equal(cards[0].title, 'Approve 2 devices');
  assert.equal(cards[0].body, '');
  assert.equal(cards[0].source, 'Notes\nNeeds a decision: Approve 2 devices.');
  assert.equal(cards[2].type, 'update');
  assert.equal(cards[1].title, 'Deploy 80 of 100');
  assert.equal(cards[1].body, '');
});
test('legacy cards gain display sections without requiring a destructive migration', () => {
  const report = emptyReport('Legacy');
  report.cards = [
    createCard('decision'),
    createCard('update'),
    createCard('update', { section: 'next' }),
  ];
  assert.equal(isReport(report), true);
  assert.deepEqual(
    reportSections(report.cards).map((section) => section.id),
    ['progress', 'decision', 'next'],
  );
  report.cards[0].section = '<script>';
  assert.equal(isReport(report), false);
});
test('display deduplication never mutates source text or removes distinct detail', () => {
  const card = createCard('update', {
    title: 'Pilot is live',
    body: 'Pilot is live.',
    source: 'Original',
  });
  assert.equal(displayBody(card), '');
  assert.equal(card.body, 'Pilot is live.');
  assert.equal(
    displayBody({ ...card, body: 'Pilot is live. Rollout is next.' }),
    'Pilot is live. Rollout is next.',
  );
});
test('email preview and export reuse the same escaped card content and section order', () => {
  const report = emptyReport('Demo');
  report.cards = [
    createCard('update', { section: 'next', title: 'Next <step>', body: 'Keep 80 of 100' }),
    createCard('metric', { title: 'Devices', value: 80, target: 100 }),
  ];
  const html = reportFragment(report);
  for (const card of report.cards) assert.ok(html.includes(cardHTML(report, card, 3)));
  assert.ok(html.indexOf('Progress') < html.indexOf('Next steps'));
  assert.ok(html.includes('80% of target'));
  assert.ok(html.includes('Next &lt;step&gt;'));
  assert.ok(reportText(report).includes('80 / 100 (80% of target)'));
});
