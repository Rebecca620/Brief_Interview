import { reviewDocument } from './document-review.js';
import { reviewReportImport } from './report-import.js';
import { icon } from '../../shared/icons.js';
import { dataExample } from '../data-import/examples.js';
import { reviewDataset } from '../data-import/data-import.js';
import { $, showError, toast } from '../../shared/ui.js';
import { exampleReport } from './example.js';
import { escapeHTML as e, reportFragment } from '../../domain/export.js';
import { emptyReport, REPORT_SECTIONS, cardSection, assignSection } from '../../domain/report.js';
import { appendMaterial } from '../../domain/materials.js';
import { readMaterial, fingerprint, noteCards, MAX_FILE_BYTES } from './material-reader.js';

export function createIntakePage(ctx) {
  let staged = [],
    processing = false,
    latestAddition = null;
  function prepare() {
    $('#create-report').innerHTML =
      `${ctx.report ? 'Add to update' : 'Create my update'} ${icon('forward')}`;
    render();
    syncAddition();
  }
  const sectionOptions = (selected, auto = false) =>
    `${auto ? '<option value="auto">Choose section for all</option>' : ''}${Object.entries(
      REPORT_SECTIONS,
    )
      .map(
        ([value, label]) =>
          `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`,
      )
      .join('')}`;
  function preview() {
    if (ctx.report) return;
    const cards = staged.flatMap((item) => item.cards.filter((card) => !card.excluded));
    const notes = $('#intake-notes').value.trim();
    if (notes) {
      try {
        cards.push(
          ...noteCards(notes, 'Pasted notes', $('#split-notes').checked).map((card) => {
            if ($('#notes-section').value !== 'auto')
              assignSection(card, $('#notes-section').value);
            return card;
          }),
        );
      } catch {
        /* Import validation reports oversized notes when submitted. */
      }
    }
    $('#preview-label').textContent = cards.length ? 'LIVE PREVIEW' : 'EXAMPLE';
    $('#sample-preview').innerHTML = reportFragment(
      cards.length ? { title: 'Weekly update', period: '', cards, people: [] } : exampleReport(),
    );
  }
  function render() {
    preview();
    $('#material-list').innerHTML = staged
      .map(
        (item, index) =>
          `<li class="staged-source"><div><strong>${e(item.name)}</strong><small>${item.cards.filter((c) => !c.excluded).length} cards ready</small></div><label class="staged-destination">Place this file in<select data-source-section="${index}" ${processing ? 'disabled' : ''}>${sectionOptions(item.destination || 'auto', true)}</select></label><details><summary>Review & arrange ${item.cards.length} cards</summary>${item.cards.map((card, i) => `<div class="staged-card"><label><input type="checkbox" data-include="${index}:${i}" ${card.excluded ? '' : 'checked'} ${processing ? 'disabled' : ''}/> ${e(card.title)}</label><select aria-label="Section for ${e(card.title)}" data-stage-section="${index}:${i}" ${processing ? 'disabled' : ''}>${sectionOptions(cardSection(card))}</select>${card.visual ? '<small>Chart / table included</small>' : ''}</div>`).join('')}</details><button type="button" class="text-button" data-remove-material="${index}" ${processing ? 'disabled' : ''}>Remove ${e(item.name)}</button></li>`,
      )
      .join('');
    $('#material-count').textContent = processing
      ? 'Reading files…'
      : staged.length
        ? `${staged.length} ${staged.length === 1 ? 'source' : 'sources'} ready`
        : '';
    $('#create-report').disabled =
      processing ||
      (!staged.some((item) => item.cards.some((card) => !card.excluded)) &&
        !$('#intake-notes').value.trim());
    $('#split-notes').disabled = processing || staged.length > 0;
    $('#intake-files').disabled = processing;
    $('#try-example').disabled = processing;
    document.querySelectorAll('[data-example]').forEach((button) => {
      button.disabled = processing;
    });
  }
  async function stage(files) {
    if (processing) return;
    processing = true;
    if (ctx.report) {
      document.body.dataset.material = 'open';
      $('#toggle-material').setAttribute('aria-expanded', 'true');
    }
    render();
    const errors = [];
    try {
      for (const file of files) {
        try {
          if (staged.length >= 20) throw Error('Use at most 20 sources per batch.');
          let material = await readMaterial(file, $('#split-notes').checked);
          if (material.reportBackup) {
            await reviewReportImport(material, ctx);
            continue;
          }
          if (material.document) material = await reviewDocument(material);
          if (!material) continue;
          if (material.dataset) material = await reviewDataset(material);
          if (!material) continue;
          if (staged.some((item) => item.fingerprint === material.fingerprint)) {
            toast(`${file.name} is already staged.`);
            continue;
          }
          staged.push(material);
        } catch (error) {
          errors.push(`${file.name}: ${error.message}`);
        }
      }
      if (errors.length) showError(errors.join(' '));
    } finally {
      processing = false;
      $('#intake-files').value = '';
      render();
    }
  }
  async function commit(event) {
    event.preventDefault();
    if (processing) return;
    const existing = ctx.report;
    processing = true;
    render();
    try {
      const materials = staged
          .map((item) => ({
            ...item,
            cards: item.cards
              .filter((card) => !card.excluded)
              .map(({ excluded: _excluded, ...card }) => card),
          }))
          .filter((item) => item.cards.length),
        notes = $('#intake-notes').value.trim();
      if (notes) {
        const bytes = new TextEncoder().encode(notes);
        if (bytes.length > MAX_FILE_BYTES) throw Error('Pasted notes exceed 2 MB.');
        materials.push({
          name: 'Pasted notes',
          fingerprint: await fingerprint(bytes),
          cards: noteCards(notes, 'Pasted notes', $('#split-notes').checked).map((card) => {
            if ($('#notes-section').value !== 'auto')
              assignSection(card, $('#notes-section').value);
            return card;
          }),
        });
      }
      if (!materials.length) throw Error('Add a file or paste notes first.');
      const target = existing || emptyReport('Weekly update');
      if (!target) throw Error('Choose a destination again.');
      const result = appendMaterial(target, materials);
      if (!result.addedIds.length) throw Error('These sources are already in this report.');
      result.report.cards = result.report.cards.map((card) =>
        result.addedIds.includes(card.id)
          ? {
              ...card,
              mentions: target.people
                .filter((p) => card.body.includes('@' + p.name))
                .map((p) => p.id),
            }
          : card,
      );
      latestAddition = existing
        ? {
            reportId: target.id,
            ids: result.addedIds,
            fingerprints: result.report.sources
              .slice(target.sources.length)
              .map((source) => source.fingerprint),
          }
        : null;
      if (existing) {
        ctx.report = result.report;
        ctx.commit();
      } else ctx.repository.put(result.report);
      if (!(await ctx.repository.flush()))
        throw Error(
          'Your report could not be saved. Your material is kept; retry or export a backup.',
        );
      staged = [];
      $('#intake-notes').value = '';
      $('#addition-message').textContent =
        `${result.addedIds.length} added${result.skipped ? ` · ${result.skipped} duplicates skipped` : ''}. Undo removes these cards and their edits.`;
      ctx.navigate(`report/${target.id}`);
    } catch (error) {
      showError(error.message);
    } finally {
      processing = false;
      render();
    }
  }
  function syncAddition() {
    $('#addition-banner').hidden = !latestAddition || latestAddition.reportId !== ctx.report?.id;
  }
  document.querySelectorAll('[data-example]').forEach((button) => {
    button.onclick = () => stage([dataExample(button.dataset.example)]);
  });
  $('#intake-notes').oninput = render;
  $('#notes-section').onchange = render;
  $('#split-notes').onchange = render;
  $('#intake-form').onsubmit = commit;
  $('#intake-files').onchange = (event) => stage([...event.target.files]);
  $('#intake-drop').ondragover = (event) => event.preventDefault();
  $('#intake-drop').ondrop = (event) => {
    event.preventDefault();
    stage([...event.dataTransfer.files]);
  };
  $('#dismiss-addition').onclick = () => {
    latestAddition = null;
    syncAddition();
  };
  $('#undo-addition').onclick = () => {
    if (latestAddition?.reportId !== ctx.report.id) return;
    ctx.report.cards = ctx.report.cards.filter((card) => !latestAddition.ids.includes(card.id));
    ctx.report.sources = ctx.report.sources.filter(
      (source) => !latestAddition.fingerprints.includes(source.fingerprint),
    );
    latestAddition = null;
    ctx.commit();
    ctx.render();
    syncAddition();
    toast('Latest batch removed');
  };
  $('#material-list').onchange = (event) => {
    if (processing) return;
    const input = event.target;
    if (input.dataset.sourceSection !== undefined) {
      staged[Number(input.dataset.sourceSection)].destination = input.value;
      if (input.value !== 'auto')
        staged[Number(input.dataset.sourceSection)].cards.forEach((card) =>
          assignSection(card, input.value),
        );
    } else if (input.dataset.stageSection || input.dataset.include) {
      const [source, index] = (input.dataset.stageSection || input.dataset.include)
        .split(':')
        .map(Number);
      if (input.dataset.include) staged[source].cards[index].excluded = !input.checked;
      else assignSection(staged[source].cards[index], input.value);
    }
    const open = [...document.querySelectorAll('#material-list details')].map((node) => node.open);
    render();
    document.querySelectorAll('#material-list details').forEach((node, i) => {
      node.open = open[i];
    });
  };
  $('#material-list').onclick = (event) => {
    const button = event.target.closest('[data-remove-material]');
    if (button && !processing) {
      staged.splice(Number(button.dataset.removeMaterial), 1);
      render();
    }
  };
  return {
    prepare,
    async loadExample(notes) {
      if (processing) return;
      if ($('#intake-notes').value.trim() || staged.length) {
        toast(
          'Your material is already here. Create an update or clear it before loading the example.',
        );
        return;
      }
      $('#intake-notes').value = notes;
      $('#split-notes').checked = true;
      await stage([
        new File(['title,value,target\nDevices deployed,80,100'], 'example-metrics.csv', {
          type: 'text/csv',
        }),
      ]);
      toast('Example loaded. Create your update to edit it.');
      $('#create-report').focus();
    },
    syncAddition,
    hasPending: () => processing || staged.length > 0 || Boolean($('#intake-notes').value.trim()),
  };
}
