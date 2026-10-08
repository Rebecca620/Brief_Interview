import { pairedFindings } from './paired.js';
import { valueAt, numericValue, dateValue, missing } from './parse.js';
const fmt = (n) =>
  Number(n.toPrecision(6)).toLocaleString('en-US', { maximumSignificantDigits: 6 });
const mean = (values) => values.reduce((total, n) => total + n / values.length, 0);
const quantile = (sorted, p) => {
  const index = (sorted.length - 1) * p,
    lo = Math.floor(index);
  return sorted[lo] * (1 - (index - lo)) + sorted[Math.ceil(index)] * (index - lo);
};

/** Descriptive observations only. No inferred score semantics, ranking or causality. */
export function analyzeDataset(collection, fields, config) {
  if (config.mode === 'paired') return pairedFindings(collection, fields, config);
  const field = (id) => fields.find((item) => item.id === id);
  const metric = field(config.metric);
  if (!metric) throw Error('Choose a numeric field to analyze.');
  const group = field(config.group),
    date = field(config.date);
  const data = collection.rows.map((row, index) => ({
    row,
    position: collection.positions[index],
    value: numericValue(valueAt(row, metric.parts), config.numericStrings),
  }));
  const valid = data.filter((item) => item.value !== null),
    values = valid.map((item) => item.value).sort((a, b) => a - b);
  if (!valid.length)
    throw Error(
      'This field has no usable numeric values. Select another field or enable numeric strings.',
    );
  const rules = `Collection: ${collection.label}. Numeric field: ${metric.id}. Numeric strings: ${Boolean(config.numericStrings)}. Group: ${group?.id || 'none'}. Date: ${date?.id || 'none'}. Mode: ${config.mode}. Missing, non-numeric and unsafe integer values excluded; no imputation. ${collection.note || 'One row = one record.'}`;
  const findings = [];
  function add(title, body, evidence = '') {
    findings.push({ title, body, source: rules + '\n' + evidence });
  }
  function visual(kind, title, columns, rows, caption) {
    findings.at(-1).visual = { kind, title, columns, rows, caption };
  }
  add(
    'Data coverage',
    `${valid.length}/${data.length} records have usable ${metric.id} values; ${data.length - valid.length} excluded. ${collection.note || 'Each record contributes one observation.'}`,
    'Eligible source locations: ' +
      valid
        .slice(0, 12)
        .map((r) => r.position)
        .join('; ') +
      (valid.length > 12 ? '; remaining locations reproducible from field rules.' : ''),
  );
  add(
    `${metric.parts.at(-1)}: summary`,
    `Mean ${fmt(mean(values))}; median ${fmt(quantile(values, 0.5))}; minimum ${fmt(values[0])}; maximum ${fmt(values.at(-1))}. Based on ${valid.length} usable records. These describe this file, not a forecast.`,
  );
  visual(
    'table',
    'Numeric summary',
    ['Statistic', 'Value'],
    [
      ['Usable records', valid.length],
      ['Excluded records', data.length - valid.length],
      ['Mean', mean(values)],
      ['Median', quantile(values, 0.5)],
      ['Minimum', values[0]],
      ['Maximum', values.at(-1)],
    ],
    `Field: ${metric.id}; no missing-value imputation.`,
  );
  if (config.mode === 'evaluation' && config.passRule !== 'none') {
    const threshold = numericValue(config.threshold, true);
    if (threshold === null) throw Error('Enter a finite numeric pass threshold.');
    const pass = (value) => (config.passRule === 'gte' ? value >= threshold : value <= threshold);
    const count = valid.filter((item) => pass(item.value)).length;
    add(
      'Pass rate under your rule',
      `${count}/${valid.length} eligible evaluations pass (${fmt((count / valid.length) * 100)}%). Rule: ${metric.id} ${config.passRule === 'gte' ? '≥' : '≤'} ${threshold}. ${data.length - valid.length} unscored/invalid records excluded. This is a threshold-based rate, not an inferred accuracy measure.`,
    );
  }
  if (config.mode === 'evaluation' && config.passRule !== 'none') {
    const threshold = numericValue(config.threshold, true);
    const count = valid.filter((item) =>
      config.passRule === 'gte' ? item.value >= threshold : item.value <= threshold,
    ).length;
    visual(
      'bar',
      'Evaluation pass rule',
      ['Outcome', 'Evaluations'],
      [
        ['Meets rule', count],
        ['Does not meet rule', valid.length - count],
      ],
      `n=${valid.length} scored evaluations. ${metric.id} ${config.passRule === 'gte' ? '≥' : '≤'} ${threshold}. ${data.length - valid.length} invalid/missing scores excluded.`,
    );
  }
  if (group) {
    const groups = new Map();
    let excluded = 0;
    for (const item of valid) {
      const key = valueAt(item.row, group.parts);
      if (missing(key) || !['string', 'number', 'boolean'].includes(typeof key)) {
        excluded++;
        continue;
      }
      const identity = JSON.stringify([typeof key, key]);
      if (!groups.has(identity)) groups.set(identity, { label: JSON.stringify(key), values: [] });
      groups.get(identity).values.push(item.value);
    }
    const all = [...groups.values()];
    add(
      `Breakdown by ${group.id}`,
      all
        .slice(0, 8)
        .map((g) => `${g.label}: mean ${fmt(mean(g.values))} (n=${g.values.length})`)
        .join('\n') +
        `\n${excluded} usable records lack a group; ${Math.max(0, all.length - 8)} additional groups omitted from this summary. Groups shown in source order. Coverage may differ; this is not a paired comparison or model ranking.`,
    );
    if (all.length) {
      visual(
        'bar',
        `Average ${metric.parts.at(-1)} by ${group.parts.at(-1)}`,
        ['Group', 'Mean', 'Records'],
        all.slice(0, 8).map((g) => [g.label, mean(g.values), g.values.length]),
        `${excluded} numeric records lack a group. ${Math.max(0, all.length - 8)} groups omitted. Each group uses its available rows; this is not a paired model ranking.`,
      );
      findings.at(-1).body =
        `${all.length} groups across ${valid.length - excluded} usable records. Compare averages and sample sizes below.`;
    }
  }
  if (date && config.mode === 'numeric') {
    const days = new Map();
    let excluded = 0;
    for (const item of valid) {
      const day = dateValue(valueAt(item.row, date.parts));
      if (!day) {
        excluded++;
        continue;
      }
      if (!days.has(day)) days.set(day, []);
      days.get(day).push(item.value);
    }
    const sorted = [...days.keys()].sort();
    if (sorted.length >= 2) {
      const first = sorted[0],
        last = sorted.at(-1),
        a = mean(days.get(first)),
        b = mean(days.get(last));
      add(
        'First-to-last daily change',
        `${first}: mean ${fmt(a)} (n=${days.get(first).length}); ${last}: mean ${fmt(b)} (n=${days.get(last).length}). Absolute change ${fmt(b - a)}. ${excluded} usable records excluded for missing/invalid dates. Dates are grouped in UTC; only ISO dates or timestamps with explicit timezone are accepted. Endpoints alone do not establish a sustained trend.`,
      );
      if (sorted.length <= 40)
        visual(
          'line',
          `${metric.parts.at(-1)} over time`,
          ['UTC date', 'Daily mean', 'Records'],
          sorted.map((day) => [day, mean(days.get(day)), days.get(day).length]),
          `${excluded} numeric records excluded for missing/invalid dates. The horizontal axis uses elapsed calendar time; gaps do not imply measurements. Endpoints do not establish a sustained trend.`,
        );
    } else
      add(
        'Date coverage is insufficient',
        `Only ${sorted.length} distinct usable date(s); ${excluded} usable numeric records have missing/invalid dates. At least two dates are required for change analysis.`,
      );
  }
  if (config.mode === 'numeric' && values.length >= 8) {
    const q1 = quantile(values, 0.25),
      q3 = quantile(values, 0.75),
      iqr = q3 - q1,
      low = q1 - 1.5 * iqr,
      high = q3 + 1.5 * iqr;
    const unusual = valid.filter((r) => r.value < low || r.value > high);
    if (unusual.length)
      add(
        'Values to inspect',
        `${unusual.length}/${valid.length} values fall outside the 1.5×IQR fences [${fmt(low)}, ${fmt(high)}]. These are unusual values, not confirmed errors. Quartiles use linear interpolation.`,
        unusual
          .slice(0, 10)
          .map((r) => `${r.position}: ${fmt(r.value)}`)
          .join('\n'),
      );
  }
  if (findings.some((f) => /NaN|Infinity/.test(f.body)))
    throw Error('Values exceed the supported arithmetic range. Rescale the data before importing.');
  return findings;
}
