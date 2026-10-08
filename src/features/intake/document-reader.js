import { createCard } from '../../domain/report.js';
const MAX_TEXT = 100000;
let zipLoading;
async function zipLibrary() {
  if (window.JSZip) return window.JSZip;
  if (!zipLoading)
    zipLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('../../../vendor/jszip.min.js', import.meta.url).href;
      script.onload = () => resolve(window.JSZip);
      script.onerror = () => {
        script.remove();
        zipLoading = null;
        reject(Error('Word reader could not load. Retry the import.'));
      };
      document.head.append(script);
    });
  return zipLoading;
}
function card(name, title, body, location) {
  return createCard('update', {
    title,
    body,
    section: 'progress',
    source: `${name} · ${location}\n${body}`,
  });
}
export async function readPDF(file) {
  const pdfjs = await import('../../../vendor/pdfjs/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    '../../../vendor/pdfjs/pdf.worker.mjs',
    import.meta.url,
  ).href;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: false,
    disableFontFace: true,
    cMapUrl: new URL('../../../vendor/pdfjs/cmaps/', import.meta.url).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('../../../vendor/pdfjs/standard_fonts/', import.meta.url).href,
  });
  const timer = setTimeout(() => task.destroy(), 30000);
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 60)
      throw Error('Use a PDF with at most 60 pages. Split this document before importing.');
    const cards = [],
      empty = [];
    let total = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let text = '',
        lastY;
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        if (lastY !== undefined && Math.abs(item.transform[5] - lastY) > 3 && !text.endsWith('\n'))
          text += '\n';
        text += item.str + (item.hasEOL ? '\n' : ' ');
        lastY = item.transform[5];
        if (text.length + total > MAX_TEXT)
          throw Error('Document text exceeds 100,000 characters. Split it before importing.');
      }
      text = text.trim();
      total += text.length;
      if (text) cards.push(card(file.name, `${file.name} · page ${n}`, text, `page ${n}`));
      else empty.push(n);
      page.cleanup();
    }
    if (!cards.length)
      throw Error(
        'No selectable text found. This PDF may be scanned or contain images only. Run OCR first, or upload screenshots as image cards.',
      );
    return {
      cards,
      notices: [
        `Extracted text from ${cards.length} of ${pdf.numPages} pages. PDF images and charts are not extracted; tables and multiple columns may need rearranging.`,
        ...(empty.length
          ? [
              `No text was extracted from pages ${empty.join(', ')}. They may need OCR and will not become cards.`,
            ]
          : []),
      ],
    };
  } catch (error) {
    if (error.name === 'PasswordException')
      throw Error('This PDF is password-protected. Upload an unlocked copy.');
    throw error;
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}
// Inspect ZIP central-directory sizes before decompressing any Word XML.
export function checkWordArchive(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  if (end < 0) throw Error('Invalid Word file. Upload a .docx document.');
  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true),
    total = 0;
  if (count > 2000 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    throw Error('This Word archive is too complex or unsupported.');
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || view.getUint32(pos, true) !== 0x02014b50)
      throw Error('Invalid Word archive directory.');
    total += view.getUint32(pos + 24, true);
    if (total > 16 * 1024 * 1024)
      throw Error(
        'Expanded Word document exceeds 16 MB. Remove large embedded assets or split the document.',
      );
    pos +=
      46 +
      view.getUint16(pos + 28, true) +
      view.getUint16(pos + 30, true) +
      view.getUint16(pos + 32, true);
  }
}
export async function readWord(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  checkWordArchive(bytes);
  const ZIP = await zipLibrary(),
    zip = await ZIP.loadAsync(bytes);
  const entry = zip.file('word/document.xml');
  if (!entry)
    throw Error(
      'This file is not a supported .docx document. Older .doc files must be saved as .docx first.',
    );
  const xml = await entry.async('string');
  if (xml.length > 4 * 1024 * 1024)
    throw Error('Word document XML is too large. Split the document.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw Error('Unsupported XML declarations in Word document.');
  const root = new DOMParser().parseFromString(xml, 'application/xml');
  if (root.querySelector('parsererror')) throw Error('The Word document contains invalid XML.');
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const removed = [...root.getElementsByTagNameNS(ns, 'del')];
  removed.forEach((node) => node.remove());
  const body = root.getElementsByTagNameNS(ns, 'body')[0];
  if (!body) throw Error('The Word document has no readable body.');
  const notices = [
    'Extracted document-body text and tables. Images, headers, footers, comments and page layout are not imported. Review table rows and section placement.',
  ];
  if (removed.length) notices.push('Tracked deletions were excluded; inserted text is included.');
  const cards = [];
  let total = 0,
    index = 0;
  const paragraphText = (node) =>
    [...node.getElementsByTagNameNS(ns, 't')].map((t) => t.textContent).join('');
  for (const paragraph of body.getElementsByTagNameNS(ns, 'p')) {
    // Tabs and line breaks are visible content, not field instructions or external links.
    for (const tab of [...paragraph.getElementsByTagNameNS(ns, 'tab')]) tab.textContent = '\t';
    const text = [...paragraph.querySelectorAll('*')]
      .filter((n) => n.namespaceURI === ns && ['t', 'tab', 'br', 'cr'].includes(n.localName))
      .map((n) => (['br', 'cr'].includes(n.localName) ? '\n' : n.textContent))
      .join('')
      .trim();
    if (!text) continue;
    total += text.length;
    if (total > MAX_TEXT)
      throw Error('Document text exceeds 100,000 characters. Split it before importing.');
    const style =
      paragraph.getElementsByTagNameNS(ns, 'pStyle')[0]?.getAttributeNS(ns, 'val') || '';
    const inTable = !!paragraph.closest('tbl');
    // Keep paragraph boundaries and explicit headings; group ordinary paragraphs for faster review.
    if (
      !cards.length ||
      /heading|title/i.test(style) ||
      cards.at(-1).body.length + text.length > 2500
    ) {
      if (cards.length >= 100)
        throw Error('Document needs more than 100 cards. Split it before importing.');
      cards.push(
        card(
          file.name,
          /heading|title/i.test(style)
            ? paragraphText(paragraph)
            : `${file.name} · extract ${cards.length + 1}`,
          text,
          `paragraph ${++index}`,
        ),
      );
    } else {
      index++;
      const last = cards.at(-1);
      last.body += '\n\n' + text;
      last.source += `\nParagraph ${index}${inTable ? ' (table content)' : ''}: ${text}`;
    }
  }
  if (!cards.length)
    throw Error(
      'No readable text found in this Word document. Images need separate upload or OCR.',
    );
  return { cards, notices };
}
