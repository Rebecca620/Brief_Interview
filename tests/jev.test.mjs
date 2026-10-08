import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewInput, isReview, suggestedType } from '../src/features/ai-review/contract.js';
import {
  buildJevRequest,
  normalizeJevResponse,
  reviewWithJev,
  JEV_ENDPOINT,
} from '../server/jev-client.mjs';
const providerResult = () => ({
  model: 'jev-1.13.0',
  answers: {
    category: {
      type: 'choice',
      choice: 'decision',
      confidence: 0.9,
      probabilities: { progress: 0.02, decision: 0.91, blocker: 0.03, mixed: 0.03, unclear: 0.01 },
    },
    leadership: { type: 'noul', noul: 0.92 },
    blocker: { type: 'noul', noul: 0.12 },
  },
});

test('AI DTO sends only the selected title and body', () => {
  const input = reviewInput({
    title: 'Approval',
    body: 'Approve two engineers.',
    image: 'private-image',
    source: 'private-original',
    owner: 'private-owner',
  });
  assert.deepEqual(input, { title: 'Approval', body: 'Approve two engineers.' });
  const request = buildJevRequest(input);
  assert.equal(request.model, 'jev-1.13.0');
  assert.deepEqual(Object.keys(request.questions), ['category', 'leadership', 'blocker']);
  assert.equal(JSON.stringify(request).includes('private-'), false);
});
test('empty and oversized AI inputs fail before a request', () => {
  for (const input of [
    { title: 'T', body: '' },
    { title: 'T', body: ' '.repeat(10) },
    { title: 'T', body: 'x'.repeat(8001) },
    { title: 42, body: 'x' },
  ])
    assert.throws(() => reviewInput(input));
});
test('bounded responses validate and sufficiently clear decisions remain suggestions', () => {
  const review = normalizeJevResponse(providerResult());
  assert.equal(isReview(review), true);
  assert.equal(suggestedType(review), 'decision');
  review.category.confidence = 0.3;
  assert.equal(suggestedType(review), null);
});
test('incorrect types, probabilities, labels and missing responses are rejected', () => {
  for (const change of [
    (r) => (r.answers.category.choice = 'delete_everything'),
    (r) => (r.answers.blocker.noul = 2),
    (r) => (r.answers.category.confidence = '0.9'),
    (r) => (r.answers.category.probabilities.decision = 0.1),
    (r) => delete r.answers.leadership,
  ]) {
    const response = providerResult();
    change(response);
    assert.throws(() => normalizeJevResponse(response));
  }
});
test('the adapter uses only the official endpoint and server-side authorization', async () => {
  const review = await reviewWithJev(
    { title: 'T', body: 'Approve access.' },
    {
      apiKey: 'test-only-key',
      fetchImpl: async (url, options) => {
        assert.equal(url, JEV_ENDPOINT);
        assert.equal(options.headers.Authorization, 'Bearer test-only-key');
        assert.equal(options.redirect, 'error');
        assert.equal(JSON.parse(options.body).model, 'jev-1.13.0');
        return new Response(JSON.stringify(providerResult()));
      },
    },
  );
  assert.equal(review.category.label, 'decision');
  assert.equal(JSON.stringify(review).includes('test-only-key'), false);
});
test('rate limits, invalid output, connection errors and missing credentials fail without fake results', async () => {
  const input = { title: 'T', body: 'Approve access.' };
  await assert.rejects(reviewWithJev(input), /not configured/);
  await assert.rejects(
    reviewWithJev(input, {
      apiKey: 'x',
      fetchImpl: async () => new Response('secret upstream text', { status: 429 }),
    }),
    /rate-limited/,
  );
  await assert.rejects(
    reviewWithJev(input, { apiKey: 'x', fetchImpl: async () => new Response('{bad') }),
    /invalid response/,
  );
  await assert.rejects(
    reviewWithJev(input, {
      apiKey: 'x',
      fetchImpl: async () => {
        throw Error('internal secret');
      },
    }),
    /timed out/,
  );
});
