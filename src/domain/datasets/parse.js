/** Bounded, browser-local ingestion. No rows are silently dropped. */
export const DATA_LIMITS = { rows: 10000, fields: 200, depth: 12, collections: 20 };
export const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const pointer = (parts) =>
  '/' + parts.map((part) => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
export function valueAt(row, parts) {
  let value = row;
  for (const part of parts) {
    if (!isRecord(value) || !Object.hasOwn(value, part)) return undefined;
    value = value[part];
  }
  return value;
}
function normalizeRows(values, location) {
  if (!values.length) throw Error(`${location} contains no records.`);
  if (values.length > DATA_LIMITS.rows)
    throw Error(`Use at most ${DATA_LIMITS.rows.toLocaleString()} records per collection.`);
  if (values.every(isRecord)) return { rows: values, scalar: false };
  if (
    values.every(
      (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value),
    )
  )
    return { rows: values.map((value) => ({ value })), scalar: true };
  throw Error(
    `${location} mixes objects, scalar values, or arrays. Choose a consistent record collection.`,
  );
}
export function parseDataset(text, filename) {
  const source = text.replace(/^\uFEFF/, '');
  if (!source.trim()) throw Error('This data file is empty.');
  if (/\.(jsonl|ndjson)$/i.test(filename)) {
    const rows = [],
      positions = [];
    const lines = source.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      if (!lines[index].trim()) continue;
      try {
        rows.push(JSON.parse(lines[index]));
      } catch {
        throw Error(
          `Invalid JSON on line ${index + 1}. Fix that line and import again; no rows were skipped.`,
        );
      }
      positions.push(`line ${index + 1}`);
      if (rows.length > DATA_LIMITS.rows)
        throw Error(`Use at most ${DATA_LIMITS.rows.toLocaleString()} records.`);
    }
    return {
      format: 'JSONL',
      collections: [
        { id: '$', label: 'One record per line', ...normalizeRows(rows, 'JSONL'), positions },
      ],
      notices: [],
    };
  }
  let data;
  try {
    data = JSON.parse(source);
  } catch {
    throw Error(
      'Invalid JSON. Use a JSON object/array, or choose a .jsonl file for one JSON value per line.',
    );
  }
  const collections = [],
    notices = [];
  function visit(value, parts = [], depth = 0) {
    if (depth > DATA_LIMITS.depth) {
      notices.push('Some nested data is deeper than 12 levels and was not inspected.');
      return;
    }
    if (Array.isArray(value)) {
      if (collections.length >= DATA_LIMITS.collections) {
        notices.push('Only the first 20 collections are offered.');
        return;
      }
      try {
        const normalized = normalizeRows(value, parts.length ? pointer(parts) : 'Root array');
        collections.push({
          id: parts.length ? pointer(parts) : '$',
          label: parts.length ? pointer(parts) : 'Root array',
          ...normalized,
          positions: value.map((_, index) => `${parts.length ? pointer(parts) : ''}/${index}`),
        });
      } catch (error) {
        notices.push(error.message);
      }
      // Nested lists inside each record are deliberately not flattened into unrelated rows.
      return;
    }
    if (isRecord(value)) {
      for (const key of Object.keys(value)) visit(value[key], [...parts, key], depth + 1);
    }
  }
  if (isRecord(data) && data.type === 'compress' && Array.isArray(data.dialog)) {
    collections.push({
      id: '$',
      label: 'Compress record',
      rows: [data],
      scalar: false,
      positions: ['$'],
    });
  } else visit(data);
  if (!collections.length && isRecord(data))
    collections.push({
      id: '$',
      label: 'Single object',
      rows: [data],
      scalar: false,
      positions: ['$'],
    });
  if (!collections.length)
    throw Error(notices[0] || 'Use an object, an array of records, or JSONL records.');
  return { format: 'JSON', collections, notices: [...new Set(notices)] };
}
export function numericValue(value, numericStrings = false) {
  if (
    numericStrings &&
    typeof value === 'string' &&
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())
  )
    value = Number(value);
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  // Large integer identifiers and imprecise integers must not become misleading statistics.
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) return null;
  return value;
}
export const missing = (value) =>
  value === undefined || value === null || (typeof value === 'string' && !value.trim());
export function dateValue(value) {
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    return null;
  if (dateValue(value.slice(0, 10)) === null) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}
export function profileCollection(collection) {
  const fields = new Map();
  let nestedLists = 0,
    truncated = false;
  function inspect(value, parts = [], depth = 0) {
    if (depth > DATA_LIMITS.depth) {
      truncated = true;
      return;
    }
    if (Array.isArray(value)) {
      nestedLists++;
      return;
    }
    if (isRecord(value)) {
      for (const key of Object.keys(value)) inspect(value[key], [...parts, key], depth + 1);
      return;
    }
    const id = pointer(parts);
    if (!fields.has(id)) {
      if (fields.size >= DATA_LIMITS.fields) {
        truncated = true;
        return;
      }
      fields.set(id, {
        id,
        parts,
        numbers: 0,
        numericStrings: 0,
        dates: 0,
        present: 0,
        sample: [],
      });
    }
    const field = fields.get(id);
    if (missing(value)) return;
    field.present++;
    if (numericValue(value) !== null) field.numbers++;
    else if (typeof value === 'string' && numericValue(value, true) !== null)
      field.numericStrings++;
    if (dateValue(value)) field.dates++;
    if (field.sample.length < 3 && !field.sample.includes(String(value)))
      field.sample.push(String(value).slice(0, 100));
  }
  collection.rows.forEach((row) => inspect(row));
  return { fields: [...fields.values()], nestedLists, truncated };
}
