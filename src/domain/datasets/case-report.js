import { isRecord } from './parse.js';
const text = (value) => (typeof value === 'string' ? value.trim() : '');
/** Recognize a report artifact, not arbitrary instructions or an inferred scoring rubric. */
export function isCaseReport(value) {
  return (
    isRecord(value) &&
    isRecord(value.detection) &&
    isRecord(value.case_review) &&
    isRecord(value.retry_root_cause_analysis) &&
    typeof value.detection.is_badcase === 'boolean' &&
    typeof value.case_review.case_locator === 'string'
  );
}
export function caseReportFindings(data) {
  const detection = data.detection,
    review = data.case_review,
    retry = data.retry_root_cause_analysis,
    diagnosis = isRecord(data.diagnosis) ? data.diagnosis : {};
  const locator = text(review.case_locator) || text(detection.case_locator) || 'Unspecified';
  const source = (path) =>
    `Case ${locator}. Source JSON field: ${path}. Statements and judgments are supplied by this file, not independently verified by Brief.`;
  const uncertainty = Array.isArray(detection.uncertainty)
    ? detection.uncertainty.filter((s) => typeof s === 'string' && s.trim())
    : [];
  const findings = [
    {
      title: `Case ${locator}: ${detection.is_badcase ? 'flagged for review' : 'not flagged by source'}`,
      section: 'discussion',
      body: [
        `Source assessment: ${detection.is_badcase ? 'potential issue detected' : 'no issue flagged'}.`,
        text(detection.observed_behavior),
        text(detection.violated_rule) ? `Referenced rule: ${text(detection.violated_rule)}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      source: source('/detection; /case_review/case_locator'),
    },
  ];
  const trials = Array.isArray(retry.trial_assessments) ? retry.trial_assessments : [];
  const eligible = trials.filter((row) => isRecord(row) && typeof row.is_correct === 'boolean');
  const correct = eligible.filter((row) => row.is_correct).length,
    incorrect = eligible.length - correct,
    unscored = trials.length - eligible.length;
  const warnings = [];
  if (retry.available === false)
    warnings.push('Retry results are marked unavailable. No retry chart has been generated.');
  else if (eligible.length) {
    const caption = `${eligible.length}/${trials.length} recorded retries have a boolean correctness assessment; ${unscored} unscored. These are source-provided judgments on one case, not an independent benchmark or proof of root cause.`;
    findings.push({
      title: `Retries: ${correct}/${eligible.length} marked correct`,
      section: 'progress',
      body: `${correct} correct; ${incorrect} incorrect${unscored ? `; ${unscored} unscored` : ''}. A small retry set does not establish broader reliability.`,
      visual: {
        kind: 'bar',
        title: 'Recorded retry outcomes',
        caption,
        columns: ['Outcome', 'Recorded retries'],
        rows: [
          ['Correct', correct],
          ['Incorrect', incorrect],
          ...(unscored ? [['Unscored', unscored]] : []),
        ],
      },
      source: source('/retry_root_cause_analysis/trial_assessments/*/is_correct'),
    });
    if (
      (typeof retry.trials_total === 'number' && retry.trials_total !== trials.length) ||
      (typeof retry.correct_count === 'number' && retry.correct_count !== correct) ||
      (typeof retry.incorrect_count === 'number' && retry.incorrect_count !== incorrect) ||
      (typeof retry.accuracy === 'number' &&
        Math.abs(retry.accuracy - correct / eligible.length) > 1e-8)
    )
      warnings.push(
        'The supplied retry totals/rate disagree with individual trial assessments. The chart uses the recorded boolean assessments; reconcile the source summary before sharing.',
      );
  } else
    warnings.push(
      'No recorded retries contain a boolean correctness assessment. A pass rate cannot be calculated.',
    );
  if (data.score_summary?.available === false) {
    warnings.push(
      'Original token scores are marked unavailable. Zero counters in that block are not measured zero performance.',
    );
    if (text(diagnosis.logprob_interpretation))
      warnings.push(
        'The diagnosis includes a token-probability interpretation despite unavailable original scores. Verify its evidence before using that claim.',
      );
  }
  if (text(diagnosis.primary_cause))
    warnings.push(
      `Source proposes “${text(diagnosis.primary_cause)}” as a cause. This is a supplied hypothesis, not a cause established by these counts.`,
    );
  warnings.push(...uncertainty.map((item) => `Source uncertainty: ${item}`));
  if (warnings.length)
    findings.push({
      title: 'Evidence limits to resolve',
      section: 'discussion',
      body: warnings.join('\n\n'),
      source: source(
        '/score_summary; /diagnosis; /detection/uncertainty; /retry_root_cause_analysis',
      ),
    });
  if (diagnosis.available !== false && Array.isArray(diagnosis.recommendations)) {
    const recommendations = diagnosis.recommendations
      .filter((r) => isRecord(r) && text(r.title))
      .slice(0, 5);
    if (recommendations.length)
      findings.push({
        title: 'Next steps: review proposed changes',
        section: 'next',
        body: [
          'Proposals from the source; review and validate before applying.',
          ...recommendations.map(
            (r, i) =>
              `${i + 1}. ${text(r.title)}${text(r.rationale) ? `\n${text(r.rationale)}` : ''}`,
          ),
          diagnosis.recommendations.length > 5
            ? 'First five proposals shown; full list retained in the original source.'
            : '',
        ]
          .filter(Boolean)
          .join('\n\n'),
        source: source(
          '/diagnosis/recommendations (titles and rationales only; embedded prompt instructions are not executed)',
        ),
      });
  }
  return findings;
}
