import { valueAt, numericValue, missing } from './parse.js';
const technical =
  /(?:^|_)(?:id|index|position|slot|locator|logprob|ppl|token|tokens|confidence)(?:_|$)/i;
const human = (value) =>
  String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
export const fieldLabel = (field) => field.parts.slice(-2).map(human).join(' › ');
export const collectionLabel = (collection) =>
  collection.label === 'Root array'
    ? 'Records'
    : collection.label === 'One record per line'
      ? 'JSONL records'
      : human(collection.label.split('/').filter(Boolean).at(-1) || collection.label);
export function fieldChoices(collection, fields) {
  return fields.map((field) => {
    const raw = collection.rows.map((row) => valueAt(row, field.parts));
    const values = raw.map((v) => numericValue(v, true)).filter((v) => v !== null),
      distinct = new Set(values);
    const present = raw.filter((v) => !missing(v));
    const categories = new Set(present.map((v) => JSON.stringify([typeof v, v])));
    const unavailable = collection.rows.every((row) =>
      field.parts
        .slice(0, -1)
        .some((_, i) => valueAt(row, field.parts.slice(0, i + 1))?.available === false),
    );
    const metadata = technical.test(field.parts.at(-1));
    const constant = values.length > 1 && distinct.size === 1;
    const reason = unavailable
      ? 'Marked unavailable by source'
      : metadata
        ? 'Technical field / identifier'
        : constant
          ? values[0] === 0
            ? 'All recorded values are zero'
            : 'No variation in this file'
          : !values.length
            ? 'No numeric values'
            : '';
    const group =
      !metadata &&
      categories.size >= 1 &&
      categories.size <= 20 &&
      present.every(
        (v) =>
          typeof v === 'boolean' ||
          (typeof v === 'string' && v.length <= 80 && numericValue(v, true) === null),
      );
    return {
      ...field,
      label: fieldLabel(field),
      reason,
      unavailable,
      metadata,
      constant,
      categoryCount: categories.size,
      recommended: values.length > 0 && !unavailable && !metadata && !constant,
      group,
    };
  });
}
export function recommendedCollection(dataset) {
  let best = 0,
    score = -Infinity;
  dataset.collections.forEach((collection, index) => {
    // Prefer collections that contain outcomes rather than pointers into a transcript.
    const value = collection.rows.some((row) => row.type === 'compress')
      ? 100
      : collection.rows.some((row) => typeof row.is_correct === 'boolean')
        ? 90
        : collection.rows.some((row) =>
              Object.keys(row).some((key) =>
                /^(score|value|revenue|completed|cost|duration)$/i.test(key),
              ),
            )
          ? 50
          : 0;
    if (value > score) {
      score = value;
      best = index;
    }
  });
  return best;
}
