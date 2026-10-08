import { visualHTML } from './visuals/render.js';
import { isVisual, safeLink } from './visuals/contract.js';
import { isImageData, percent, reportSections } from './report.js';
import { reportBodyHTML } from './report-copy.js';
import { retrospectiveFragment } from './report-template.js';
export const escapeHTML = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
const ownerName = (report, card) =>
  report.people.find((person) => person.id === card.owner)?.name || 'Unassigned';
const normalized = (text) =>
  String(text || '')
    .trim()
    .replace(/[.!?]+$/, '');
// Suppress duplicate display copy, preserving the original card and source data.
export const displayBody = (card) =>
  normalized(card.title) === normalized(card.body) ? '' : card.body;
export function cardText(report, card) {
  return [
    card.title,
    displayBody(card),
    isVisual(card.visual)
      ? [
          card.visual.caption,
          card.visual.columns.join(' | '),
          ...card.visual.rows.map((row) => row.join(' | ')),
        ].join('\n')
      : '',
    safeLink(card.link) ? `Related report: ${card.link}` : '',
    card.type === 'metric'
      ? `${card.value} / ${card.target} (${percent(card.value, card.target) ?? '—'}% of target)`
      : '',
    card.owner ? `Owner: ${ownerName(report, card)}` : '',
    card.due ? `Due: ${card.due}` : '',
    card.type === 'image'
      ? `Image description: ${card.alt?.trim() || 'Not supplied'}\n[Image available in HTML export or downloaded asset]`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
export function reportText(report, cards = report.cards) {
  return [
    report.title || 'Weekly update',
    report.period,
    '',
    ...reportSections(cards).map(
      (section) =>
        `${section.title}\n${section.cards.map((card) => cardText(report, card)).join('\n\n')}`,
    ),
  ]
    .filter((item) => item !== undefined)
    .join('\n\n');
}
/** Shared by the editor preview and the exported email: inline styles survive rich copying. */
export function cardHTML(report, card, headingLevel = 2) {
  const e = escapeHTML,
    heading = headingLevel === 3 ? 'h3' : 'h2';
  return `<section class="email-card" style="padding:24px 0;margin:0;background:#ffffff;border:0;border-bottom:1px solid #e8e8ed;border-radius:0;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;overflow-wrap:anywhere">
    <${heading} style="font-size:18px;font-weight:600;letter-spacing:-0.2px;line-height:1.45;margin:0 0 12px">${e(card.title)}</${heading}>
    ${card.type === 'metric' ? `<p style="font-size:40px;font-weight:600;letter-spacing:-1.3px;margin:8px 0 14px;color:#1d1d1f">${e(card.value)} <span style="font-size:13px;font-weight:400;letter-spacing:0;color:#64646b">/ ${e(card.target)} · ${percent(card.value, card.target) ?? '—'}% of target</span></p>` : ''}
    ${card.type === 'image' && isImageData(card.image) ? `<img style="display:block;max-width:100%;height:auto;margin:10px 0" src="${e(card.image)}" alt="${e(card.alt?.trim())}">` : ''}
    ${reportBodyHTML(displayBody(card), e)}
    ${card.visual ? visualHTML(card.visual, isImageData(card.chartImage) ? card.chartImage : '') : ''}
    ${safeLink(card.link) ? `<p style="font-size:13px"><a href="${e(card.link)}" target="_blank" rel="noopener noreferrer">Open related report / interactive chart</a></p>` : ''}
    ${card.owner || card.due ? `<p style="font-size:12px;color:#64646b;margin:6px 0">${card.owner ? `Owner: ${e(ownerName(report, card))}` : ''}${card.owner && card.due ? ' · ' : ''}${card.due ? `Due: ${e(card.due)}` : ''}</p>` : ''}
  </section>`;
}
export function reportFragment(report) {
  if (report.template === 'retrospective')
    return retrospectiveFragment(report, reportSections(report.cards), {
      escape: escapeHTML,
      cardHTML,
      ownerName,
    });
  return `<div class="email-report" style="max-width:680px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1d1d1f;background:#ffffff;padding:24px"><h1 style="font-size:34px;font-weight:650;letter-spacing:-1px;line-height:1.25;margin:0 0 12px">${escapeHTML(report.title || 'Weekly update')}</h1>${report.period ? `<p style="font-size:13px;color:#64646b;margin:0 0 28px">${escapeHTML(report.period)}</p>` : ''}${reportSections(
    report.cards,
  )
    .map(
      (section) =>
        `<section style="margin-top:36px"><h2 style="font-size:22px;font-weight:600;letter-spacing:-0.5px;color:#1d1d1f;padding-bottom:10px;border-bottom:1px solid #d2d2d7;margin:0">${section.title}</h2>${section.cards.map((card) => cardHTML(report, card, 3)).join('')}</section>`,
    )
    .join('')}</div>`;
}
export function htmlDocument(title, fragment) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px 16px; background: #f5f5f7; color: #1d1d1f; font-family: Arial, sans-serif; }
    .export-page { width: 100%; max-width: 728px; margin: 0 auto; padding: 24px; background: #fff; border: 1px solid #dedee3; border-radius: 18px; overflow-wrap: anywhere; }
    .export-page > .email-report { max-width: none !important; padding: 0 !important; }
    @media (max-width: 480px) { body { padding: 16px 8px; } .export-page { padding: 18px; } }
    @media print { .retrospective-short { flex-basis: calc(50% - 14px) !important; } .retrospective-short, .retrospective-wide { break-inside: avoid; } .retrospective table { min-width: 0 !important; } body { padding: 0; background: #fff; } .export-page { border: 0; max-width: none; padding: 0; } }
  </style></head><body><main class="export-page" aria-label="${escapeHTML(title || 'Project update')}">${fragment}</main></body></html>`;
}
export const reportHTML = (report) => {
  const html = htmlDocument(report.title, reportFragment(report));
  return report.template === 'retrospective'
    ? html.replace('max-width: 728px', 'max-width: 1040px')
    : html;
};
