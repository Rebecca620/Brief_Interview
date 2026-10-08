import { recordCards } from '../../domain/datasets/record-cards.js';
import { visualHTML } from '../../domain/visuals/render.js';
import { reviewCase } from './case-review.js';
import { buildMaterial } from './build-material.js';
import {
  fieldChoices,
  collectionLabel,
  recommendedCollection,
} from '../../domain/datasets/field-choices.js';
import { $, modal, closeModal } from '../../shared/ui.js';
import { escapeHTML as e } from '../../domain/export.js';
import { profileCollection, valueAt } from '../../domain/datasets/parse.js';
import { evaluationCollection } from '../../domain/datasets/evaluation.js';
import { analyzeDataset } from '../../domain/datasets/analyze.js';

/** User-reviewed analysis, kept independent of file parsing and report persistence. */
export async function reviewDataset(material, forceManual = false) {
  if (material.dataset.caseReport && !forceManual) {
    const result = await reviewCase(material);
    return result?.advanced ? reviewDataset(material, true) : result;
  }
  return new Promise((resolve) => {
    let fields = [],
      collection,
      findings = [],
      config,
      autoRecords = false;
    modal(
      'Review data import',
      `<p><strong>${e(material.name)}</strong> · Review what this file contains, then choose the updates to include. Everything is processed on this device.</p>
      <p id="data-overview" class="import-overview"></p><form id="data-form"><details id="data-adjust"><summary>Adjust fields & analysis</summary><div class="form-grid">
      <label class="form-field">Report type<select id="data-mode"><option value="records">Record cards (no calculations)</option><option value="numeric" selected>Numeric data</option><option value="evaluation">Evaluation results</option><option value="paired">Side-by-side comparison</option></select></label>
      <label class="form-field">Record collection<select id="data-collection">${material.dataset.collections.map((c, i) => `<option value="${i}">${e(collectionLabel(c))} (${c.rows.length} records)</option>`).join('')}</select></label></div>
      <label class="split-option"><input id="data-show-all" type="checkbox"/> Show technical and constant fields (advanced)</label><p id="data-profile" class="field-help"></p><div id="data-fields"></div>
      <p class="field-help">${e(material.dataset.notices.join(' '))}</p>
      </details><p id="data-error" class="form-error" role="alert" hidden></p>
      <button class="btn primary" type="submit" id="data-analyze">Find patterns</button></form>
      <div id="data-findings" aria-live="polite"></div>
      <div class="modal-actions"><button type="button" class="btn" id="data-cancel">Cancel import</button><button class="btn primary" type="button" id="data-add" hidden>Add selected findings</button></div>`,
    );
    const dialog = $('#modal');
    let active = true;
    const cancelled = () => {
      if (dialog.open) return;
      active = false;
      dialog.removeEventListener('close', cancelled);
      resolve(null);
    };
    dialog.addEventListener('close', cancelled);
    const error = (message) => {
      $('#data-error').textContent = message;
      $('#data-error').hidden = !message;
    };
    function invalidate() {
      findings = [];
      $('#data-findings').innerHTML = '';
      $('#data-add').hidden = true;
      error('');
    }
    function refresh() {
      invalidate();
      try {
        const original = material.dataset.collections[Number($('#data-collection').value)];
        collection = ['evaluation', 'paired'].includes($('#data-mode').value)
          ? evaluationCollection(original) || original
          : original;
        const profile = profileCollection(collection);
        fields = fieldChoices(collection, profile.fields);
        $('#data-overview').textContent =
          `${collection.rows.length} records found in ${collectionLabel(collection)}. Preview the suggested summary, or adjust which fields to use.`;
        const advanced = $('#data-show-all').checked;
        const available = fields.filter((f) => (f.numbers || f.numericStrings) && !f.unavailable);
        const metrics = available.filter((f) => advanced || f.recommended);
        for (const option of $('#data-mode').options)
          option.disabled = option.value !== 'records' && !available.length;
        $('#data-analyze').disabled = false;
        $('#data-analyze').textContent = 'Find patterns';
        if (autoRecords && metrics.length) {
          $('#data-mode').value = 'numeric';
          autoRecords = false;
        }
        if (!metrics.length && $('#data-mode').value !== 'records') {
          $('#data-mode').value = 'records';
          autoRecords = true;
        }
        if ($('#data-mode').value === 'records') {
          $('#data-profile').textContent =
            `${collection.rows.length} records. No score selection needed.`;
          $('#data-fields').innerHTML =
            `<p>${available.length ? 'No recommended business measure selected. You can show advanced fields to review technical or constant numbers, or keep the records as content.' : 'This collection has no available numeric scores. Import the original records as editable cards, or choose another collection for charts.'}</p><p class="field-help">Each record becomes a card in Needs discussion. Content fields become titles and readable text. Technical fields and nested objects stay in Original source; no scores or conclusions are invented. You can change the section after import.</p>`;
          $('#data-analyze').textContent = 'Preview record cards';
          return;
        }

        const options = (items, optional = false) =>
          `${optional ? '<option value="">None</option>' : ''}${items.map((f) => `<option value="${e(f.id)}" ${f.unavailable ? 'disabled' : ''}>${e(f.label)}${f.reason && f.reason !== 'No numeric values' ? ` — ${e(f.reason)}` : ''}</option>`).join('')}`;
        $('#data-profile').textContent =
          `${collection.rows.length} analysis rows; ${fields.length} fields. ${collection.note || ''} ${profile.nestedLists ? 'Nested lists are not flattened. ' : ''}${profile.truncated ? 'Field discovery limited to 200 fields and 12 levels. ' : ''}${advanced ? '' : `${fields.filter((f) => f.reason).length} technical, constant or non-numeric fields kept out of metric choices. Zero values still count in selected measures.`}`;
        $('#data-fields').innerHTML =
          `<div class="form-grid"><label class="form-field">Numeric / score field<select id="data-metric">${options(metrics)}</select></label><label class="form-field">Group by<select id="data-group">${options(
            fields.filter((f) => advanced || f.group),
            true,
          )}</select></label><label class="form-field" ${['evaluation', 'paired'].includes($('#data-mode').value) ? 'hidden' : ''}>Date field<select id="data-date">${options(
            fields.filter((f) => f.dates),
            true,
          )}</select></label></div>
        <label class="split-option"><input id="data-strings" type="checkbox" /> Treat numeric strings as numbers</label>
        ${$('#data-mode').value === 'evaluation' ? '<div class="form-grid"><label class="form-field">Passing rule<select id="data-pass"><option value="none">No pass rate — describe scores only</option><option value="gte">Score ≥ threshold</option><option value="lte">Score ≤ threshold</option></select></label><label class="form-field">Pass threshold<input id="data-threshold" type="number" step="any" placeholder="Defined by your rubric" /></label></div><p class="field-help">Choose the score owner/dimension explicitly. Scores and thresholds are never mapped to a guessed rubric. Group averages use each group’s available rows.</p>' : ''}
        ${$('#data-mode').value === 'paired' ? `<div class="form-grid"><label class="form-field">Pair key<select id="data-pair-key">${options(fields)}</select></label><label class="form-field">Baseline model value<input id="data-baseline" list="data-model-values" placeholder="Exact value in Group by" /></label><label class="form-field">Candidate model value<input id="data-candidate" list="data-model-values" placeholder="Exact value in Group by" /></label><label class="form-field">Pass score<input id="data-pass-value" type="number" step="any" placeholder="e.g. 3" /></label><label class="form-field">Fail score<input id="data-fail-value" type="number" step="any" placeholder="e.g. 1" /></label></div><datalist id="data-model-values"></datalist><p class="field-help">Group by must identify the model. Pair key identifies the same case/turn in both models. Only exact Pass/Fail scores count; all other scores are excluded. Duplicate keys are rejected.</p>` : ''}
        <details><summary>Field samples</summary><div class="source-detail">${fields.map((f) => `${e(f.id)}: ${e(f.sample.join(', '))} (${f.present}/${collection.rows.length} present)`).join('<br>')}</div></details>`;
        const suggested = fields.find(
          (f) =>
            (advanced || f.recommended) &&
            !f.unavailable &&
            (f.numbers || f.numericStrings) &&
            /score|value|accuracy|metrics/i.test(f.id),
        );
        if (suggested) $('#data-metric').value = suggested.id;
        if (collection.kind === 'evaluation') {
          $('#data-group').value = '/model';
          if ($('#data-pair-key')) $('#data-pair-key').value = '/pair_key';
        }
        $('#data-analyze').disabled = !$('#data-metric').value;
        if ($('#data-analyze').disabled)
          error(
            'No changing business measures found in this collection. Choose another collection, or show advanced fields to review constant values and technical measures.',
          );
      } catch (caught) {
        $('#data-fields').innerHTML = '';
        $('#data-analyze').disabled = true;
        error(caught.message);
      }
    }
    $('#data-mode').onchange = () => {
      autoRecords = false;
      refresh();
    };
    $('#data-show-all').onchange = refresh;
    $('#data-collection').onchange = refresh;
    $('#data-fields').oninput = () => {
      invalidate();
      const choices = $('#data-model-values'),
        field = fields.find((f) => f.id === $('#data-group')?.value);
      if (choices && field)
        choices.innerHTML = [
          ...new Set(
            collection.rows
              .map((row) => valueAt(row, field.parts))
              .filter((value) => ['string', 'number'].includes(typeof value)),
          ),
        ]
          .slice(0, 100)
          .map((value) => `<option value="${e(value)}"></option>`)
          .join('');
    };
    $('#data-form').onsubmit = (event) => {
      event.preventDefault();
      invalidate();
      try {
        config = {
          mode: $('#data-mode').value,
          pairKey: $('#data-pair-key')?.value || '',
          baseline: $('#data-baseline')?.value || '',
          candidate: $('#data-candidate')?.value || '',
          passValue: $('#data-pass-value')?.value || '',
          failValue: $('#data-fail-value')?.value || '',
          metric: $('#data-metric')?.value || '',
          group: $('#data-group')?.value || '',
          date: $('#data-date')?.value || '',
          numericStrings: $('#data-strings')?.checked || false,
          passRule: $('#data-pass')?.value || 'none',
          threshold: $('#data-threshold')?.value || '',
        };
        findings =
          config.mode === 'records'
            ? recordCards(collection)
            : analyzeDataset(collection, fields, config);
        $('#data-findings').innerHTML =
          `<h3>Choose findings for your update</h3><p class="field-help">${config.mode === 'records' ? 'These are source records, not analytical findings. Select the cards to include.' : 'Review these descriptive observations. You can edit the resulting cards.'}</p>${findings.map((f, i) => `<article class="data-finding"><label><input type="checkbox" data-finding="${i}" checked /> <strong>${e(f.title)}</strong></label><p>${e(f.body)}</p>${f.visual ? visualHTML(f.visual) : ''}<details><summary>Evidence and method</summary><p class="source-detail">${e(f.source)}</p></details></article>`).join('')}`;
        $('#data-add').hidden = false;
        $('#data-findings').scrollIntoView({ block: 'start' });
      } catch (caught) {
        error(caught.message);
      }
    };
    $('#data-cancel').onclick = closeModal;
    $('#data-add').onclick = async () => {
      const selected = [...document.querySelectorAll('[data-finding]:checked')].map((input) =>
        Number(input.dataset.finding),
      );
      if (!selected.length) {
        error('Select at least one finding.');
        return;
      }
      $('#data-add').disabled = true;
      $('#data-form').inert = true;
      $('#data-findings').inert = true;
      try {
        const result = await buildMaterial(material, collection.id, config, findings, selected);
        if (!active || !dialog.open) return;
        dialog.removeEventListener('close', cancelled);
        resolve(result);
        closeModal();
      } catch (caught) {
        error(caught.message);
        $('#data-add').disabled = false;
        $('#data-form').inert = false;
        $('#data-findings').inert = false;
      }
    };
    $('#data-collection').value = String(recommendedCollection(material.dataset));
    if (
      material.dataset.collections[Number($('#data-collection').value)].rows.some(
        (row) => row.type === 'compress',
      )
    )
      $('#data-mode').value = 'evaluation';
    refresh();
    if (['evaluation', 'paired'].includes($('#data-mode').value)) $('#data-adjust').open = true;
  });
}
