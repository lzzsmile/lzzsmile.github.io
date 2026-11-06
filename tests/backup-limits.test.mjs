import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_BACKUP_BYTES, createBackup, validateBackup} from '../calendar.js';

const event = (id, note = '') => ({
  id, title: '备份往返验证', calendar: 'solar', year: 2026, month: 11, day: 6,
  repeat: 'annual', note, pinned: true,
  reminders: [{daysBefore: 7, time: '09:30'}, {daysBefore: 0, time: '18:00'}],
  createdAt: '2026-11-06T00:00:00.000Z',
});
const bytes = value => Buffer.byteLength(value, 'utf8');
const tooLarge = error => error instanceof Error && /过大|超过.*24/.test(error.message);

test('backups share one 24 MiB UTF-8 byte limit', () => {
  assert.equal(MAX_BACKUP_BYTES, 24 * 1024 * 1024);
});

test('escaped notes producing more than six million characters round-trip', () => {
  const events = Array.from({length: 750}, (_, i) => event(`quotes_${i}`, '"'.repeat(4000)));
  const json = createBackup(events);
  assert.ok(json.length > 6_000_000, 'reproduce the former string-length rejection');
  assert.ok(bytes(json) < MAX_BACKUP_BYTES);
  const restored = validateBackup(json);
  assert.equal(restored.length, events.length);
  for (let i = 0; i < events.length; i++) {
    assert.equal(restored[i].id, events[i].id);
    assert.equal(restored[i].note, events[i].note);
    assert.deepEqual(restored[i].reminders, events[i].reminders);
  }
  assert.deepEqual(validateBackup(createBackup(restored)), restored);
});

test('one thousand multilingual records preserve UTF-8 content and exported JSON', () => {
  const note = '纪念日🌷'.repeat(800);
  assert.equal(note.length, 4000);
  const events = Array.from({length: 1000}, (_, i) => ({
    ...event(`unicode_${i}`, note), title: `家人 · café · تذكار · ${i}`, emoji: '🌷',
  }));
  const json = createBackup(events);
  assert.ok(bytes(json) > json.length);
  assert.ok(bytes(json) > 6_000_000);
  assert.ok(bytes(json) <= MAX_BACKUP_BYTES);
  const restored = validateBackup(json);
  assert.equal(restored.length, 1000);
  for (let i = 0; i < events.length; i++) {
    assert.equal(restored[i].title, events[i].title);
    assert.equal(restored[i].note, note);
    assert.equal(restored[i].emoji, '🌷');
    assert.equal(restored[i].pinned, true);
  }
  assert.deepEqual(validateBackup(createBackup(restored)), restored);
});

test('valid JSON at the exact byte limit is accepted; one further byte is rejected', () => {
  const base = createBackup([]);
  const atLimit = base + ' '.repeat(MAX_BACKUP_BYTES - bytes(base));
  assert.equal(bytes(atLimit), MAX_BACKUP_BYTES);
  assert.deepEqual(validateBackup(atLimit), []);
  assert.throws(() => validateBackup(atLimit + ' '), tooLarge);
});

test('oversized multibyte JSON is rejected by bytes before record validation', () => {
  const raw = JSON.stringify({
    version: 1, app: 'days-matter', exportedAt: '2026-11-06T00:00:00.000Z',
    events: [event('oversize_unicode', '界'.repeat(Math.ceil(MAX_BACKUP_BYTES / 3)))],
  });
  assert.ok(raw.length < MAX_BACKUP_BYTES, 'character count alone would allow this input');
  assert.ok(bytes(raw) > MAX_BACKUP_BYTES);
  assert.throws(() => validateBackup(raw), tooLarge);
});

test('serialization cannot create an over-limit backup from individually valid records', () => {
  // JSON escapes lone surrogates to six ASCII bytes each. All field lengths and
  // record counts remain valid, but their serialized representation is too large.
  const events = Array.from({length: 1000}, (_, i) => ({
    ...event(`escaped_${i}`, '\ud800'.repeat(4000)),
    title: '\ud800'.repeat(120), category: '\ud800'.repeat(40),
    emoji: '\ud800'.repeat(24), color: '\ud800'.repeat(40),
  }));
  assert.throws(() => createBackup(events), tooLarge);
});
