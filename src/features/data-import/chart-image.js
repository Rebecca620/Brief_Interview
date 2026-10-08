import { chartSVG } from '../../domain/visuals/render.js';
/** Rasterize only our generated chart, never imported HTML or SVG. */
export async function chartImage(visual) {
  const svg = chartSVG(visual);
  if (!svg) return '';
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(Error('Could not render chart.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1560;
    canvas.height = Math.round((image.height / image.width) * 1560);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
