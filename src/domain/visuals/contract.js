const text = (v) => typeof v === 'string' && v.length <= 2000;
export function isVisual(v) {
  if (
    !v ||
    !['bar', 'line', 'transition', 'table'].includes(v.kind) ||
    !text(v.title) ||
    !text(v.caption)
  )
    return false;
  if (
    !Array.isArray(v.columns) ||
    !v.columns.length ||
    v.columns.length > 12 ||
    !v.columns.every(text)
  )
    return false;
  if (
    !Array.isArray(v.rows) ||
    !v.rows.length ||
    v.rows.length > 200 ||
    !v.rows.every(
      (row) =>
        Array.isArray(row) &&
        row.length === v.columns.length &&
        row.every((cell) => text(cell) || (typeof cell === 'number' && Number.isFinite(cell))),
    )
  )
    return false;
  if (
    ['bar', 'line'].includes(v.kind) &&
    (v.rows.length > 40 || !v.rows.every((row) => typeof row[1] === 'number'))
  )
    return false;
  if (
    v.kind === 'transition' &&
    (v.rows.length !== 4 ||
      !v.rows.every((row) => Number.isSafeInteger(row[1]) && row[1] >= 0) ||
      !text(v.baseline) ||
      !text(v.candidate) ||
      v.rows.reduce((n, row) => n + row[1], 0) <= 0)
  )
    return false;
  return true;
}
export const safeLink = (value) => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
};
