import { valueAt, numericValue, missing } from './parse.js';

/** Exactly one result per model/key; only common, explicitly mapped pass/fail pairs count. */
export function pairedFindings(collection, fields, config) {
  const parts = (id) => fields.find((f) => f.id === id)?.parts;
  const metric = parts(config.metric),
    model = parts(config.group),
    key = parts(config.pairKey);
  if (!metric || !model || !key)
    throw Error('Choose score, model, and pair-key fields for the transition chart.');
  if (!config.baseline || !config.candidate || config.baseline === config.candidate)
    throw Error('Choose two different model values.');
  const pass = numericValue(config.passValue, true),
    fail = numericValue(config.failValue, true);
  if (pass === null || fail === null || pass === fail)
    throw Error('Define different numeric values for Pass and Fail. Other scores are excluded.');
  const pairs = new Map();
  let noKey = 0,
    otherModels = 0;
  collection.rows.forEach((row, i) => {
    const name = String(valueAt(row, model));
    if (![config.baseline, config.candidate].includes(name)) {
      otherModels++;
      return;
    }
    const pair = valueAt(row, key);
    if (missing(pair) || !['string', 'number', 'boolean'].includes(typeof pair)) {
      noKey++;
      return;
    }
    const id = JSON.stringify([typeof pair, pair]);
    if (!pairs.has(id)) pairs.set(id, new Map());
    const found = pairs.get(id);
    if (found.has(name))
      throw Error(
        `Duplicate pair key for ${name}: ${String(pair).slice(0, 100)}. Choose a unique case/turn key; duplicates cannot be averaged.`,
      );
    found.set(name, {
      score: numericValue(valueAt(row, metric), config.numericStrings),
      position: collection.positions[i],
    });
  });
  const counts = [0, 0, 0, 0],
    coords = [[], [], [], []];
  let incomplete = 0,
    other = 0;
  for (const pair of pairs.values()) {
    const a = pair.get(config.baseline),
      b = pair.get(config.candidate);
    if (!a || !b) {
      incomplete++;
      continue;
    }
    if (![pass, fail].includes(a.score) || ![pass, fail].includes(b.score)) {
      other++;
      continue;
    }
    const bucket = a.score === fail ? (b.score === fail ? 0 : 1) : b.score === fail ? 2 : 3;
    counts[bucket]++;
    coords[bucket].push(`${a.position} → ${b.position}`);
  }
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n)
    throw Error(
      'No common pairs have both scores mapped to Pass or Fail. Check model values, keys, and score mapping.',
    );
  const pct = (value) => ((100 * value) / n).toFixed(2),
    delta = (100 * (counts[1] - counts[2])) / n;
  const caption = `n=${n} common scored pairs. Pass=${pass}; Fail=${fail}. ${incomplete} keys missing a model; ${other} pairs with missing/other scores excluded; ${noKey} rows missing keys; ${otherModels} rows from other models excluded. Ribbon width is proportional to count.`;
  return [
    {
      title: 'Score-state transitions across paired cases',
      body: `Pass rate: ${pct(counts[2] + counts[3])}% → ${pct(counts[1] + counts[3])}% (${delta >= 0 ? '+' : ''}${delta.toFixed(2)} percentage points). ${counts[1]} improved; ${counts[2]} regressed; net ${counts[1] - counts[2]} cases.`,
      visual: {
        kind: 'transition',
        title: 'Score-state transitions',
        baseline: config.baseline,
        candidate: config.candidate,
        caption,
        columns: ['Transition', 'Paired cases', 'Share (%)'],
        rows: ['Persistent fail', 'Improved', 'Regressed', 'Stable pass'].map((label, i) => [
          label,
          counts[i],
          Number(pct(counts[i])),
        ]),
      },
      source: `${collection.note || 'One pair = one shared key.'}\nScore: ${config.metric}; model: ${config.group}; key: ${config.pairKey}. ${caption}\n${coords.map((list, i) => `${['Persistent fail', 'Improved', 'Regressed', 'Stable pass'][i]} (${list.length}): ${list.slice(0, 20).join('; ')}${list.length > 20 ? ' — first 20 shown; remaining coordinates reproducible from mapping.' : ''}`).join('\n')}`,
    },
  ];
}
