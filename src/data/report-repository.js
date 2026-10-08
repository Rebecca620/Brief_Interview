import { createId, isLibrary, isReport } from '../domain/report.js';
export const LIBRARY_KEY = 'brief-library-v2';
export const MAX_STORAGE_BYTES = 4 * 1024 * 1024;
export const BACKUP_VERSION = 1;

export function parseBackup(text) {
  const dto = JSON.parse(text);
  // Read legacy single-report backups as well as versioned library backups.
  const reports = isReport(dto)
    ? [{ ...dto, id: dto.id || createId() }]
    : dto?.format === 'brief-library' && dto.version === BACKUP_VERSION
      ? dto.reports
      : null;
  if (!isLibrary(reports))
    throw Error(
      'This backup has an unsupported version, invalid fields, or broken references. No reports were changed.',
    );
  return reports;
}
export const backupDTO = (reports) => ({
  format: 'brief-library',
  version: BACKUP_VERSION,
  exportedAt: new Date().toISOString(),
  reports,
});

/** A repository owns storage details. Features work with Report objects, never storage keys. */
export class ReportRepository {
  constructor(storage, { onStatus = () => {}, onError = () => {}, delay = 250 } = {}) {
    this.storage = storage;
    this.onStatus = onStatus;
    this.onError = onError;
    this.delay = delay;
    this.reports = [];
    this.dirty = false;
    this.blocked = false;
    this.timer = null;
    this.lastRaw = null;
    this.onChange = () => {};
    this.saving = null;
    this.generation = 0;
  }
  load() {
    try {
      this.lastRaw = this.storage.getItem(LIBRARY_KEY);
      if (this.lastRaw) {
        const reports = JSON.parse(this.lastRaw);
        if (!isLibrary(reports)) throw Error('Invalid library');
        this.reports = reports;
      } else {
        const legacy = this.storage.getItem('brief-v1');
        if (legacy) {
          const report = JSON.parse(legacy);
          if (!isReport(report)) throw Error('Invalid legacy draft');
          this.reports = [{ ...report, id: createId() }];
          this.dirty = true;
          this.flush();
        }
      }
    } catch {
      this.blocked = true;
      this.onError(
        'Saved reports could not be read and have not been overwritten. Work is session-only. Export your library before closing.',
      );
    }
    return this.reports;
  }
  changed() {
    this.generation += 1;
    this.dirty = true;
    this.onChange();
    this.onStatus('Unsaved changes');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }
  flush() {
    clearTimeout(this.timer);
    if (this.saving)
      return this.saving.then((saved) => (saved && this.dirty ? this.flush() : saved));
    if (!this.dirty) return true;
    try {
      if (this.blocked)
        throw Error(
          'Storage is protected after a read error or another tab changed it. Export your library before reloading.',
        );
      if (this.storage.getItem(LIBRARY_KEY) !== this.lastRaw) {
        this.blocked = true;
        throw Error(
          'Another tab changed the library. Export your work, then reload to avoid overwriting it.',
        );
      }
      const raw = JSON.stringify(this.reports);
      if (raw.length * 2 > (this.storage.maxStorageBytes || MAX_STORAGE_BYTES))
        throw Error(
          'The library is too large to save. Export a backup and reduce attachment sizes.',
        );
      const version = this.generation;
      const success = () => {
        this.lastRaw = raw;
        this.dirty = version !== this.generation;
        this.onStatus(this.dirty ? 'Saving…' : 'Saved on this device');
        return true;
      };
      const result = this.storage.setItem(LIBRARY_KEY, raw);
      if (result?.then) {
        this.onStatus('Saving…');
        this.saving = result
          .then(success)
          .catch((error) => {
            this.onStatus('Not saved · retry or export');
            this.onError(error.message);
            return false;
          })
          .finally(() => {
            this.saving = null;
          });
        return this.saving.then((saved) => (saved && this.dirty ? this.flush() : saved));
      }
      return success();
    } catch (error) {
      this.onStatus('Not saved · export before closing');
      this.onError(error.message || 'Storage is unavailable. Export before closing.');
      return false;
    }
  }
  put(report) {
    const stored = { ...report, updatedAt: new Date().toISOString() };
    const index = this.reports.findIndex((item) => item.id === report.id);
    if (index < 0) this.reports.push(stored);
    else this.reports[index] = stored;
    this.changed();
  }
  remove(id) {
    this.reports = this.reports.filter((report) => report.id !== id);
    this.changed();
  }
  restore(text) {
    const incoming = parseBackup(text);
    // Restore as copies, preserving report-local card/person relationships.
    const copies = incoming.map((report) => ({
      ...report,
      id: createId(),
      title: `${report.title} (restored)`,
      updatedAt: new Date().toISOString(),
      deletedAt: undefined,
    }));
    const combined = [...this.reports, ...copies];
    if (JSON.stringify(combined).length * 2 > (this.storage.maxStorageBytes || MAX_STORAGE_BYTES))
      throw Error(
        'This backup exceeds the available library budget. Existing reports were not changed.',
      );
    this.reports = combined;
    this.changed();
    return copies;
  }
}
