import test from 'node:test';
import { setImmediate } from 'node:timers';
import assert from 'node:assert/strict';
import {
  ReportRepository,
  LIBRARY_KEY,
  backupDTO,
  parseBackup,
  MAX_STORAGE_BYTES,
} from '../src/data/report-repository.js';
import {
  emptyReport,
  createCard,
  checks,
  isReport,
  isImageData,
  percent,
} from '../src/domain/report.js';
import { cardHTML, cardText, reportHTML } from '../src/domain/export.js';
import { splitNotes } from '../src/domain/materials.js';
const memory = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('async flush drains edits made while a write is in flight', async () => {
  const storage = memory();
  const write = storage.setItem;
  let finish;
  storage.setItem = async (key, value) => {
    await new Promise((resolve) => {
      finish = resolve;
    });
    write(key, value);
  };
  const repo = new ReportRepository(storage, { delay: 10000 });
  repo.load();
  const report = emptyReport('First');
  repo.put(report);
  const flush = repo.flush();
  report.title = 'Latest';
  repo.put(report);
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  finish();
  assert.equal(await flush, true);
  assert.equal(repo.dirty, false);
  assert.equal(JSON.parse(storage.getItem(LIBRARY_KEY))[0].title, 'Latest');
});

test('async write failure is reported and can be retried without losing edits', async () => {
  const storage = memory();
  const write = storage.setItem;
  storage.setItem = async () => {
    throw Error('Disk full');
  };
  const repo = new ReportRepository(storage);
  repo.load();
  repo.put(emptyReport('Kept in memory'));
  assert.equal(await repo.flush(), false);
  assert.equal(repo.dirty, true);
  storage.setItem = async (...args) => write(...args);
  assert.equal(await repo.flush(), true);
  assert.equal(repo.dirty, false);
});

test('failed persistence remains dirty until a successful retry', () => {
  const storage = memory();
  let fail = true;
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (fail) throw Error('Quota exceeded');
    write(key, value);
  };
  const repo = new ReportRepository(storage);
  repo.load();
  repo.put(emptyReport('Demo'));
  assert.equal(repo.flush(), false);
  assert.equal(repo.dirty, true);
  fail = false;
  assert.equal(repo.flush(), true);
  assert.equal(repo.dirty, false);
  assert.equal(JSON.parse(storage.getItem(LIBRARY_KEY))[0].title, 'Demo');
});
test('unreadable data stays protected while session work can be backed up', () => {
  const storage = memory();
  storage.setItem(LIBRARY_KEY, 'broken');
  const repo = new ReportRepository(storage);
  repo.load();
  repo.put(emptyReport('Session'));
  assert.equal(repo.flush(), false);
  assert.equal(storage.getItem(LIBRARY_KEY), 'broken');
  assert.equal(parseBackup(JSON.stringify(backupDTO(repo.reports)))[0].title, 'Session');
});
test('backup round trip preserves assets and relationships without replacing existing reports', () => {
  const report = emptyReport('Pilot');
  report.people = [{ id: 'sam', name: 'Sam', role: 'Lead' }];
  report.cards = [
    createCard('image', {
      image: 'data:image/png;base64,YQ==',
      alt: 'Chart',
      owner: 'sam',
      mentions: ['sam'],
    }),
  ];
  const repo = new ReportRepository(memory());
  repo.put(report);
  repo.flush();
  const copies = repo.restore(JSON.stringify(backupDTO([report])));
  repo.flush();
  assert.equal(repo.reports.length, 2);
  assert.notEqual(copies[0].id, report.id);
  assert.deepEqual(copies[0].cards, report.cards);
});
test('invalid restore is atomic and rejects executable attributes and dangling references', () => {
  const repo = new ReportRepository(memory());
  repo.put(emptyReport('Existing'));
  repo.flush();
  for (const fields of [
    { image: 'data:image/png;base64,YQ==" onerror="alert(1)' },
    { image: 42 },
    { owner: 'missing' },
    { mentions: ['missing'] },
  ]) {
    const report = emptyReport('Bad');
    report.cards = [createCard('image', fields)];
    assert.throws(() => repo.restore(JSON.stringify(backupDTO([report]))));
  }
  assert.equal(repo.reports.length, 1);
});
test('duplicate identifiers and unsupported backup versions are rejected', () => {
  const report = emptyReport('D');
  const card = createCard();
  report.cards = [card, card];
  assert.equal(isReport(report), false);
  assert.throws(() =>
    parseBackup(JSON.stringify({ format: 'brief-library', version: 100, reports: [] })),
  );
});
test('another tab cannot be silently overwritten', () => {
  const storage = memory(),
    a = new ReportRepository(storage),
    b = new ReportRepository(storage);
  a.load();
  b.load();
  a.put(emptyReport('A'));
  a.flush();
  b.put(emptyReport('B'));
  assert.equal(b.flush(), false);
  assert.equal(b.dirty, true);
  assert.equal(JSON.parse(storage.getItem(LIBRARY_KEY))[0].title, 'A');
});
test('storage budget fails visibly and preserves the last saved library', () => {
  const storage = memory(),
    repo = new ReportRepository(storage);
  const report = emptyReport('Small');
  repo.put(report);
  repo.flush();
  report.cards = [createCard('update', { body: 'x'.repeat(MAX_STORAGE_BYTES) })];
  repo.put(report);
  assert.equal(repo.flush(), false);
  assert.equal(repo.dirty, true);
  assert.equal(JSON.parse(storage.getItem(LIBRARY_KEY))[0].cards.length, 0);
});
test('single-card exports omit unrelated report content and escape malicious values', () => {
  const report = emptyReport('Private report title');
  const card = createCard('image', {
    title: '<script>bad()</script>',
    image: 'data:image/png;base64,YQ==" onerror="bad()',
    alt: 'Description',
  });
  assert.equal(isImageData(card.image), false);
  assert.ok(!cardHTML(report, card).includes('<img'));
  assert.ok(!cardHTML(report, card).includes('<script>'));
  assert.ok(!cardText(report, card).includes(report.title));
  assert.ok(reportHTML({ ...report, cards: [card] }).includes('name="viewport"'));
});
test('whitespace descriptions and missing assets cannot pass content checks', () => {
  const issues = checks([createCard('image', { alt: '   ' })]);
  assert.equal(issues.length, 2);
  assert.equal(percent(1e308, 0.000001), null);
  assert.equal(percent(true, 100), null);
  assert.equal(percent(-1, 100), null);
});
test('paragraph splitting preserves wording and is explicitly optional', () => {
  const text = 'Progress\nPilot live.\n\nBlockers\nNeed access.';
  assert.deepEqual(splitNotes(text, false), [text]);
  assert.deepEqual(splitNotes(text, true), ['Progress\nPilot live.', 'Blockers\nNeed access.']);
});

test('malformed CSV quoting and ambiguous columns cannot silently change metrics', async () => {
  const { parseMetricCSV } = await import('../src/domain/csv.js');
  for (const text of [
    'title,value,target\nx,1"2",100',
    'title,value,target\n"x"oops,1,100',
    'title,value,value,target\nx,1,2,100',
    'title,value,target\nx,1,100,extra',
  ])
    assert.throws(() => parseMetricCSV(text));
});
