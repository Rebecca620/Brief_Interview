/** Additions never mutate existing report content. */
export function appendMaterial(report, materials) {
  const known = new Set(report.sources.map((source) => source.fingerprint).filter(Boolean));
  const accepted = [];
  for (const material of materials) {
    if (known.has(material.fingerprint)) continue;
    known.add(material.fingerprint);
    accepted.push(material);
  }
  return {
    report: {
      ...report,
      cards: [...report.cards, ...accepted.flatMap((material) => material.cards)],
      sources: [
        ...report.sources,
        ...accepted.map((material) => ({
          name: material.name,
          detail: material.detail || `${material.cards.length} cards · imported`,
          ...(material.original !== undefined ? { original: material.original } : {}),
          fingerprint: material.fingerprint,
        })),
      ],
    },
    addedIds: accepted.flatMap((material) => material.cards.map((card) => card.id)),
    skipped: materials.length - accepted.length,
  };
}

/** Explicit paragraph splitting preserves wording and never invents project facts. */
export function splitNotes(text, split = false) {
  return split
    ? text
        .trim()
        .split(/\n\s*\n/)
        .filter((part) => part.trim())
    : [text.trim()];
}
