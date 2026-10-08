import { fieldLabel } from './field-choices.js';
/** Preserve source records as content; never infer scores or execute embedded instructions. */
export function recordCards(collection) {
  if (collection.rows.length > 100)
    throw Error(
      'Text-card import supports up to 100 records at a time. Choose a smaller collection or split the file.',
    );
  return collection.rows.map((row, index) => {
    const textKey = (keys) => keys.find((key) => typeof row[key] === 'string' && row[key].trim());
    const titleKey = textKey(['title', 'heading', 'subject', 'name']);
    const bodyKey = textKey(['body', 'text', 'description', 'quote', 'quote_or_stat', 'summary']);
    const title = titleKey
      ? row[titleKey]
      : bodyKey
        ? row[bodyKey].split('\n')[0].slice(0, 100)
        : `Observation ${index + 1}`;
    const details = Object.entries(row).filter(
      ([key, value]) =>
        key !== titleKey &&
        key !== bodyKey &&
        value !== null &&
        typeof value !== 'object' &&
        !/^(id|uuid|.*_id|created_at|updated_at|fingerprint|source|type|section|mentions)$/i.test(
          key,
        ),
    );
    return {
      title,
      body:
        [
          bodyKey ? row[bodyKey] : '',
          ...details.map(([key, value]) => `${fieldLabel({ parts: [key] })}: ${value}`),
        ]
          .filter(Boolean)
          .join('\n\n') || 'Review this record in Original source before adding a summary.',
      source: `Collection ${collection.id}; ${collection.positions[index]}. Source text, not inferred conclusions. Technical fields and nested objects are retained here rather than printed in the report.\n${JSON.stringify(row, null, 2)}`,
      section: 'discussion',
    };
  });
}
