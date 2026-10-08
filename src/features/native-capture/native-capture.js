import { emptyReport } from '../../domain/report.js';
import { appendMaterial } from '../../domain/materials.js';
import { readMaterial, noteCards, fingerprint } from '../intake/material-reader.js';
import { reviewDataset } from '../data-import/data-import.js';
import { reviewDocument } from '../intake/document-review.js';
import { reviewReportImport } from '../intake/report-import.js';
import { automaticMaterial } from './automatic-material.js';

export function installNativeCapture(ctx, intake) {
  const host = window.briefHost;
  if (!host) return;
  document.body.dataset.native = 'true';
  let running = false;
  const publish = () =>
    host
      .send('reports', {
        reports: ctx.repository.reports
          .filter((r) => !r.deletedAt)
          .map((r) => ({
            id: r.id,
            title: r.title,
            count: r.cards.length,
          })),
      })
      .catch(() => {});
  window.briefCapture = async (payload) => {
    if (running) throw Error('Another capture is still being reviewed.');
    if (document.querySelector('dialog[open]'))
      throw Error(
        'Finish or close the open dialog in the report window, then try again. Your capture is kept.',
      );
    if (intake.hasPending())
      throw Error(
        'Finish or remove the material already staged in the report window, then build this capture. Your capture is kept.',
      );
    if (!Array.isArray(payload.files) || payload.files.length > 20)
      throw Error('Use at most 20 files.');
    const existing = payload.destination
      ? ctx.repository.reports.find((r) => r.id === payload.destination)
      : null;
    if (payload.destination && !existing)
      throw Error('That report no longer exists. Choose a destination again.');
    running = true;
    try {
      const materials = [];
      for (const item of payload.files) {
        const bytes = Uint8Array.from(atob(item.data), (c) => c.charCodeAt(0));
        let material = await readMaterial(new File([bytes], item.name, { type: item.type }), true);
        if (material.reportBackup) {
          if (payload.files.length !== 1 || payload.notes.trim() || existing)
            throw Error(
              'Open a report backup on its own as a new report, then add more material to it.',
            );
          const before = new Set(
            ctx.repository.reports.filter((r) => !r.deletedAt).map((r) => r.id),
          );
          await reviewReportImport(material, ctx);
          const report = ctx.repository.reports.find((r) => !before.has(r.id));
          await publish();
          return {
            consumed: Boolean(report),
            reportId: report?.id || '',
            message: report
              ? 'Report opened as a separate copy.'
              : 'Import cancelled. Your capture is kept.',
          };
        }
        if (material.dataset)
          material = (await automaticMaterial(material)) || (await reviewDataset(material));
        else if (material.document) material = await reviewDocument(material);
        if (!material)
          return {
            consumed: false,
            message: 'Review cancelled. Your capture is kept; no report cards were added.',
          };
        materials.push(material);
      }
      if (payload.notes.trim()) {
        const bytes = new TextEncoder().encode(payload.notes);
        if (bytes.length > 2 * 1024 * 1024) throw Error('Notes exceed 2 MB.');
        materials.push({
          name: 'Captured notes',
          fingerprint: await fingerprint(bytes),
          cards: noteCards(payload.notes, 'Captured notes', true),
        });
      }
      if (!materials.length) throw Error('Add notes or a file first.');
      // Review can take time. Append to the latest report, preserving edits made meanwhile.
      const latest = existing && ctx.repository.reports.find((r) => r.id === existing.id);
      if (existing && !latest)
        throw Error('That report was removed during review. Your capture is kept.');
      const report = latest || {
        ...emptyReport(payload.title.trim() || 'Project update'),
        template: payload.template === 'retrospective' ? 'retrospective' : 'standard',
      };
      const result = appendMaterial(report, materials);
      if (!result.addedIds.length) throw Error('These sources are already in this report.');
      ctx.repository.put(result.report);
      if (!(await ctx.repository.flush()))
        throw Error(
          'The draft could not be saved. Export it from the report window; your capture is kept.',
        );
      ctx.navigate(`report/${report.id}`);
      await publish();
      return {
        consumed: true,
        reportId: report.id,
        message: `${result.addedIds.length} cards ready to review${result.skipped ? `; ${result.skipped} duplicate sources skipped` : ''}.`,
      };
    } finally {
      running = false;
    }
  };
  window.briefOpenReport = (id) => ctx.navigate(id ? `report/${id}` : 'library');
  window.briefReportCount = () => ctx.repository.reports.length;
  window.briefFlush = () => ctx.repository.flush();
  ctx.repository.onChange = publish;
  window.addEventListener('hashchange', publish);
  publish();
  host.send('ready', {}).catch(() => {});
}
