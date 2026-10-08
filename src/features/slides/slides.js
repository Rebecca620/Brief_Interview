import { $, modal, download } from '../../shared/ui.js';
import { escapeHTML as e, displayBody, cardText } from '../../domain/export.js';
import { cardSection, REPORT_SECTIONS, isImageData } from '../../domain/report.js';
import { chartImage } from '../data-import/chart-image.js';
import { isVisual } from '../../domain/visuals/contract.js';
let loading;
function loadExporter() {
  if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('../../../vendor/pptxgen.bundle.js', import.meta.url).href;
      script.onload = () => resolve(window.PptxGenJS);
      script.onerror = () => {
        script.remove();
        loading = null;
        reject(Error('PowerPoint exporter could not load. Please retry.'));
      };
      document.head.append(script);
    });
  return loading;
}
export function textChunks(text, limit = 560) {
  const chunks = [];
  let rest = String(text);
  while (rest.length > limit) {
    let end = rest.lastIndexOf(' ', limit);
    if (end < limit / 2) end = limit;
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
async function png(data) {
  if (data.startsWith('data:image/png;')) return data;
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(Error('Image could not be read for slides.'));
    image.src = data;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas.toDataURL('image/png');
}
async function contain(data, x, y, w, h) {
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(Error('Could not measure slide image.'));
    image.src = data;
  });
  const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight),
    width = image.naturalWidth * scale,
    height = image.naturalHeight * scale;
  return { x: x + (w - width) / 2, y: y + (h - height) / 2, w: width, h: height };
}
export async function buildSlides(report, cards) {
  const Pptx = await loadExporter(),
    deck = new Pptx();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'Brief';
  deck.subject = 'Project update';
  deck.title = report.title;
  deck.lang = 'en-US';
  deck.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial', lang: 'en-US' };
  let number = 0;
  function slideFor(card, suffix = '') {
    const slide = deck.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(`${REPORT_SECTIONS[cardSection(card)]} · ${report.title}`, {
      x: 0.55,
      y: 0.23,
      w: 12.2,
      h: 0.3,
      fontFace: 'Arial',
      fontSize: 11,
      color: '53675D',
      margin: 0,
    });
    slide.addText(card.title + suffix, {
      x: 0.55,
      y: 0.7,
      w: 12.2,
      h: 0.9,
      fontSize: 27,
      bold: true,
      color: '22352E',
      margin: 0,
      breakLine: false,
      fit: 'shrink',
    });
    slide.addText(`${report.period || 'Project update'} · ${++number}`, {
      x: 0.55,
      y: 7.13,
      w: 12.2,
      h: 0.2,
      fontSize: 10,
      color: '53675D',
      margin: 0,
    });
    slide.addNotes(
      cardText(report, card) + '\n\nSource and method:\n' + (card.source || 'Manually created'),
    );
    return slide;
  }
  for (const card of cards) {
    const visual = isVisual(card.visual) ? card.visual : null;
    const data =
      card.type === 'image' && isImageData(card.image)
        ? await png(card.image)
        : visual && visual.kind !== 'table'
          ? card.chartImage || (await chartImage(visual))
          : '';
    const body =
      displayBody(card) +
      (card.type === 'metric' ? `\n${card.value} / ${card.target} of target` : '') +
      (card.owner ? `\nOwner: ${report.people.find((p) => p.id === card.owner)?.name || ''}` : '') +
      (card.due ? `\nDue: ${card.due}` : '') +
      (card.link ? `\nRelated report: ${card.link}` : '');
    const combine = Boolean(data && body.trim().length <= 220);
    if (data) {
      const slide = slideFor(card);
      slide.addImage({
        ...(await contain(data, 0.65, combine ? 2.2 : 1.65, 12.0, combine ? 4.1 : 4.75)),
        data,
        altText: visual?.title || card.alt || card.title,
      });
      if (combine && body.trim())
        slide.addText(body.trim(), {
          x: 0.65,
          y: 1.55,
          w: 12,
          h: 0.6,
          fontSize: 17,
          color: '22352E',
          margin: 0,
          fit: 'shrink',
        });
      if (visual?.caption)
        slide.addText(visual.caption, {
          x: 0.65,
          y: 6.45,
          w: 12,
          h: 0.5,
          fontSize: 11,
          color: '53675D',
          margin: 0,
          fit: 'shrink',
        });
    }
    if ((!combine && body.trim()) || (!visual && !data))
      for (const [i, chunk] of textChunks(body.trim() || card.title).entries()) {
        const slide = slideFor(card, i ? ' · continued' : '');
        slide.addText(chunk, {
          x: 0.7,
          y: 1.85,
          w: 11.9,
          h: 4.8,
          fontSize: 23,
          color: '22352E',
          margin: 0,
          breakLine: false,
          fit: 'shrink',
          paraSpaceAfterPt: 12,
        });
      }
    if (visual) {
      // Tables remain native editable PowerPoint tables; chart PNGs are accompanied by exact data.
      if (visual.columns.some((label) => label.length > 80))
        throw Error(
          'A table heading exceeds 80 characters. Shorten that heading before exporting slides.',
        );
      const cellLimit = Math.max(16, Math.floor(110 / visual.columns.length));
      const tableRows = visual.rows.flatMap((row) => {
        const cells = row.map((cell) => textChunks(String(cell), cellLimit));
        return Array.from({ length: Math.max(...cells.map((c) => c.length)) }, (_, i) =>
          cells.map((c) => c[i] || ''),
        );
      });
      for (let start = 0; start < tableRows.length; start += 8) {
        const slide = slideFor(card, ' · data');
        slide.addTable(
          [
            visual.columns.map((text) => ({ text, options: { bold: true, fill: 'E9F0EC' } })),
            ...tableRows.slice(start, start + 8),
          ],
          {
            x: 0.65,
            y: 1.8,
            w: 12,
            h: 4.65,
            fontSize: 14,
            color: '22352E',
            border: { type: 'solid', color: 'D0D9D1', pt: 1 },
            margin: 8,
            autoPage: false,
            autoPageRepeatHeader: true,
            autoPageSlideStartY: 1.8,
          },
        );
        slide.addText(visual.caption, {
          x: 0.65,
          y: 6.55,
          w: 12,
          h: 0.4,
          fontSize: 10,
          color: '53675D',
          margin: 0,
          fit: 'shrink',
        });
      }
    }
  }
  return deck.write({ outputType: 'blob', compression: true });
}
export function openSlides(report, cards = report.cards) {
  modal(
    'Put cards into slides',
    `<p>Select the cards to include. Text and tables stay editable in PowerPoint; graphs are images with an editable data table on a following slide. Long content continues onto additional slides.</p><div id="slide-selection">${cards.map((card, i) => `<label class="split-option"><input type="checkbox" data-slide="${i}" checked/>${e(card.title)}</label>`).join('')}</div><p class="field-help">Content preview · PowerPoint may continue long cards onto additional slides.</p><div id="slide-preview" class="slide-preview"></div><div class="modal-actions"><span id="slide-status" role="status"></span><button class="btn primary" id="slides-download">Save PowerPoint (.pptx)</button></div>`,
  );
  const selection = () =>
    [...document.querySelectorAll('[data-slide]:checked')].map(
      (input) => cards[Number(input.dataset.slide)],
    );
  const preview = () => {
    const selected = selection();
    $('#slide-status').textContent =
      `${selected.length} ${selected.length === 1 ? 'card' : 'cards'} selected`;
    $('#slides-download').disabled = !selected.length;
    $('#slide-preview').innerHTML = selected
      .map(
        (card, index) =>
          `<article class="slide-mini"><small>${e(REPORT_SECTIONS[cardSection(card)])} · ${index + 1}</small><h3>${e(card.title)}</h3><p>${e(displayBody(card)).slice(0, 420)}</p>${card.type === 'metric' ? `<strong>${e(card.value)} / ${e(card.target)}</strong>` : ''}${isImageData(card.image) ? `<img src="${card.image}" alt="${e(card.alt || card.title)}"/>` : ''}${isImageData(card.chartImage) ? `<img src="${card.chartImage}" alt="${e(card.title)}"/>` : ''}${card.visual?.kind === 'table' ? `<p>${card.visual.rows.length} rows · ${e(card.visual.columns.join(' · '))}</p>` : ''}</article>`,
      )
      .join('');
  };
  $('#slide-selection').onchange = preview;
  preview();
  $('#slides-download').onclick = async () => {
    const button = $('#slides-download'),
      status = $('#slide-status');
    const selected = [...document.querySelectorAll('[data-slide]:checked')].map(
      (input) => cards[Number(input.dataset.slide)],
    );
    if (!selected.length) {
      status.textContent = 'Choose at least one card.';
      return;
    }
    button.disabled = true;
    status.textContent = 'Building slides…';
    try {
      const blob = await buildSlides(report, selected);
      download(
        'brief-slides.pptx',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        blob,
      );
      status.textContent =
        'PowerPoint prepared. Open it in PowerPoint or import it into your slide tool.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}
