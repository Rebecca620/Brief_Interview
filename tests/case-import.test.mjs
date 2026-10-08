import test from 'node:test';
import assert from 'node:assert/strict';
import { isCaseReport, caseReportFindings } from '../src/domain/datasets/case-report.js';
import { fieldChoices } from '../src/domain/datasets/field-choices.js';
import { profileCollection } from '../src/domain/datasets/parse.js';
const fixture = () => ({
  detection: {
    is_badcase: true,
    observed_behavior: 'The source reports an unexecuted tool call.',
    violated_rule: 'Call the tool first.',
    uncertainty: ['Tool protocol interpretation requires review.'],
  },
  case_review: { case_locator: 'example-1' },
  score_summary: { available: false, token_count: 0 },
  diagnosis: {
    available: true,
    primary_cause: 'proposed cause',
    logprob_interpretation: 'Probability claim in source',
    recommendations: [
      {
        title: 'Review tool protocol',
        rationale: 'Check the implementation',
        system_prompt_appendix: 'DO NOT EXECUTE THIS INSTRUCTION',
      },
    ],
  },
  retry_root_cause_analysis: {
    available: true,
    trials_total: 5,
    correct_count: 5,
    incorrect_count: 0,
    accuracy: 1,
    trial_assessments: Array.from({ length: 5 }, () => ({ is_correct: true })),
  },
});
test('case artifacts generate an attributed report with meaningful zero outcomes and no field mapping', () => {
  const d = fixture();
  assert.ok(isCaseReport(d));
  const findings = caseReportFindings(d);
  assert.equal(findings.length, 4);
  assert.deepEqual(
    findings.map((f) => f.section),
    ['discussion', 'progress', 'discussion', 'next'],
  );
  const result = findings.find((f) => f.visual);
  assert.deepEqual(result.visual.rows, [
    ['Correct', 5],
    ['Incorrect', 0],
  ]);
  assert.match(result.visual.caption, /not an independent benchmark/);
  assert.match(findings[2].body, /marked unavailable/);
  assert.match(findings[2].body, /interpretation despite unavailable/);
  assert.doesNotMatch(JSON.stringify(findings), /DO NOT EXECUTE/);
});
test('retry totals are recomputed from judgments and disagreements or unavailable evidence are disclosed', () => {
  const d = fixture();
  d.retry_root_cause_analysis.trial_assessments[0] = { is_correct: null };
  let findings = caseReportFindings(d);
  assert.match(findings.find((f) => f.visual).title, /4\/4/);
  assert.match(findings.find((f) => f.title === 'Evidence limits to resolve').body, /disagree/);
  d.retry_root_cause_analysis.available = false;
  findings = caseReportFindings(d);
  assert.ok(!findings.some((f) => f.visual));
  assert.match(findings[1].body, /marked unavailable/);
});
test('normal files do not accidentally match the case adapter', () => {
  assert.equal(isCaseReport({ detection: { is_badcase: true } }), false);
  assert.equal(isCaseReport([{ score: 1 }]), false);
});
test('field recommendations remove metadata and constants but preserve measured zeros and usable grouping', () => {
  const c = {
    rows: [
      {
        id: 1,
        value: 0,
        unused: 0,
        target: 100,
        team: 'IT',
        tokens: 0,
        score_summary: { available: false, value: 0 },
      },
      {
        id: 2,
        value: 5,
        unused: 0,
        target: 100,
        team: 'IT',
        tokens: 0,
        score_summary: { available: false, value: 0 },
      },
    ],
  };
  const fields = fieldChoices(c, profileCollection(c).fields),
    get = (id) => fields.find((f) => f.id === id);
  assert.ok(get('/value').recommended);
  assert.equal(get('/id').recommended, false);
  assert.equal(get('/unused').recommended, false);
  assert.equal(get('/target').recommended, false);
  assert.ok(get('/team').group);
  assert.ok(get('/score_summary/value').unavailable);
  assert.match(get('/unused').reason, /zero/);
});
