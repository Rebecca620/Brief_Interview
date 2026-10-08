import { $, modal, closeModal } from '../../shared/ui.js';
import { escapeHTML as e, reportFragment } from '../../domain/export.js';

/** Restore a report as a separate copy, never as a data row or over the current draft. */
export function reviewReportImport(material, ctx) {
  return new Promise((resolve) => {
    const reports = material.reportBackup;
    modal(
      'Open report file',
      `<p>This file contains ${reports.length} structured report(s). Titles, sections, charts and owners will stay together. Open a separate copy; your current report and staged materials are kept.</p>
      <label for="import-report-choice">Choose report</label><select id="import-report-choice">${reports.map((r, i) => `<option value="${i}">${e(r.title || 'Untitled report')} · ${r.cards.length} cards</option>`).join('')}</select>
      <p id="import-report-error" role="alert"></p><div id="import-report-preview"></div>
      <div class="modal-actions"><button class="btn" id="import-report-cancel">Cancel</button><button class="btn primary" id="import-report-open" ${reports.length ? '' : 'disabled'}>Open as new report</button></div>`,
    );
    const dialog = $('#modal');
    dialog.classList.add('wide');
    const render = () => {
      const report = reports[Number($('#import-report-choice').value)];
      $('#import-report-preview').innerHTML = report
        ? reportFragment(report)
        : '<p>This backup contains no reports.</p>';
    };
    const finish = () => {
      if (dialog.open) return;
      dialog.removeEventListener('close', finish);
      resolve();
    };
    dialog.addEventListener('close', finish);
    $('#import-report-choice').onchange = render;
    $('#import-report-cancel').onclick = closeModal;
    $('#import-report-open').onclick = () => {
      try {
        const report = reports[Number($('#import-report-choice').value)];
        const [copy] = ctx.repository.restore(JSON.stringify(report));
        ctx.repository.flush();
        closeModal();
        ctx.navigate(`report/${copy.id}`);
      } catch (error) {
        $('#import-report-error').textContent = error.message;
      }
    };
    render();
  });
}
