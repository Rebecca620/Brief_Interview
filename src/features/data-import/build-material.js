import { fingerprint } from '../intake/material-reader.js';
import { createCard } from '../../domain/report.js';
import { chartImage } from './chart-image.js';
export async function buildMaterial(material, collection, config, findings, selected) {
  const hash = await fingerprint(
    new TextEncoder().encode(
      JSON.stringify({ file: material.fingerprint, collection, config, selected, version: 3 }),
    ),
  );
  const cards = await Promise.all(
    selected.map(async (i) =>
      createCard('update', {
        ...findings[i],
        chartImage: findings[i].visual ? await chartImage(findings[i].visual) : '',
        source: `${material.name} · SHA-256 ${material.fingerprint}\n${findings[i].source}`,
      }),
    ),
  );
  return {
    name: material.name,
    fingerprint: hash,
    original: material.original,
    detail: `JSON analysis v3 · SHA-256 ${material.fingerprint} · ${JSON.stringify({ collection, ...config })}`,
    cards,
  };
}
