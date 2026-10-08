import { readPDF, readWord } from './document-reader.js';
import { isCaseReport } from '../../domain/datasets/case-report.js';
import { readHTML } from './html-reader.js';
import { parseDataset } from '../../domain/datasets/parse.js';
import { createCard } from '../../domain/report.js';
import { parseMetricCSV } from '../../domain/csv.js';
import { splitNotes } from '../../domain/materials.js';
import { parseBackup } from '../../data/report-repository.js';
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export async function fingerprint(data) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function noteCards(text, name, split) {
  const parts = splitNotes(text, split);
  if (parts.length > 100) throw Error('Use at most 100 paragraphs per source.');
  return parts.map((original) => {
    // Only explicit user labels affect organization; no semantic claims are inferred.
    const label = original.match(
      /^(?:#+\s*)?(Progress|Needs a decision|Needs discussion|Next steps):\s*/i,
    );
    const section = label
      ? {
          progress: 'progress',
          'needs a decision': 'decision',
          'needs discussion': 'discussion',
          'next steps': 'next',
        }[label[1].toLowerCase()]
      : 'progress';
    const body = label ? original.slice(label[0].length).trim() || original : original;
    const first = body
      .split(/\n|[.!?](?=\s|$)/)[0]
      .replace(/^#+\s*/, '')
      .trim();
    const title = first.length <= 76 ? first : `${first.slice(0, 72).replace(/\s+\S*$/, '')}…`;
    const remaining =
      body.startsWith(first) && first.length <= 76
        ? body.slice(first.length).replace(/^[.!?\s]+/, '')
        : body;
    return createCard(section === 'decision' ? 'decision' : 'update', {
      section,
      title: title || name,
      body: remaining,
      source: `${name}\n${original}`,
    });
  });
}
export async function readMaterial(file, split) {
  if (file.size > MAX_FILE_BYTES) throw Error('File exceeds 2 MB.');
  const hash = await fingerprint(await file.arrayBuffer());
  if (/\.(pdf|docx)$/i.test(file.name)) {
    const result = /\.pdf$/i.test(file.name) ? await readPDF(file) : await readWord(file);
    return {
      name: file.name,
      fingerprint: hash,
      ...result,
      document: true,
      original: result.cards.map((card) => card.source).join('\n\n'),
      detail: result.notices.join(' '),
    };
  }
  if (/\.doc$/i.test(file.name))
    throw Error('Older .doc files are not supported. Save the document as .docx and upload again.');
  if (/\.(json|jsonl|ndjson)$/i.test(file.name)) {
    const original = await file.text();
    if (/\.json$/i.test(file.name)) {
      let root;
      try {
        root = JSON.parse(original.replace(/^\uFEFF/, ''));
      } catch {
        /* Dataset parser supplies the error. */
      }
      if (
        root &&
        (root.format === 'brief-library' ||
          (Array.isArray(root.cards) && Array.isArray(root.people) && Array.isArray(root.sources)))
      ) {
        return {
          name: file.name,
          fingerprint: hash,
          reportBackup: parseBackup(JSON.stringify(root)),
        };
      }
    }
    return {
      name: file.name,
      fingerprint: hash,
      original,
      dataset: (() => {
        const parsed = parseDataset(original, file.name);
        if (/\.json$/i.test(file.name)) {
          const root = JSON.parse(original.replace(/^\uFEFF/, ''));
          if (isCaseReport(root)) parsed.caseReport = root;
        }
        return parsed;
      })(),
    };
  }
  if (/\.html?$/i.test(file.name)) {
    const original = await file.text();
    return { name: file.name, fingerprint: hash, original, cards: readHTML(original, file.name) };
  }
  let cards;
  if (/\.csv$/i.test(file.name)) {
    cards = parseMetricCSV(await file.text()).map((row) =>
      createCard('metric', {
        title: row.title,
        value: row.value,
        target: row.target,
        source: `${file.name} · row ${row.row} · value: ${row.value}, target: ${row.target}`,
      }),
    );
  } else if (/\.(txt|md)$/i.test(file.name)) {
    const text = (await file.text()).trim();
    if (!text) throw Error('The text file is empty.');
    cards = noteCards(text, file.name, split);
  } else if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('Could not read image.'));
      reader.readAsDataURL(file);
    });
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(Error('Invalid image.'));
      image.src = data;
    });
    if (image.naturalWidth * image.naturalHeight > 20_000_000)
      throw Error('Use an image below 20 megapixels.');
    cards = [
      createCard('image', {
        title: file.name.replace(/\.[^.]+$/, ''),
        image: data,
        alt: '',
        source: file.name,
      }),
    ];
  } else throw Error('Use PDF, DOCX, HTML, JSON, JSONL, TXT, Markdown, CSV, PNG, JPG or WebP.');
  return { name: file.name, fingerprint: hash, cards };
}
