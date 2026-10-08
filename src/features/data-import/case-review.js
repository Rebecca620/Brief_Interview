import { $, modal, closeModal } from '../../shared/ui.js';
import { escapeHTML as e } from '../../domain/export.js';
import { REPORT_SECTIONS } from '../../domain/report.js';
import { caseReportFindings } from '../../domain/datasets/case-report.js';
import { visualHTML } from '../../domain/visuals/render.js';
import { buildMaterial } from './build-material.js';
export function reviewCase(material) {
  const findings = caseReportFindings(material.dataset.caseReport);
  return new Promise((resolve) => {
    modal(
      'Review data import',
      `<p class="small-label">CASE REPORT DETECTED</p><h3>Your report is ready to review</h3><p><strong>${e(material.name)}</strong> contains a case review and recorded retries. No metric selection is needed. Source claims stay attributed; Brief does not re-judge the conversation.</p><div id="case-findings">${findings
        .map(
          (f, i) =>
            `<article class="data-finding"><label><input type="checkbox" data-case-finding="${i}" checked/><strong>${e(f.title)}</strong></label><label class="case-section">Report section<select data-case-section="${i}" aria-label="Section for ${e(f.title)}">${Object.entries(
              REPORT_SECTIONS,
            )
              .map(
                ([key, name]) =>
                  `<option value="${key}" ${f.section === key ? 'selected' : ''}>${name}</option>`,
              )
              .join(
                '',
              )}</select></label><p>${e(f.body)}</p>${f.visual ? visualHTML(f.visual) : ''}<details><summary>Source and method</summary><p class="source-detail">${e(f.source)}</p></details></article>`,
        )
        .join(
          '',
        )}</div><p id="case-error" class="form-error" role="alert" hidden></p><div class="modal-actions"><button class="btn" id="case-cancel">Cancel import</button><button class="btn primary" id="case-add">Add selected cards</button></div><details class="copy-options"><summary>Advanced analysis</summary><p>Use raw field mapping only if you need a different analysis.</p><button class="btn" id="case-advanced">Choose fields manually</button></details>`,
    );
    const dialog = $('#modal');
    let active = true;
    const closed = () => {
      if (dialog.open) return;
      active = false;
      dialog.removeEventListener('close', closed);
      resolve(null);
    };
    dialog.addEventListener('close', closed);
    function finish(result) {
      active = false;
      dialog.removeEventListener('close', closed);
      resolve(result);
      closeModal();
    }
    $('#case-cancel').onclick = closeModal;
    $('#case-advanced').onclick = () => finish({ advanced: true });
    $('#case-add').onclick = async () => {
      const selected = [...document.querySelectorAll('[data-case-finding]:checked')].map((input) =>
        Number(input.dataset.caseFinding),
      );
      const error = $('#case-error');
      if (!selected.length) {
        error.hidden = false;
        error.textContent = 'Select at least one card.';
        return;
      }
      const sections = [...document.querySelectorAll('[data-case-section]')].map(
        (input) => input.value,
      );
      const snapshot = findings.map((f, i) => ({ ...f, section: sections[i] }));
      const button = $('#case-add');
      button.disabled = true;
      $('#case-findings').inert = true;
      $('#case-advanced').disabled = true;
      try {
        const result = await buildMaterial(
          material,
          'case-report',
          { mode: 'case-report', sections },
          snapshot,
          selected,
        );
        if (active && dialog.open) finish(result);
      } catch (caught) {
        if (!active) return;
        error.hidden = false;
        error.textContent = caught.message;
        button.disabled = false;
        $('#case-findings').inert = false;
        $('#case-advanced').disabled = false;
      }
    };
  });
}
