import { createCard } from '../../domain/report.js';
import { isVisual, safeLink } from '../../domain/visuals/contract.js';

/** Read inert HTML into our own DTOs. Never mount, execute or embed imported markup. */
export function readHTML(text, name) {
  const template = document.createElement('template');
  template.innerHTML = text;
  const root = template.content;
  root
    .querySelectorAll('script,style,iframe,object,embed,form,svg,math,template,link,meta,base')
    .forEach((node) => node.remove());
  const cards = [];
  for (const table of root.querySelectorAll('table')) {
    if (table.parentElement?.closest('table')) continue;
    if (table.querySelector('[rowspan]:not([rowspan="1"]),[colspan]:not([colspan="1"])'))
      throw Error('HTML tables with merged cells are not supported. Export a flat table first.');
    const rows = [...table.querySelectorAll('tr')].map((tr) =>
      [...tr.children]
        .filter((cell) => ['TH', 'TD'].includes(cell.tagName))
        .map((cell) => cell.textContent.trim()),
    );
    if (rows.length < 2) continue;
    const title =
      table.querySelector('caption')?.textContent.trim() || `${name} · table ${cards.length + 1}`;
    const visual = {
      kind: 'table',
      title,
      columns: rows[0],
      rows: rows.slice(1),
      caption: 'Imported table. First row used as column headings; verify labels and units.',
    };
    if (!isVisual(visual))
      throw Error(
        'Use rectangular HTML tables with at most 200 data rows, 12 columns and 2,000 characters per cell.',
      );
    cards.push(
      createCard('update', {
        title,
        body: '',
        visual,
        source: `${name} · table ${cards.length + 1}`,
      }),
    );
  }
  let heading = name;
  for (const node of root.querySelectorAll('h1,h2,h3,p,li')) {
    if (node.closest('table')) continue;
    const body = node.textContent.trim();
    if (!body) continue;
    if (/^H[123]$/.test(node.tagName)) {
      heading = body;
      continue;
    }
    // A list item's child paragraph is counted only once.
    if (node.tagName === 'P' && node.closest('li')) continue;
    const link = [...node.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href'))
      .find(safeLink);
    cards.push(
      createCard('update', {
        title: heading === name ? body.split(/[.!?\n]/)[0].slice(0, 100) : heading.slice(0, 180),
        body,
        ...(link ? { link } : {}),
        source: `${name}\n${body}`,
      }),
    );
    if (cards.length > 100) throw Error('Use at most 100 text blocks/tables per HTML file.');
  }
  if (!cards.length)
    throw Error(
      'No readable text or tables found. Export interactive graphs as PNG/WebP, or add their hosted link to a card.',
    );
  return cards;
}
