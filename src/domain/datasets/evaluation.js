import { DATA_LIMITS, isRecord } from './parse.js';

/** Separate candidates from GT; retain input-order x-y-z coordinates. */
export function evaluationCollection(collection) {
  if (!collection.rows.some((row) => row.type === 'compress' && Array.isArray(row.dialog)))
    return null;
  if (!collection.rows.every((row) => row.type === 'compress' && Array.isArray(row.dialog)))
    throw Error('Mixed compress and ordinary records. Separate them before evaluation analysis.');
  const rows = [],
    positions = [];
  let masked = 0;
  collection.rows.forEach((record, index) => {
    record.dialog.forEach((turn, position) => {
      if (turn?.role !== 'assistant') return;
      if (turn.loss === false) {
        masked++;
        return;
      }
      if (!Number.isInteger(turn.turn_index) || turn.turn_index !== position)
        throw Error(
          `Record ${index + 1}: assistant turn_index must match its zero-based dialog position.`,
        );
      if (turn.evaluate !== undefined && !isRecord(turn.evaluate))
        throw Error(`Record ${index + 1}: evaluate must be an object.`);
      Object.entries(turn.evaluate || {}).forEach(([model, candidate], slot) => {
        if (!isRecord(candidate))
          throw Error(`Record ${index + 1}: candidate ${model} must be an object.`);
        rows.push({
          model,
          pair_key: `${index + 1}-${turn.turn_index}`,
          record_id: record.id ?? '',
          turn_index: turn.turn_index,
          candidate,
        });
        positions.push(
          `${index + 1}-${turn.turn_index}-${slot + 1} (${collection.positions[index]}; model ${model})`,
        );
        if (rows.length > DATA_LIMITS.rows)
          throw Error('Use at most 10,000 evaluation candidates.');
      });
    });
  });
  if (!rows.length)
    throw Error(
      'No eligible assistant evaluation candidates. Masked turns (loss=false) and GT are excluded.',
    );
  return {
    id: collection.id + ':candidates',
    label: collection.label + ' · evaluation candidates',
    rows,
    positions,
    kind: 'evaluation',
    note: `${collection.rows.length} records; ${masked} masked assistant turns excluded before reading evaluations. One row = one candidate on one eligible assistant turn. GT is excluded. Coordinates: record ordinal–turn_index–candidate slot.`,
  };
}
