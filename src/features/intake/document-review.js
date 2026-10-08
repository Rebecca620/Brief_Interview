import { $, modal, closeModal } from '../../shared/ui.js';
import { escapeHTML as e } from '../../domain/export.js';
import { REPORT_SECTIONS, assignSection } from '../../domain/report.js';
export function reviewDocument(material) {
  return new Promise((resolve) => {
    modal(
      'Review document import',
      `<p><strong>${e(material.name)}</strong> · ${material.cards.length} editable cards extracted locally.</p><ul>${material.notices.map((n) => `<li>${e(n)}</li>`).join('')}</ul><label>Place document in<select id="document-section">${Object.entries(
        REPORT_SECTIONS,
      )
        .map(([value, label]) => `<option value="${value}">${label}</option>`)
        .join(
          '',
        )}</select></label><div>${material.cards.map((card, i) => `<article class="data-finding"><label><input type="checkbox" data-document-card="${i}" checked/> ${e(card.title)}</label><details><summary>Review extracted text</summary><p class="source-detail">${e(card.body)}</p></details></article>`).join('')}</div><p id="document-error" role="alert"></p><div class="modal-actions"><button class="btn" id="document-cancel">Cancel import</button><button class="btn primary" id="document-add">Add selected cards</button></div>`,
    );
    const dialog = $('#modal');
    const cancelled = () => {
      if (dialog.open) return;
      dialog.removeEventListener('close', cancelled);
      resolve(null);
    };
    dialog.addEventListener('close', cancelled);
    $('#document-cancel').onclick = closeModal;
    $('#document-add').onclick = () => {
      const indices = [...document.querySelectorAll('[data-document-card]:checked')].map((node) =>
        Number(node.dataset.documentCard),
      );
      if (!indices.length) {
        $('#document-error').textContent = 'Select at least one card.';
        return;
      }
      const section = $('#document-section').value;
      material.cards = indices.map((i) => {
        const card = material.cards[i];
        assignSection(card, section);
        return card;
      });
      dialog.removeEventListener('close', cancelled);
      resolve(material);
      closeModal();
    };
  });
}
