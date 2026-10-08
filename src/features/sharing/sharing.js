import { desktop } from '../../platform/desktop.js';
import { openImageShare, openPDF } from './visual-sharing.js';
import { openSlides } from '../slides/slides.js';
import { openMeeting } from '../meetings/meeting.js';
import { $, modal, toast, download } from '../../shared/ui.js';
import { checks, isImageData } from '../../domain/report.js';
import {
  escapeHTML,
  cardText,
  cardHTML,
  reportText,
  reportFragment,
  reportHTML,
  htmlDocument,
} from '../../domain/export.js';
import { emailDraftURL, canNativeShare, shareWithApps } from './native-share.js';
import { backupDTO } from '../../data/report-repository.js';

export async function copyContent(text, html) {
  if (desktop()) {
    try {
      await desktop().send('copy', { text, html });
      toast('Copied. Paste into your email draft.');
    } catch (error) {
      toast(error.message);
    }
    return;
  }
  try {
    if (html && navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      toast('Formatted content copied. Paste into your email draft.');
      return;
    }
    await navigator.clipboard.writeText(text);
    toast('Plain text copied. This browser did not provide formatted copy.');
  } catch {
    // Some browsers reject HTML but still allow text clipboard writes.
    try {
      await navigator.clipboard.writeText(text);
      toast('Plain text copied. Formatted copy was unavailable.');
    } catch {
      modal(
        'Copy manually',
        `<p>Clipboard access is unavailable. Copy the text below, or close this dialog and download HTML.</p><label for="copy-fallback">Content to copy</label><textarea id="copy-fallback" readonly>${escapeHTML(text)}</textarea>`,
      );
      $('#copy-fallback').select();
    }
  }
}

export function createSharing(ctx) {
  const backup = () =>
    download(
      'brief-library.json',
      'application/json',
      JSON.stringify(backupDTO(ctx.repository.reports), null, 2),
    );
  function selection(cardId) {
    const report = ctx.report;
    const card = cardId ? report.cards.find((c) => c.id === cardId) : null;
    return { report, card, cards: card ? [card] : report.cards };
  }
  function share(cardId) {
    const { report, card, cards } = selection(cardId);
    if (!cards.length) return toast('Add an update before sharing.');
    const issues = checks(cards);
    const text = card ? cardText(report, card) : reportText(report);
    const html = card ? cardHTML(report, card) : reportFragment(report);
    const title = card?.title || report.title || 'Report';
    modal(
      card ? 'Share update' : 'Share report',
      `
      <p class="modal-description">${escapeHTML(title)}</p>
      ${issues.length ? `<div class="share-review"><strong>${issues.length} ${issues.length === 1 ? 'detail' : 'details'} to review</strong><ul>${issues.map((i) => `<li>${escapeHTML(i.text)}</li>`).join('')}</ul><button class="text-button" id="share-review">Review details</button></div>` : ''}
      <label for="share-format">Format</label><select id="share-format"><option value="text">Text — works in any app</option><option value="html">Styled report — HTML attachment</option></select>
      <details class="share-preview"><summary>Preview content</summary><pre>${escapeHTML(text)}</pre></details>
      <p class="field-help" id="share-status" role="status">Choose recipients in the app you share to.</p>
      <div class="modal-actions"><button class="btn" id="email-copy">Copy formatted content</button><button class="btn primary" id="native-share">Share to apps…</button></div>
      <details class="copy-options"><summary>More options</summary><button class="text-button" id="text-copy">Copy plain text</button><button class="text-button" id="share-export">Export file…</button><a class="text-button" id="email-open" href="${escapeHTML(emailDraftURL(title, text))}">Open email app</a></details>`,
    );
    const imageIssues = issues.some((i) => cards.find((c) => c.id === i.id)?.type === 'image');
    $('#share-export').onclick = () => exportReport(cardId);
    $('#email-open').onclick = () => {
      $('#share-status').textContent = 'Email handoff requested.';
    };
    $('#email-copy').disabled = imageIssues;
    $('#email-copy').onclick = () => copyContent(text, html);
    $('#text-copy').onclick = () => copyContent(text);
    $('#share-review')?.addEventListener('click', () => ctx.reportPage.editCard(issues[0].id));
    $('#native-share').disabled = !canNativeShare({ title, text });
    if ($('#native-share').disabled)
      $('#share-status').textContent =
        'App sharing is unavailable here. Copy the report or open your email app.';
    $('#share-format').onchange = () => {
      $('#native-share').disabled =
        ($('#share-format').value === 'html' && imageIssues) || !canNativeShare({ title, text });
    };
    $('#native-share').onclick = async () => {
      const button = $('#native-share');
      button.disabled = true;
      const file = new File([htmlDocument(title, html)], 'Brief report.html', {
        type: 'text/html',
      });
      const result = await shareWithApps(
        $('#share-format').value === 'html' ? { title, files: [file] } : { title, text },
      );
      if (!button.isConnected) return;
      $('#share-status').textContent = {
        cancelled: 'Sharing cancelled.',
        'handed-off': 'Opened in the selected app.',
        failed: 'Could not open sharing. Copy or export the report instead.',
        unsupported: 'This format is unavailable. Copy or export the report instead.',
      }[result];
      button.disabled = false;
    };
  }
  function exportReport(cardId) {
    const { report, card, cards } = selection(cardId);
    if (!cards.length) return toast('Add an update before exporting.');
    const issues = checks(cards).filter((i) => cards.find((c) => c.id === i.id)?.type === 'image');
    modal(
      'Export report',
      `<p class="modal-description">${escapeHTML(card?.title || report.title)}</p>
      <div class="export-form"><label for="export-format">File format</label><select id="export-format"><option value="pdf">PDF document</option><option value="png">PNG image</option><option value="html">HTML document</option><option value="pptx">PowerPoint presentation</option></select></div>
      <div class="export-preview">${card ? cardHTML(report, card) : reportFragment(report)}</div>
      <p class="field-help" id="export-description">Print or save a PDF with selectable text. Review pagination in the print preview.</p>
      ${issues.length ? `<p class="form-error">${issues.map((i) => escapeHTML(i.text)).join('. ')}</p>` : ''}
      <div class="modal-actions"><button class="btn" id="export-back">Back to report</button><button class="btn primary" id="export-save" ${issues.length ? 'disabled' : ''}>Print / Save as PDF</button></div>
      ${cards
        .filter((c) => c.type === 'image' && isImageData(c.image))
        .map(
          (c) =>
            `<button class="text-button" data-download-image="${c.id}">Download image: ${escapeHTML(c.title)}</button>`,
        )
        .join('')}`,
    );
    $('#export-back').onclick = () => $('#modal').close();
    $('#export-format').onchange = () => {
      const format = $('#export-format').value;
      $('#export-save').textContent = {
        pdf: 'Print / Save as PDF',
        png: 'Preview PNG',
        html: 'Download HTML',
        pptx: 'Preview slides',
      }[format];
      $('#export-description').textContent = {
        pdf: 'Print or save a PDF with selectable text. Review pagination in the print preview.',
        png: 'A compact image for messaging. Preview the exact pages before saving.',
        html: 'A standalone report with embedded images and selectable text.',
        pptx: 'Editable text and tables. Preview the slide contents before exporting.',
      }[format];
    };
    $('#export-save').onclick = () => {
      try {
        const format = $('#export-format').value;
        if (format === 'pdf') openPDF(report, cards);
        if (format === 'png') openImageShare(report, cards);
        if (format === 'pptx') openSlides(report, cards);
        if (format === 'html')
          download(
            'brief-report.html',
            'text/html',
            card ? htmlDocument(card.title, cardHTML(report, card)) : reportHTML(report),
          );
      } catch (error) {
        $('#export-description').textContent = error.message;
        $('#export-description').setAttribute('role', 'alert');
      }
    };
    document.querySelectorAll('[data-download-image]').forEach(
      (button) =>
        (button.onclick = () => {
          const item = cards.find((c) => c.id === button.dataset.downloadImage),
            [header, encoded] = item.image.split(','),
            type = header.slice(5, -7);
          download(
            `brief-image.${type.split('/')[1]}`,
            type,
            Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
          );
        }),
    );
  }
  $('#share-button').onclick = () => share();
  $('#export-report').onclick = () => exportReport();
  $('#meeting-report').onclick = () => openMeeting(ctx.report);
  $('#backup-library').onclick = backup;
  return { share, exportReport };
}
