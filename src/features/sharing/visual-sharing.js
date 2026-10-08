import { desktop } from '../../platform/desktop.js';
import { $, modal, download } from '../../shared/ui.js';
import { escapeHTML, reportHTML } from '../../domain/export.js';
import { canNativeShare, shareWithApps } from './native-share.js';
import { reportImages } from './report-images.js';

export async function openImageShare(report, cards) {
  modal(
    'Share as image',
    '<p id="image-status" role="status">Preparing readable PNG pages on this device…</p><div id="image-pages"></div>',
  );
  const dialog = $('#modal'),
    status = $('#image-status'),
    container = $('#image-pages');
  const urls = [];
  const cleanup = () => {
    urls.forEach((url) => URL.revokeObjectURL(url));
    dialog.removeEventListener('close', cleanup);
  };
  dialog.addEventListener('close', cleanup);
  try {
    const files = await reportImages(report, cards);
    if (!status.isConnected || !dialog.open) return;
    status.textContent = `${files.length} PNG ${files.length === 1 ? 'page' : 'pages'} ready. Share a page or download it to attach. Images do not contain selectable text; use formatted email or PDF for accessible text.`;
    files.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      urls.push(url);
      const entry = document.createElement('section');
      entry.className = 'image-share-page';
      entry.innerHTML = `<h3>Page ${index + 1}</h3><img src="${url}" alt="Visual preview of ${escapeHTML(report.title || 'report')}, page ${index + 1}"/><div class="image-share-actions"><button class="btn primary" data-send>Share image…</button><button class="btn" data-download>Download PNG</button></div>`;
      const payload = { title: report.title || 'Project update', files: [file] };
      const send = entry.querySelector('[data-send]');
      send.disabled = !canNativeShare(payload);
      if (send.disabled)
        send.title = 'This browser does not support sharing image files. Download PNG instead.';
      send.onclick = async () => {
        send.disabled = true;
        const outcome = await shareWithApps(payload);
        if (!status.isConnected) return;
        status.textContent =
          outcome === 'handed-off'
            ? 'Image handed to the selected app. Send it from there.'
            : outcome === 'cancelled'
              ? 'Sharing cancelled. Your image is still ready.'
              : 'Image sharing is unavailable or failed. Download PNG and attach it in your app.';
        send.disabled = false;
      };
      entry.querySelector('[data-download]').onclick = async () =>
        download(file.name, file.type, await file.arrayBuffer());
      container.append(entry);
    });
  } catch (error) {
    if (status.isConnected) status.textContent = error.message;
  }
}

export function printDocument(report, cards) {
  const html = reportHTML({ ...report, cards });
  return html
    .replace(
      '</style>',
      `
    @media print {
      @page { size: A4; margin: 14mm; }
      .email-card { break-inside: auto; }
      h1, h2, h3 { break-after: avoid; }
      p { orphans: 3; widows: 3; }
      img { max-height: 190mm; object-fit: contain; min-width: 0 !important; }
      [role="region"] { overflow: visible !important; }
      table { table-layout: fixed; width: 100%; }
      th, td { overflow-wrap: anywhere; }
      tr { break-inside: avoid; }
      thead { display: table-header-group; }
      summary { display: none; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>`,
    )
    .replaceAll('<details>', '<details open>');
}

export function openPDF(report, cards) {
  if (desktop()) {
    desktop()
      .send('print', { html: printDocument(report, cards), title: report.title })
      .catch((error) => {
        modal('Print unavailable', `<p>${escapeHTML(error.message)}</p>`);
      });
    return;
  }
  // Open synchronously from the user click, then wait for embedded images before printing.
  const popup = window.open('', '_blank');
  if (!popup) throw Error('The print window was blocked. Allow pop-ups for Brief, then try again.');
  popup.opener = null;
  popup.document.open();
  popup.document.write(printDocument(report, cards));
  popup.document.close();
  const ready = [...popup.document.images].map((img) => img.decode().catch(() => {}));
  Promise.all(ready).then(() => {
    if (!popup.closed) {
      popup.focus();
      popup.print();
    }
  });
}
