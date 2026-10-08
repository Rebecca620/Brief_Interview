import { cardText } from '../../domain/export.js';
import { isImageData, reportSections } from '../../domain/report.js';
const WIDTH = 760,
  HEIGHT = 1120,
  PAD = 36,
  SCALE = 2;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(Error('An image could not be rendered. Check the card image and try again.'));
    image.src = src;
  });
/** Paint only validated report content. No external images, HTML execution or uploads. */
export async function reportImages(report, cards) {
  if (cards.reduce((n, card) => n + cardText(report, card).length, 0) > 60000)
    throw Error('This report is too long for image sharing. Share fewer cards or use Save as PDF.');
  const pages = [];
  let canvas, context, y;
  function page() {
    if (pages.length >= 12)
      throw Error('This report needs more than 12 images. Share fewer cards or use Save as PDF.');
    canvas = document.createElement('canvas');
    canvas.width = WIDTH * SCALE;
    canvas.height = HEIGHT * SCALE;
    context = canvas.getContext('2d');
    context.scale(SCALE, SCALE);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, WIDTH, HEIGHT);
    y = PAD;
    pages.push(canvas);
    context.fillStyle = '#64646b';
    context.font = `13px ${FONT}`;
    context.fillText(`BRIEF · ${pages.length === 1 ? 'PROJECT UPDATE' : 'CONTINUED'}`, PAD, y + 13);
    y += 34;
  }
  function room(height) {
    if (y + height > HEIGHT - 50) page();
  }
  function text(value, size = 18, bold = false, color = '#1d1d1f') {
    const lineHeight = Math.ceil(size * 1.5);
    for (const paragraph of String(value).split('\n')) {
      context.font = `${bold ? '600 ' : ''}${size}px ${FONT}`;
      let line = '';
      // Grapheme segmentation preserves emoji and combining characters; word breaks are preferred.
      const segments = [
        ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(paragraph),
      ].map((s) => s.segment);
      while (segments.length) {
        const char = segments.shift();
        if (line && context.measureText(line + char).width > WIDTH - PAD * 2) {
          const space = line.lastIndexOf(' ');
          if (space > line.length / 2) {
            segments.unshift(...Array.from(line.slice(space + 1)), char);
            line = line.slice(0, space);
          } else segments.unshift(char);
          draw(line);
          line = '';
        } else line += char;
      }
      draw(line);
    }
    function draw(line) {
      room(lineHeight);
      context.font = `${bold ? '600 ' : ''}${size}px ${FONT}`;
      context.fillStyle = color;
      context.fillText(line, PAD, y + size);
      y += lineHeight;
    }
  }
  page();
  text(report.title || 'Project update', 28, true);
  if (report.period) text(report.period, 14, false, '#64646b');
  y += 18;
  for (const section of reportSections(cards)) {
    room(90);
    text(section.title, 15, true, '#0066cc');
    y += 10;
    for (const card of section.cards) {
      room(90);
      context.fillStyle = '#dedee3';
      context.fillRect(PAD, y, WIDTH - 2 * PAD, 1);
      y += 14;
      text(card.title, 21, true);
      // Include all text and exact values, but avoid duplicating the card title.
      const detail = cardText(report, card).slice(card.title.length).trim();
      if (detail) text(detail);
      for (const src of [card.type === 'image' ? card.image : '', card.chartImage]) {
        if (!isImageData(src)) continue;
        const image = await loadImage(src);
        const width = Math.min(WIDTH - PAD * 2, image.width);
        const height = Math.min(420, (width * image.height) / image.width);
        const drawnWidth = (height * image.width) / image.height;
        room(height + 20);
        y += 10;
        context.drawImage(image, (WIDTH - drawnWidth) / 2, y, drawnWidth, height);
        y += height + 10;
      }
      y += 22;
    }
  }
  const files = [];
  for (let i = 0; i < pages.length; i++) {
    const c = pages[i],
      ctx = c.getContext('2d');
    ctx.fillStyle = '#64646b';
    ctx.font = `12px ${FONT}`;
    const height = i === pages.length - 1 ? Math.min(HEIGHT, Math.max(180, y + 50)) : HEIGHT;
    ctx.fillText(`Brief · ${i + 1} / ${pages.length}`, PAD, height - 22);
    const cropped = document.createElement('canvas');
    cropped.width = c.width;
    cropped.height = height * SCALE;
    cropped.getContext('2d').drawImage(c, 0, 0);
    const blob = await new Promise((resolve) => cropped.toBlob(resolve, 'image/png'));
    cropped.width = 1;
    cropped.height = 1;
    if (!blob) throw Error('Image export is unavailable in this browser. Use HTML or PDF instead.');
    files.push(new File([blob], `brief-report-${i + 1}.png`, { type: 'image/png' }));
    c.width = 1;
    c.height = 1;
  }
  return files;
}
