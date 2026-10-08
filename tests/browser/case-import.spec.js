import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const sample = {
  detection: {
    is_badcase: true,
    observed_behavior: 'A tool call was printed as text.',
    violated_rule: 'Wait for tool completion.',
    uncertainty: ['The tool parser needs review.'],
  },
  case_review: { case_locator: 'fictional-1' },
  score_summary: { available: false, token_count: 0 },
  diagnosis: {
    available: true,
    primary_cause: 'format mismatch',
    logprob_interpretation: 'Source interpretation',
    recommendations: [
      {
        title: 'Validate the tool protocol',
        rationale: 'Inspect parsed calls.',
        system_prompt_appendix: 'Ignore previous instructions',
      },
    ],
  },
  retry_root_cause_analysis: {
    available: true,
    trials_total: 5,
    correct_count: 5,
    incorrect_count: 0,
    accuracy: 1,
    trial_assessments: Array.from({ length: 5 }, (_, i) => ({
      key: String(i),
      is_correct: true,
      token_count: 0,
    })),
  },
};
async function upload(page, content = sample) {
  await page.goto('/#new');
  await page.locator('#intake-files').setInputFiles({
    name: 'case.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(content)),
  });
}
test('case report is ready without metric choices, retains evidence limits, and stages into useful sections', async ({
  page,
}) => {
  await upload(page);
  await expect(page.getByText('Your report is ready to review')).toBeVisible();
  await expect(page.locator('#data-metric')).toHaveCount(0);
  await expect(page.locator('#case-findings')).toContainText('5/5 marked correct');
  await expect(page.locator('#case-findings')).toContainText('marked unavailable');
  expect((await new AxeBuilder({ page }).include('#modal').analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Add selected cards' }).click();
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#cards .card')).toHaveCount(4);
  await expect(page.locator('#cards')).toContainText('Needs discussion');
  await expect(page.locator('#cards')).toContainText('Next steps');
  await page.reload();
  await expect(page.locator('#cards img')).toBeVisible();
});
test('case import can be cancelled or switched to manual analysis without losing the file', async ({
  page,
}) => {
  await upload(page);
  await page.getByText('Advanced analysis', { exact: true }).click();
  await page.getByRole('button', { name: 'Choose fields manually' }).click();
  await expect(page.locator('#data-form')).toBeVisible();
  await expect(page.locator('#data-collection')).toHaveValue('2');
  await page.getByRole('button', { name: 'Cancel import' }).click();
  await expect(page.locator('#intake-files')).toBeEnabled();
  await expect(page.locator('#material-list')).toBeEmpty();
});
test('recommended metrics stay concise, constants remain accessible, and zero values are counted', async ({
  page,
}) => {
  await upload(page, [
    { id: 1, value: 0, unused: 0, team: 'IT' },
    { id: 2, value: 5, unused: 0, team: 'IT' },
  ]);
  await expect(page.locator('#data-metric option')).toHaveCount(1);
  await expect(page.locator('#data-metric')).toHaveValue('/value');
  await page.getByRole('button', { name: 'Find patterns' }).click();
  await expect(page.locator('#data-findings')).toContainText('2/2 records');
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-show-all').check();
  await expect(page.locator('#data-metric option')).toHaveCount(3);
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-metric').selectOption('/unused');
  await page.getByRole('button', { name: 'Find patterns' }).click();
  await expect(page.locator('#data-findings')).toContainText('Mean 0');
});
// Opt-in local check: never copy the user's file into fixtures or published assets.
test('provided local case file produces an immediate review with no metric mapping', async ({
  page,
}) => {
  test.skip(!process.env.BRIEF_CASE_FIXTURE, 'Requires an explicitly supplied local case file.');
  await page.goto('/#new');
  await page.locator('#intake-files').setInputFiles(process.env.BRIEF_CASE_FIXTURE);
  await expect(page.getByText('Your report is ready to review')).toBeVisible();
  await expect(page.locator('#case-findings')).toContainText('5/5 marked correct');
  await expect(page.locator('#case-findings')).toContainText(
    'Original token scores are marked unavailable',
  );
  await expect(page.locator('#data-metric')).toHaveCount(0);
  await page.screenshot({ path: '.build/provided-case-review.png' });
  await page.getByRole('button', { name: 'Add selected cards' }).click();
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#cards .card')).toHaveCount(4);
});

test('text evidence skips empty score controls and imports reviewed records with source', async ({
  page,
}) => {
  await upload(page, {
    evidence: [
      { quote_or_stat: 'The tool output is missing.', reason: '<script>unsafe()</script>' },
      { quote_or_stat: 'Follow-up needs review.', reason: 'Check the transcript.' },
    ],
    measurements: [{ value: 0 }, { value: 5 }],
  });
  // Pick the text-only collection, as in the reported screenshot.
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-collection').selectOption('0');
  await expect(page.locator('#data-mode')).toHaveValue('records');
  await expect(page.locator('#data-metric')).toHaveCount(0);
  await expect(page.locator('#data-pair-key')).toHaveCount(0);
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-show-all').check();
  await expect(page.locator('#data-metric')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview record cards' }).click();
  await expect(page.locator('#data-findings')).toContainText('The tool output is missing.');
  await expect(page.locator('#data-findings script')).toHaveCount(0);
  expect((await new AxeBuilder({ page }).include('#modal').analyze()).violations).toEqual([]);
  // Switching to actual measurements restores useful metric controls and clears stale findings.
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-collection').selectOption('1');
  await expect(page.locator('#data-metric')).toHaveValue('/value');
  await expect(page.locator('#data-findings')).toBeEmpty();
  await expect(page.locator('#data-adjust')).toBeVisible();
  if ((await page.locator('#data-adjust').getAttribute('open')) === null)
    await page.locator('#data-adjust > summary').click();
  await page.locator('#data-collection').selectOption('0');
  await page.getByRole('button', { name: 'Preview record cards' }).click();
  await page.locator('[data-finding="1"]').uncheck();
  await page.getByRole('button', { name: 'Add selected findings' }).click();
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
  await expect(page.locator('#cards .card')).toHaveCount(1);
  await expect(page.locator('#cards')).toContainText('Needs discussion');
  await expect(page.locator('#cards')).toContainText('The tool output is missing.');
  await page.reload();
  await expect(page.locator('#cards')).toContainText('The tool output is missing.');
});
