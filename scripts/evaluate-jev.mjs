import { readFile } from 'node:fs/promises';
import { reviewWithJev } from '../server/jev-client.mjs';
import { suggestedType } from '../src/features/ai-review/contract.js';
if (!process.env.TYPESAFE_API_KEY)
  throw Error('Configure TYPESAFE_API_KEY locally before running the paid live evaluation.');
const cases = JSON.parse(
  await readFile(new URL('../tests/fixtures/jev-evaluation.json', import.meta.url), 'utf8'),
);
let correct = 0,
  failed = 0,
  offered = 0,
  correctOffered = 0,
  tp = 0,
  fp = 0,
  fn = 0;
const latencies = [];
for (const item of cases) {
  const start = performance.now();
  try {
    const result = await reviewWithJev(item, {
      apiKey: process.env.TYPESAFE_API_KEY,
      model: process.env.TYPESAFE_MODEL,
    });
    const elapsed = performance.now() - start;
    latencies.push(elapsed);
    const predicted = result.category.label,
      action = suggestedType(result);
    correct += Number(predicted === item.expected);
    if (action) {
      offered++;
      correctOffered += Number(predicted === item.expected);
    }
    if (predicted === 'decision' && item.expected === 'decision') tp++;
    if (predicted === 'decision' && item.expected !== 'decision') fp++;
    if (predicted !== 'decision' && item.expected === 'decision') fn++;
    console.log(
      JSON.stringify({
        id: item.id,
        expected: item.expected,
        predicted,
        confidence: result.category.confidence,
        offeredType: action,
        model: result.model,
        latencyMs: Math.round(elapsed),
      }),
    );
  } catch {
    failed++;
    console.log(
      JSON.stringify({
        id: item.id,
        error: 'Request failed; inspect server configuration or retry later.',
      }),
    );
  }
}
latencies.sort((a, b) => a - b);
const rate = (numerator, denominator) =>
  denominator ? Number((numerator / denominator).toFixed(3)) : null;
const percentile = (p) =>
  latencies.length ? Math.round(latencies[Math.ceil(p * latencies.length) - 1]) : null;
console.log(
  JSON.stringify(
    {
      cases: cases.length,
      failed,
      accuracyAmongCompleted: rate(correct, latencies.length),
      decisionPrecision: rate(tp, tp + fp),
      decisionRecall: rate(tp, tp + fn),
      offeredTypeChangeRate: rate(offered, latencies.length),
      offeredTypeChangeAccuracy: rate(correctOffered, offered),
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      note: 'Small hand-authored smoke set; not proof of production accuracy or calibration.',
    },
    null,
    2,
  ),
);
