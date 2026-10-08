import { $, showError, toast } from '../../shared/ui.js';
import { icon } from '../../shared/icons.js';
import { escapeHTML as e } from '../../domain/export.js';
export function createLibraryPage(ctx) {
  function render() {
    const trash = location.hash === '#trash';
    const query = $('#library-search').value.trim().toLowerCase();
    const reports = ctx.repository.reports
      .filter((r) => Boolean(r.deletedAt) === trash)
      .filter((r) =>
        `${r.title} ${r.period} ${r.cards.map((c) => `${c.title} ${c.body}`).join(' ')}`
          .toLowerCase()
          .includes(query),
      )
      .sort((a, b) =>
        $('#library-sort').value === 'title'
          ? a.title.localeCompare(b.title)
          : (b.updatedAt || '').localeCompare(a.updatedAt || ''),
      );
    $('#library-heading').textContent = trash ? 'Trash' : 'My reports';
    $('#library-description').textContent = trash
      ? 'Removed reports stay here until you restore them.'
      : 'A place for progress, decisions, and what comes next.';
    $('#report-total').textContent =
      ctx.repository.reports.filter((r) => !r.deletedAt).length || '';
    $('#library-results').textContent =
      `${reports.length} ${reports.length === 1 ? 'report' : 'reports'}${query ? ' found' : ''}`;
    $('#report-library').innerHTML = reports
      .map((report) => {
        const date =
          report.updatedAt && !Number.isNaN(Date.parse(report.updatedAt))
            ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                new Date(report.updatedAt),
              )
            : 'Just now';
        return `<article class="library-card"><button class="library-open" data-open-report="${report.id}" ${trash ? 'disabled' : ''} aria-label="Open ${e(report.title || 'Untitled report')}"><span class="document-mark">${icon('file')}</span><h3>${e(report.title || 'Untitled report')}</h3><p>${e(report.period || 'No reporting period')}</p><p class="library-excerpt">${e(
          report.cards
            .slice(0, 3)
            .map((c) => c.title)
            .join(' · ') || 'Ready for your first update',
        )}</p></button><div class="library-actions"><span>${report.cards.length} updates · ${e(date)}</span><button class="text-button" ${trash ? 'data-restore-report' : 'data-delete-report'}="${report.id}">${trash ? 'Restore' : 'Move to Trash'}</button></div></article>`;
      })
      .join('');
    $('#library-empty').hidden = Boolean(reports.length) || trash || Boolean(query);
    if (!reports.length && (trash || query))
      $('#report-library').innerHTML =
        `<p class="empty">${trash ? 'Trash is empty.' : 'No matching reports. Try another search.'}</p>`;
  }
  $('#library-search').oninput = render;
  $('#library-sort').onchange = render;
  $('#report-library').onclick = (event) => {
    const open = event.target.closest('[data-open-report]');
    if (open) return ctx.navigate(`report/${open.dataset.openReport}`);
    const remove = event.target.closest('[data-delete-report]');
    const restore = event.target.closest('[data-restore-report]');
    const id = remove?.dataset.deleteReport || restore?.dataset.restoreReport;
    if (!id) return;
    const report = ctx.repository.reports.find((r) => r.id === id);
    if (remove) report.deletedAt = new Date().toISOString();
    else delete report.deletedAt;
    ctx.repository.put(report);
    ctx.repository.flush();
    render();
    toast(
      remove ? 'Moved to Trash' : 'Report restored',
      remove
        ? {
            label: 'Undo',
            action: () => {
              delete report.deletedAt;
              ctx.repository.put(report);
              render();
            },
          }
        : undefined,
    );
  };
  $('#restore-library').onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 256 * 1024 * 1024) throw Error('Use a backup below 256 MB.');
      const copies = ctx.repository.restore(await file.text());
      if (!(await ctx.repository.flush()))
        throw Error('Restored copies are not yet saved. Keep this window open and retry.');
      render();
      toast(`${copies.length} reports restored as separate copies`);
    } catch (error) {
      showError(error.message);
    } finally {
      event.target.value = '';
    }
  };
  return { render };
}
