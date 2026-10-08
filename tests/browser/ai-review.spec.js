import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const fixture = {
  model: 'jev-1.13.0',
  promptVersion: 'brief-review-v1',
  category: {
    label: 'decision',
    confidence: 0.9,
    probabilities: { progress: 0.02, decision: 0.91, blocker: 0.03, mixed: 0.03, unclear: 0.01 },
  },
  leadershipProbability: 0.92,
  blockerProbability: 0.12,
};
async function setup(page) {
  await page.goto('/#new');
  await page.getByLabel('What happened').fill('Please approve two support engineers.');
  await page.locator('#create-report').click();
  await expect(page).toHaveURL(/#report\//);
}
test('AI disclosure precedes transmission, then user applies and undoes the type suggestion', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/ai/status', (route) =>
    route.fulfill({ json: { enabled: true, model: 'jev-1.13.0' } }),
  );
  await page.route('**/api/ai/review', (route) => {
    calls++;
    expect(Object.keys(route.request().postDataJSON()).sort()).toEqual(['body', 'title']);
    return route.fulfill({ json: fixture });
  });
  await setup(page);
  await page.getByRole('button', { name: 'Check decisions & blockers' }).click();
  await expect(page.locator('#ai-send')).toBeEnabled();
  expect(calls).toBe(0);
  await expect(page.getByRole('dialog')).toContainText('sent to TypeSafe AI');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.locator('#ai-send').click();
  await expect(page.locator('[data-apply]')).toBeVisible();
  await expect(page.locator('#cards .card')).toHaveClass(/update/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: '.build/ai-review.png' });
  await page.locator('[data-apply]').click();
  await expect(page.locator('#cards .card')).toHaveClass(/decision/);
  await page.getByRole('button', { name: 'Undo suggestion' }).click();
  await expect(page.locator('#cards .card')).toHaveClass(/update/);
  expect(calls).toBe(1);
});
test('low confidence and errors preserve the original card', async ({ page }) => {
  await page.route('**/api/ai/status', (route) => route.fulfill({ json: { enabled: true } }));
  await page.route('**/api/ai/review', (route) =>
    route.fulfill({ json: { ...fixture, category: { ...fixture.category, confidence: 0.2 } } }),
  );
  await setup(page);
  await page.getByRole('button', { name: 'Check decisions & blockers' }).click();
  await page.locator('#ai-send').click();
  await expect(page.locator('#ai-result-0')).toContainText('No automatic change');
  await expect(page.locator('[data-apply]')).toHaveCount(0);
  await page.route('**/api/ai/review', (route) =>
    route.fulfill({ status: 429, json: { error: 'Try again later.' } }),
  );
  await page.locator('#ai-send').click();
  await expect(page.locator('#ai-status')).toContainText('Try again later');
  await expect(page.locator('#cards .card')).toHaveClass(/update/);
});
test('static mode hides unavailable AI and leaves editing accessible', async ({ page }) => {
  await setup(page);
  await expect(page.getByRole('button', { name: 'Check decisions & blockers' })).toBeHidden();
  await page.getByRole('button', { name: /Edit Please approve/ }).click();
  await expect(page.locator('#edit-title')).toHaveValue('Please approve two support engineers');
  await expect(page.locator('#edit-body')).toHaveValue('');
});
