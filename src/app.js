import { reportStorage } from './platform/desktop.js';
import { installNativeCapture } from './features/native-capture/native-capture.js';
import { createRiskReview } from './features/risk-review/risk-review.js';
import { initIcons } from './shared/icons.js';
import { $, initShell, showError } from './shared/ui.js';
import { ReportRepository } from './data/report-repository.js';
import { createReportPage } from './features/reports/report-page.js';
import { createIntakePage } from './features/intake/intake-page.js';
import { createLibraryPage } from './features/library/library-page.js';
import { createAIReview } from './features/ai-review/ai-review.js';
import { createSharing } from './features/sharing/sharing.js';
import { exampleReport, exampleNotes } from './features/intake/example.js';
import { reportFragment } from './domain/export.js';

await reportStorage.ready;
initShell();
initIcons();
const repository = new ReportRepository(reportStorage, {
  onStatus: (message) => {
    $('#save-status').textContent = message;
    $('#persistence-status').textContent = message;
  },
  onError: showError,
});
repository.load();
const ctx = {
  repository,
  report: null,
  history: new Map(),
  commit() {
    if (!this.report) return;
    let state = this.history.get(this.report.id);
    if (!state) {
      state = { past: [], future: [], present: JSON.stringify(this.report) };
      this.history.set(this.report.id, state);
    }
    const next = JSON.stringify(this.report);
    if (next !== state.present) {
      state.past.push(state.present);
      state.past = state.past.slice(-50);
      while (
        state.past.length > 1 &&
        state.past.reduce((size, item) => size + item.length * 2, 0) > 16 * 1024 * 1024
      )
        state.past.shift();
      state.future = [];
      state.present = next;
    }
    repository.put(this.report);
    this.updateHistory();
    document.title = `${this.report.title || 'Untitled report'} — Brief`;
    window.briefHost
      ?.send('title', { title: this.report.title || 'Untitled report' })
      .catch(() => {});
  },
  updateHistory() {
    const state = this.history.get(this.report?.id);
    $('#undo-report').disabled = !state?.past.length;
    $('#redo-report').disabled = !state?.future.length;
  },
  undo(redo = false) {
    const state = this.history.get(this.report?.id);
    if (!state) return;
    const from = redo ? state.future : state.past;
    if (!from.length) return;
    (redo ? state.past : state.future).push(state.present);
    state.present = from.pop();
    this.report = JSON.parse(state.present);
    repository.put(this.report);
    this.render();
    this.updateHistory();
  },
  render() {
    this.reportPage.render();
  },
  navigate(path) {
    repository.flush();
    if (location.hash === `#${path}`) route();
    else location.hash = path;
  },
  shareCard(id) {
    sharing.share(id);
  },
};
ctx.reportPage = createReportPage(ctx);
const intake = createIntakePage(ctx);
const library = createLibraryPage(ctx);
const sharing = createSharing(ctx);
$('#retry-save').onclick = async () => {
  if (await repository.flush()) $('#error-banner').hidden = true;
};
$('#error-backup').onclick = () => $('#backup-library').click();
const aiReview = createAIReview(ctx);
const riskReview = createRiskReview(ctx);
$('#risk-review-report').onclick = () => riskReview.open();
$('#sample-preview').innerHTML = reportFragment(exampleReport());

function setPanel(panel) {
  $('.composer').dataset.panel = panel;
  document.querySelectorAll('.mobile-views button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.panel === panel));
  });
}
function route() {
  repository.flush();
  const path = location.hash.slice(1);
  ctx.report = repository.reports.find((item) => path === `report/${item.id}`) || null;
  const editing = Boolean(ctx.report) && !ctx.report.deletedAt;
  if (!editing) ctx.report = null;
  const creating = path === 'new' || path === 'home';
  if (editing && !ctx.history.has(ctx.report.id))
    ctx.history.set(ctx.report.id, { past: [], future: [], present: JSON.stringify(ctx.report) });
  ctx.updateHistory();
  document.body.dataset.page = editing
    ? 'report'
    : creating
      ? 'new'
      : path === 'trash'
        ? 'trash'
        : 'library';
  document.body.dataset.material = 'closed';
  $('#toggle-material').setAttribute('aria-expanded', 'false');
  for (const [id, selected] of [
    ['all-reports', !editing && !creating && path !== 'trash'],
    ['new-report', creating],
    ['trash-reports', path === 'trash'],
  ]) {
    if (selected) $('#' + id).setAttribute('aria-current', 'page');
    else $('#' + id).removeAttribute('aria-current');
  }
  $('#home-page').hidden = !creating;
  $('#report-toolbar').hidden = !editing;
  $('#builder-view').hidden = !editing;
  $('#sample-preview').hidden = editing;
  $('#source-material').hidden = !editing;
  $('#library-section').hidden = editing || creating;
  $('#try-example').hidden = editing;
  $('#preview-label').textContent = editing ? 'EDITABLE REPORT' : 'EXAMPLE';
  if (editing) ctx.render();
  else library.render();
  intake.prepare();
  setPanel(editing ? 'preview' : 'material');
  document.title = editing
    ? `${ctx.report.title || 'Weekly update'} — Brief`
    : 'Brief — Your weekly update, ready to send.';
  $('#main-content').focus({ preventScroll: true });
  window.briefHost
    ?.send('title', {
      title: editing
        ? ctx.report.title || 'Untitled report'
        : creating
          ? 'New report'
          : 'My reports',
    })
    .catch(() => {});
  window.scrollTo(0, 0);
}
$('#home-new').onclick = $('#all-reports').onclick = () => ctx.navigate('library');
$('#trash-reports').onclick = () => ctx.navigate('trash');
for (const id of ['new-report', 'library-new', 'empty-new'])
  $('#' + id).onclick = () => ctx.navigate('new');
$('.brand').onclick = (event) => {
  event.preventDefault();
  ctx.navigate('library');
};
$('#library-example').onclick = () => {
  ctx.navigate('new');
  intake.loadExample(exampleNotes);
};
$('#toggle-material').onclick = () => {
  const open = document.body.dataset.material !== 'open';
  document.body.dataset.material = open ? 'open' : 'closed';
  $('#toggle-material').setAttribute('aria-expanded', String(open));
  if (open) $('#intake-notes').focus();
};
$('#close-material').onclick = () => {
  document.body.dataset.material = 'closed';
  $('#toggle-material').setAttribute('aria-expanded', 'false');
  $('#toggle-material').focus();
};
$('#undo-report').onclick = () => ctx.undo();
$('#redo-report').onclick = () => ctx.undo(true);
document.addEventListener('keydown', (event) => {
  if (!(event.metaKey || event.ctrlKey)) return;
  const typing = event.target.matches('input,textarea,[contenteditable]');
  if (
    event.key.toLowerCase() === 'z' &&
    !typing &&
    ctx.report &&
    !document.querySelector('dialog[open]')
  ) {
    event.preventDefault();
    ctx.undo(event.shiftKey);
  }
  if (event.key.toLowerCase() === 'n' && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    ctx.navigate('new');
  }
  if (event.key === ',') {
    event.preventDefault();
    $('#settings-button').click();
  }
});
window.briefCommand = (command) => {
  if (
    ['undo', 'redo'].includes(command) &&
    document.activeElement.matches('input,textarea,[contenteditable]')
  ) {
    document.execCommand(command);
    return;
  }
  if (document.querySelector('dialog[open]') && command !== 'settings') return;
  ({
    new: () => ctx.navigate('new'),
    library: () => ctx.navigate('library'),
    settings: () => $('#settings-button').click(),
    export: () => ctx.report && sharing.exportReport(),
    share: () => ctx.report && sharing.share(),
    undo: () => ctx.undo(),
    redo: () => ctx.undo(true),
  })[command]?.();
};
$('#try-example').onclick = () => intake.loadExample(exampleNotes);
$('#ai-review-report').onclick = () => aiReview.open();
document.querySelectorAll('.mobile-views button').forEach((button) => {
  button.onclick = () => setPanel(button.dataset.panel);
});
window.addEventListener('hashchange', route);
window.addEventListener('beforeunload', (event) => {
  repository.flush();
  if (repository.dirty || intake.hasPending()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) repository.flush();
});
window.addEventListener('unhandledrejection', (event) =>
  showError(event.reason?.message || 'The action failed. Your current session is still available.'),
);
route();
delete document.body.dataset.loading;

installNativeCapture(ctx, intake);
