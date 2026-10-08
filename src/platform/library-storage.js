/** Immutable report/asset records and an atomic manifest. Legacy libraries migrate on first save. */
const MANIFEST = 'brief-manifest-v3';
const LIBRARY = 'brief-library-v2';
const assetFields = new Set(['image', 'chartImage']);
const hash = async (text) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
export function createLibraryStorage(host) {
  let db,
    startupSnapshot,
    manifestRaw = null,
    raw = null;
  const cache = new Map(),
    known = new Set(),
    assetKeys = new Map();
  const native = host?.storage;
  async function read(key) {
    if (native) return await native.getItem(key);
    if (startupSnapshot) return startupSnapshot.get(key) ?? null;
    return (await request(db.transaction('records').objectStore('records').get(key))) ?? null;
  }
  // Read one consistent startup snapshot and reclaim unreachable autosave objects.
  // Hydration uses this snapshot even if another tab commits while it is running.
  async function snapshotAndCompact() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      const keys = store.getAllKeys(),
        values = store.getAll();
      let snapshot;
      values.onsuccess = () => {
        snapshot = new Map(keys.result.map((key, index) => [key, values.result[index]]));
        try {
          const manifest = JSON.parse(snapshot.get(MANIFEST) || 'null');
          if (!manifest || manifest.version !== 3 || !Array.isArray(manifest.reports)) return;
          const keep = new Set();
          for (const entry of manifest.reports) {
            const report = JSON.parse(snapshot.get(entry.key));
            keep.add(entry.key);
            for (const card of report.cards || [])
              for (const field of assetFields) {
                const asset = card[field]?.asset;
                if (asset) {
                  if (!snapshot.has(asset)) throw Error('Missing attachment');
                  keep.add(asset);
                }
              }
          }
          for (const key of snapshot.keys())
            if (/^(asset|report)-[a-f0-9]{64}$/.test(key) && !keep.has(key)) {
              store.delete(key);
              snapshot.delete(key);
            }
        } catch {
          /* Preserve every object if the manifest cannot be validated. */
        }
      };
      tx.oncomplete = () => resolve(snapshot);
      tx.onabort = tx.onerror = () => reject(Error('The saved library could not be opened.'));
    });
  }
  async function writeBatch(writes, expected) {
    if (native?.batch) return native.batch(writes, expected);
    if (native) {
      // Compatibility with embedded hosts providing the original adapter.
      for (const [key, value] of Object.entries(writes)) await native.setItem(key, value);
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite'),
        store = tx.objectStore('records');
      let conflict = false;
      const get = store.get(MANIFEST);
      get.onsuccess = () => {
        if (expected !== undefined && (get.result ?? null) !== expected) {
          conflict = true;
          tx.abort();
          return;
        }
        try {
          for (const [key, value] of Object.entries(writes)) store.put(value, key);
        } catch {
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          Error(
            conflict
              ? 'This library changed in another window. Export your work before reloading.'
              : 'The device could not save this report. Export a backup and retry.',
          ),
        );
      tx.onerror = () => {};
    });
  }
  async function hydrate(report) {
    for (const card of report.cards || [])
      for (const field of assetFields) {
        const ref = card[field];
        if (ref && typeof ref === 'object' && typeof ref.asset === 'string') {
          const data = await read(ref.asset);
          if (!data)
            throw Error('A saved attachment is missing. Existing files have been preserved.');
          card[field] = data;
          known.add(ref.asset);
          assetKeys.set(data, ref.asset);
        }
      }
    return report;
  }
  const ready = (async () => {
    if (!native) {
      const open = window.indexedDB.open('brief-workspace', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('records');
      db = await request(open);
      startupSnapshot = await snapshotAndCompact();
    }
    manifestRaw = await read(MANIFEST);
    if (manifestRaw) {
      const manifest = JSON.parse(manifestRaw);
      if (manifest.version !== 3 || !Array.isArray(manifest.reports))
        throw Error('Unsupported library manifest.');
      const reports = [];
      for (const entry of manifest.reports) {
        const value = await read(entry.key);
        if (!value) throw Error('A saved report is missing. Existing files have been preserved.');
        known.add(entry.key);
        reports.push(await hydrate(JSON.parse(value)));
      }
      raw = JSON.stringify(reports);
    } else raw = (await read(LIBRARY)) || (!native ? localStorage.getItem(LIBRARY) : null);
    cache.set(LIBRARY, raw);
    cache.set(
      'brief-appearance',
      (await read('brief-appearance')) ||
        (!native ? localStorage.getItem('brief-appearance') : null),
    );
    if (!raw && !native) cache.set('brief-v1', localStorage.getItem('brief-v1'));
    startupSnapshot = null;
  })();
  let failure;
  const safeReady = ready.catch((error) => {
    failure = error;
  });
  return {
    ready: safeReady,
    maxStorageBytes: 256 * 1024 * 1024,
    getItem(key) {
      if (failure) throw failure;
      return cache.get(key) ?? null;
    },
    async setItem(key, value) {
      if (failure) throw failure;
      if (key !== LIBRARY) {
        await writeBatch({ [key]: value });
        cache.set(key, value);
        return;
      }
      if (native && !native.batch) {
        await native.setItem(key, value);
        cache.set(key, value);
        return;
      }
      const writes = {},
        entries = [];
      for (const original of JSON.parse(value)) {
        const report = structuredClone(original);
        for (const card of report.cards || [])
          for (const field of assetFields)
            if (typeof card[field] === 'string' && card[field].startsWith('data:image/')) {
              const data = card[field];
              let asset = assetKeys.get(data);
              if (!asset) {
                asset = `asset-${await hash(data)}`;
                assetKeys.set(data, asset);
              }
              if (!known.has(asset)) writes[asset] = data;
              card[field] = { asset };
            }
        const content = JSON.stringify(report),
          reportKey = `report-${await hash(content)}`;
        if (!known.has(reportKey)) writes[reportKey] = content;
        entries.push({ id: report.id, key: reportKey });
      }
      const next = JSON.stringify({ version: 3, revision: crypto.randomUUID(), reports: entries });
      writes[MANIFEST] = next;
      await writeBatch(writes, manifestRaw);
      for (const key of Object.keys(writes)) known.add(key);
      manifestRaw = next;
      raw = value;
      cache.set(LIBRARY, raw);
    },
  };
}
