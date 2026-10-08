import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve(process.argv[2] || '.build/presentation');
const slides = JSON.parse(await readFile('presentation/slides.json', 'utf8'));
const e = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const time = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
let elapsed = 0;
const sections = slides
  .map((s, i) => {
    s.start = elapsed;
    elapsed += s.seconds;
    s.end = elapsed;
    const point = (p, j) => {
      const [title, ...lines] = p.split('\n');
      return `<div class="point"><span class="number">${String(j + 1).padStart(2, '0')}</span><h2>${e(title)}</h2>${lines.map((line) => `<p>${e(line)}</p>`).join('')}</div>`;
    };
    let body = `<div class="points">${s.points?.map(point).join('') || ''}</div>`;
    if (s.kind === 'screen')
      body = `<div class="screen-copy">${body}</div><figure><img src="${e(s.image)}" alt="Brief report with a metric of 80 of 100, progress text and a decision requiring approval"/><figcaption>${e(s.caption)}</figcaption></figure>`;
    if (s.kind === 'table')
      body = `<table>${s.rows.map((row, j) => `<tr>${row.map((cell) => (j ? `<td>${e(cell)}</td>` : `<th scope="col">${e(cell)}</th>`)).join('')}</tr>`).join('')}</table>`;
    return `<section class="slide ${s.kind}" id="slide-${i + 1}" aria-label="Slide ${i + 1}: ${e(s.title)}" ${i ? 'hidden' : ''}><header><p class="eyebrow">${e(s.subtitle)}</p><h1>${e(s.title)}</h1></header><div class="content">${body}</div>${s.headline ? `<p class="takeaway">${e(s.headline)}</p>` : ''}${s.caption && s.kind !== 'screen' ? `<p class="caption">${e(s.caption)}</p>` : ''}<footer>Brief <span>${String(i + 1).padStart(2, '0')} / ${slides.length}</span></footer></section>`;
  })
  .join('\n');
if (elapsed !== 900) throw Error('Presentation timing must total 15 minutes.');
await mkdir(output, { recursive: true });
const template = await readFile('presentation/template.html', 'utf8');
await writeFile(
  path.join(output, 'index.html'),
  template.replace('<!-- SLIDES -->', sections).replace(
    /['"]__BRIEF_NOTES__['"]/,
    JSON.stringify(
      slides.map((s) => ({
        title: s.title,
        notes: s.notes,
        time: `${time(s.start)}–${time(s.end)}`,
        source: s.source,
      })),
    ).replaceAll('<', '\\u003c'),
  ),
);
await cp('presentation/assets', path.join(output, 'assets'), { recursive: true });
await writeFile(
  path.join(output, 'SPEAKER-NOTES.md'),
  `# Brief: 15-minute English presentation\n\n12 slides. Target duration: 15:00, including a 2:30 live demo. Approximately ${slides.reduce((n, s) => n + s.notes.split(/\s+/).length, 0)} words including demo instructions. Timing is a rehearsal plan, not a measured speaking result. Practise once with a timer and adapt the wording to your own voice.\n\nOpen index.html, use Left/Right arrows, and press N for notes. The PDF is a static fallback. Screenshots show fictional data in the shared web workspace; they are not native UI acceptance evidence.\n\n` +
    slides
      .map(
        (s, i) =>
          `## ${i + 1}. ${s.title} (${time(s.start)}–${time(s.end)})\n\n${s.notes}\n\nEvidence: ${s.source}\n`,
      )
      .join('\n'),
);
console.log(`Built ${slides.length} slides with 900 seconds of speaker notes at ${output}`);
