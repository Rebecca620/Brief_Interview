import { safeLink } from '../../domain/visuals/contract.js';
import { $, modal, closeModal, toast } from '../../shared/ui.js';
import { escapeHTML as e } from '../../domain/export.js';
import {
  validateCard,
  createCard,
  REPORT_SECTIONS,
  cardSection,
  createId,
} from '../../domain/report.js';
export function createCardEditor(ctx) {
  function editCard(id, draft = null) {
    const report = ctx.report;
    const card = draft || report.cards.find((item) => item.id === id);
    if (!card) return;
    const draftKey = id || 'new';
    const owner = report.people.find((person) => person.id === card.owner)?.name || '';
    modal(
      'Edit update',
      `<form id="edit-form">
      <p id="edit-error" class="form-error" role="alert" hidden></p>
      <div class="form-grid"><div class="form-field"><label for="edit-section">Report section</label><select id="edit-section">${Object.entries(
        REPORT_SECTIONS,
      )
        .map(
          ([value, name]) =>
            `<option value="${value}" ${cardSection(card) === value ? 'selected' : ''}>${name}</option>`,
        )
        .join('')}</select></div>
      <div class="form-field"><label for="edit-type">Content type</label><select id="edit-type">${Object.entries(
        { update: 'Text', metric: 'Metric', ...(card.image ? { image: 'Image' } : {}) },
      )
        .map(
          ([value, name]) =>
            `<option value="${value}" ${(card.type === 'decision' ? 'update' : card.type) === value ? 'selected' : ''}>${name}</option>`,
        )
        .join('')}</select></div></div>
      <label for="edit-title">Title</label><input id="edit-title" required maxlength="180" value="${e(card.title)}" />
      <label for="edit-body">Details</label><textarea id="edit-body">${e(card.body)}</textarea>
      <div id="action-fields" class="form-grid"><div><label for="edit-owner">Owner (optional)</label><input id="edit-owner" maxlength="60" value="${e(owner)}" list="owner-options" placeholder="Who can move this forward?" /><datalist id="owner-options">${report.people.map((person) => `<option value="${e(person.name)}"></option>`).join('')}</datalist></div><div><label for="edit-due">Due date (optional)</label><input type="date" id="edit-due" value="${e(card.due)}" /></div></div>
      <div id="metric-fields" class="form-grid"><div><label for="edit-value">Current value</label><input type="number" step="any" id="edit-value" value="${e(card.value ?? 0)}" /></div><div><label for="edit-target">Target (greater than zero)</label><input type="number" step="any" min="0.000001" id="edit-target" value="${e(card.target ?? 100)}" /></div></div>
      <div id="image-fields"><label for="edit-alt">Image description</label><textarea id="edit-alt" rows="2">${e(card.alt || '')}</textarea><p class="field-help">Describe what the image communicates, including any important numbers.</p></div>
      <details class="edit-advanced"><summary>Link & original source</summary><label for="edit-link">Related link (optional)</label><input id="edit-link" type="url" value="${e(card.link || '')}" placeholder="https://…"/><p class="field-help">Readers open this link separately. Include a chart image or table for readers without access.</p>
      <details class="source-detail"><summary>Original source</summary><p>${e(card.source || 'Manually created')}</p></details>
      </details><p id="edit-draft-status" class="field-help" role="status">Changes are kept as a draft until you save.</p><div class="modal-actions"><button type="button" class="btn danger" id="delete-card">Delete</button><div><button type="button" class="btn" id="cancel-edit">Close</button> <button class="btn primary" type="submit">Save changes</button></div></div>
    </form>`,
    );
    const form = $('#edit-form');
    const fields = () => [...form.querySelectorAll('input,textarea,select')];
    try {
      const saved = report.editorDrafts?.[draftKey];
      if (saved) {
        for (const field of fields())
          if (saved[field.id] !== undefined) field.value = saved[field.id];
        $('#edit-draft-status').textContent = 'Your unfinished edit was restored.';
      }
    } catch {
      /* An unavailable session store must not prevent editing. */
    }
    form.addEventListener('input', () => {
      try {
        report.editorDrafts ||= {};
        report.editorDrafts[draftKey] = Object.fromEntries(
          fields().map((field) => [field.id, field.value]),
        );
        ctx.commit();
        $('#edit-draft-status').textContent = 'Draft kept. Save to update the report.';
      } catch {
        $('#edit-draft-status').textContent = 'Draft recovery is unavailable. Save before closing.';
      }
    });
    $('#cancel-edit').onclick = closeModal;
    function syncFields() {
      const type = $('#edit-type').value;
      $('#metric-fields').hidden = type !== 'metric';
      $('#edit-value').disabled = $('#edit-target').disabled = type !== 'metric';
      $('#image-fields').hidden = type !== 'image';
      $('#action-fields').hidden =
        $('#edit-section').value === 'progress' && !card.owner && !card.due;
    }
    $('#edit-type').onchange = $('#edit-section').onchange = syncFields;
    syncFields();
    $('#edit-form').onsubmit = (event) => {
      event.preventDefault();
      const section = $('#edit-section').value;
      const type =
        $('#edit-type').value === 'update' && section === 'decision'
          ? 'decision'
          : $('#edit-type').value;
      const link = $('#edit-link').value.trim();
      if (link && !safeLink(link)) {
        $('#edit-error').hidden = false;
        $('#edit-error').textContent = 'Use an HTTP or HTTPS link without embedded credentials.';
        return;
      }
      const fields = {
        link,
        title: $('#edit-title').value.trim(),
        body: $('#edit-body').value,
        section,
        type,
        due: $('#edit-due').value,
        value: $('#edit-value').value,
        target: $('#edit-target').value,
        alt: $('#edit-alt').value.trim(),
      };
      const error = validateCard({ ...card, ...fields });
      if (error) {
        $('#edit-error').hidden = false;
        $('#edit-error').textContent = error;
        return;
      }
      if (report.editorDrafts) delete report.editorDrafts[draftKey];
      const name = $('#edit-owner').value.trim();
      let person = report.people.find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (name && !person) {
        person = { id: createId(), name, role: 'Team member' };
        report.people.push(person);
      }
      Object.assign(card, fields, {
        owner: person?.id || '',
        mentions: report.people
          .filter((item) => fields.body.includes('@' + item.name))
          .map((item) => item.id),
      });
      if (draft) report.cards.push(card);
      ctx.commit();
      ctx.render();
      closeModal();
      toast('Update saved');
    };
    $('#delete-card').hidden = Boolean(draft);
    $('#delete-card').onclick = () => {
      const index = report.cards.indexOf(card);
      report.cards.splice(index, 1);
      ctx.commit();
      ctx.render();
      closeModal();
      if (report.editorDrafts) delete report.editorDrafts[draftKey];
      ctx.commit();
      toast('Update removed', {
        label: 'Undo',
        action: () => {
          report.cards.splice(index, 0, card);
          ctx.commit();
          ctx.render();
        },
      });
    };
  }
  $('#add-card').onclick = () => editCard(null, createCard('update', { title: '' }));
  return { editCard };
}
