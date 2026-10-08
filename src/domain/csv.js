import { validateCard } from './report.js';

/** Small strict parser for the documented title,value,target contract. */
export function parseMetricCSV(text) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false,
    closedQuote = false;
  const finishField = () => {
    row.push(field);
    field = '';
    closedQuote = false;
  };
  const finishRow = () => {
    finishField();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
  };
  text = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
        closedQuote = true;
      } else field += character;
      continue;
    }
    if (character === ',') finishField();
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      finishRow();
    } else if (character === '"') {
      if (field || closedQuote) throw Error('CSV quotes must surround the entire field.');
      quoted = true;
    } else {
      if (closedQuote) throw Error('Unexpected text after a closing CSV quote.');
      field += character;
    }
  }
  if (quoted) throw Error('CSV contains an unclosed quote.');
  finishRow();
  const headers = rows.shift()?.map((value) => value.trim().toLowerCase()) || [];
  const indices = ['title', 'value', 'target'].map((value) => headers.indexOf(value));
  if (indices.some((value) => value < 0)) throw Error('CSV needs title, value and target columns.');
  if (new Set(headers).size !== headers.length) throw Error('CSV column names must be unique.');
  if (!rows.length) throw Error('CSV has no data rows.');
  if (rows.length > 100) throw Error('Please import at most 100 rows.');
  return rows.map((record, index) => {
    if (record.length !== headers.length)
      throw Error(`Row ${index + 2}: column count does not match the header.`);
    const [title, value, target] = indices.map((column) => record[column]);
    const error = validateCard({ type: 'metric', title, value, target });
    if (error) throw Error(`Row ${index + 2}: ${error}`);
    return { title, value: Number(value), target: Number(target), row: index + 2 };
  });
}
