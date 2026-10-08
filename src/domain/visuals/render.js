import { isVisual } from './contract.js';
// Independent escaping avoids a cycle with report/export.
const e = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const f = (n) => Number(n.toPrecision(5)).toLocaleString('en-US');
export function visualTable(v) {
  if (!isVisual(v)) return '';
  return `<div tabindex="0" role="region" aria-label="${e(v.title)} data table" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font:12px Arial,sans-serif;color:#22352e"><caption style="text-align:left;padding:8px 0;font-weight:bold">${e(v.title)} — exact values</caption><thead><tr>${v.columns.map((c) => `<th scope="col" style="text-align:left;border-bottom:2px solid #ccd5cf;padding:8px">${e(c)}</th>`).join('')}</tr></thead><tbody>${v.rows.map((row) => `<tr>${row.map((c) => `<td style="border-bottom:1px solid #e2e7e3;padding:8px">${e(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function chartSVG(v) {
  if (!isVisual(v) || v.kind === 'table') return '';
  const label = (x, y, t, size = 14, extra = '') =>
    `<text x="${x}" y="${y}" font-size="${size}" ${extra}>${e(t)}</text>`;
  let content = '',
    height = 360;
  if (v.kind === 'transition') {
    height = 430;
    const [ff, fp, pf, pp] = v.rows.map((r) => r[1]),
      n = ff + fp + pf + pp,
      k = 230 / n;
    const left = [80, 80 + (ff + fp) * k + 18],
      right = [80, 80 + (ff + pf) * k + 18];
    content += label(36, 25, 'BASELINE', 12) + label(744, 25, 'CANDIDATE', 12, 'text-anchor="end"');
    content +=
      label(36, 49, v.baseline.length > 48 ? v.baseline.slice(0, 45) + '…' : v.baseline, 13) +
      label(
        744,
        49,
        v.candidate.length > 48 ? v.candidate.slice(0, 45) + '…' : v.candidate,
        13,
        'text-anchor="end"',
      );
    const flows = [
      [ff, left[0], right[0], '#999999'],
      [fp, left[0] + ff * k, right[1], '#009E73'],
      [pf, left[1], right[0] + ff * k, '#D55E00'],
      [pp, left[1] + pf * k, right[1] + fp * k, '#0072B2'],
    ];
    flows.forEach(([count, y1, y2, color]) => {
      const h = count * k;
      if (count)
        content += `<path fill="${color}" fill-opacity="0.88" d="M170 ${y1} C330 ${y1} 450 ${y2} 610 ${y2} L610 ${y2 + h} C450 ${y2 + h} 330 ${y1 + h} 170 ${y1 + h} Z"><title>${count} paired cases</title></path>`;
    });
    [
      [160, left[0], ff + fp],
      [160, left[1], pf + pp],
      [610, right[0], ff + pf],
      [610, right[1], fp + pp],
    ].forEach(([x, y, c]) => {
      if (c) content += `<rect x="${x}" y="${y}" width="10" height="${c * k}" fill="#364152"/>`;
    });
    content +=
      label(150, left[0] + 12, `Fail ${ff + fp}`, 13, 'text-anchor="end"') +
      label(150, left[1] + 12, `Pass ${pf + pp}`, 13, 'text-anchor="end"') +
      label(630, right[0] + 12, `Fail ${ff + pf}`, 13) +
      label(630, right[1] + 12, `Pass ${fp + pp}`, 13);
    v.rows.forEach((row, i) => {
      const x = 36 + i * 188;
      content +=
        `<rect x="${x}" y="366" width="12" height="6" fill="${flows[i][3]}"/>` +
        label(x, 393, row[0], 13) +
        label(x, 416, `${row[1]} · ${f((row[1] / n) * 100)}%`, 12);
    });
  } else if (v.kind === 'bar') {
    height = Math.max(180, v.rows.length * 36 + 70);
    const vals = v.rows.map((r) => r[1]),
      min = Math.min(0, ...vals),
      max = Math.max(0, ...vals),
      span = max - min || 1,
      x = (value) => 210 + ((value - min) / span) * 455,
      zero = x(0);
    content += `<line x1="${zero}" y1="20" x2="${zero}" y2="${height - 32}" stroke="#6b776f"/>`;
    v.rows.forEach((row, i) => {
      const y = 28 + i * 36,
        end = x(row[1]);
      content +=
        label(198, y + 16, String(row[0]).slice(0, 25), 13, 'text-anchor="end"') +
        `<rect x="${Math.min(zero, end)}" y="${y}" width="${Math.abs(end - zero)}" height="23" fill="#0072B2"/>` +
        label(684, y + 17, f(row[1]), 13);
    });
    content += label(210, height - 8, `${v.columns[1]} · common scale, zero baseline`, 12);
  } else {
    const vals = v.rows.map((r) => r[1]),
      min = Math.min(0, ...vals),
      max = Math.max(0, ...vals),
      span = max - min || 1;
    const firstTime = Date.parse(v.rows[0][0]),
      lastTime = Date.parse(v.rows.at(-1)[0]);
    const x = (i) =>
        76 +
        (Number.isFinite(firstTime) && Number.isFinite(lastTime) && lastTime > firstTime
          ? (Date.parse(v.rows[i][0]) - firstTime) / (lastTime - firstTime)
          : i / Math.max(1, vals.length - 1)) *
          630,
      y = (value) => 285 - ((value - min) / span) * 220;
    content += `<path d="M76 60 V285 H706" fill="none" stroke="#66756c"/><polyline points="${vals.map((value, i) => `${x(i)},${y(value)}`).join(' ')}" fill="none" stroke="#0072B2" stroke-width="3"/>`;
    vals.forEach((value, i) => {
      content += `<circle cx="${x(i)}" cy="${y(value)}" r="4" fill="#0072B2"><title>${e(v.rows[i][0])}: ${value}</title></circle>`;
    });
    content +=
      label(65, 72, f(max), 12, 'text-anchor="end"') +
      label(65, 285, f(min), 12, 'text-anchor="end"') +
      label(76, 313, v.rows[0][0], 12) +
      label(706, 313, v.rows.at(-1)[0], 12, 'text-anchor="end"') +
      label(76, 344, `${v.columns[1]} · ${vals.length} daily observations`, 12);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 ${height}" width="780" height="${height}" role="img" aria-label="${e(v.title)}"><title>${e(v.title)}</title><rect width="780" height="${height}" fill="white"/><g fill="#24332d" font-family="Arial,sans-serif">${content}</g></svg>`;
}
export function visualHTML(v, image = '') {
  if (!isVisual(v)) return '';
  const chart = chartSVG(v);
  return `<figure style="margin:14px 0"><div tabindex="0" role="region" aria-label="${e(v.title)} chart; scroll horizontally if needed" style="overflow-x:auto;max-width:100%">${chart ? (image ? `<img src="${e(image)}" alt="${e(v.title)}. Exact values in the following table." style="display:block;width:100%;min-width:640px;height:auto"/>` : chart.replace('<svg ', '<svg style="width:100%;min-width:640px;height:auto;display:block" ')) : ''}</div><figcaption style="font:12px/1.5 Arial,sans-serif;color:#59675f;margin:8px 0">${e(v.caption)}</figcaption>${chart ? `<details><summary style="font:12px Arial,sans-serif;cursor:pointer">View data table</summary>${visualTable(v)}</details>` : visualTable(v)}</figure>`;
}
