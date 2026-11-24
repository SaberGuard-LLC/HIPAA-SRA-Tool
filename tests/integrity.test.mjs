import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { loadContext, globalsOf, read } from './helpers.mjs';

const ctx = loadContext(['assets/catalog.js', 'assets/format.js', 'assets/integrity.js', 'assets/ephi-map.js', 'assets/report.js', 'assets/ward.js']);
const { SRAIntegrity, SRAFormat, SRAReport, SRAWard, FILE_FORMAT } = globalsOf(ctx, ['SRAIntegrity', 'SRAFormat', 'SRAReport', 'SRAWard', 'FILE_FORMAT']);
const plain = v => JSON.parse(JSON.stringify(v));
const nodeHash = buf => createHash('sha256').update(buf).digest('hex');
const v3 = JSON.parse(read('tests/fixtures/example-v3.json'));
const v4 = JSON.parse(read('tests/fixtures/example-v4.json'));

test('the synchronous SHA-256 matches the published vectors and Node at block boundaries', () => {
  assert.equal(SRAIntegrity.sha256Text(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(SRAIntegrity.sha256Text('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const n of [1, 55, 56, 63, 64, 65, 119, 120, 1000, 70000]) {
    const buf = randomBytes(n);
    assert.equal(SRAIntegrity.sha256Bytes(new Uint8Array(buf)), nodeHash(buf), `length ${n}`);
  }
  assert.equal(SRAIntegrity.sha256Text('Évaluation des risques'), nodeHash(Buffer.from('Évaluation des risques', 'utf8')));
});

test('file hashes use Web Crypto and match the synchronous hash', async () => {
  const buf = randomBytes(300000);
  assert.equal(await SRAIntegrity.sha256File(new Uint8Array(buf)), nodeHash(buf));
  const url = `data:application/pdf;base64,${buf.toString('base64')}`;
  assert.equal(nodeHash(Buffer.from(SRAIntegrity.dataUrlBytes(url))), nodeHash(buf));
  assert.equal(SRAIntegrity.toBase64(new Uint8Array(buf)), buf.toString('base64'));
});

test('a hash is shortened to its first and last eight characters, grouped in fours', () => {
  const h = '4f1c92ab' + '0'.repeat(48) + '07d39a2e';
  assert.equal(SRAIntegrity.shortHash(h), '4f1c 92ab … 07d3 9a2e');
  assert.equal(SRAIntegrity.shortHash('not a hash'), '');
  assert.equal(SRAIntegrity.grouped(h).split(' ').length, 8);
});

test('evidence keeps its SHA-256, date added and source through a save and open; invalid values are dropped', () => {
  const hash = 'a'.repeat(64);
  const state = SRAFormat.upgrade({ format: FILE_FORMAT.name, version: 5, controls: { A01: { status: 'met', evidence: [
    { name: 'policy.pdf', type: 'application/pdf', size: 3, data: 'data:application/pdf;base64,YWJj', sha256: hash.toUpperCase(), addedAt: '2026-11-20', source: 'upload' },
    { name: 'bad.pdf', type: 'application/pdf', size: 3, data: 'data:application/pdf;base64,YWJj', sha256: 'xyz', addedAt: 'yesterday', source: 'email' }
  ] } } });
  const [good, bad] = state.controls.A01.evidence;
  assert.equal(good.sha256, hash);
  assert.equal(good.addedAt, '2026-11-20');
  assert.equal(good.source, 'upload');
  assert.equal(bad.sha256, undefined);
  assert.equal(bad.addedAt, undefined);
  assert.equal(bad.source, undefined);
  const file = plain(SRAFormat.serialize(state));
  assert.equal(file.version, 5);
  assert.deepEqual(file.controls.A01.evidence[0], { name: 'policy.pdf', type: 'application/pdf', size: 3, sha256: hash, addedAt: '2026-11-20', source: 'upload', data: 'data:application/pdf;base64,YWJj' });
  const lean = plain(SRAFormat.serialize(state, { includeEvidence: false }));
  assert.deepEqual(lean.controls.A01.evidence[0], { name: 'policy.pdf', type: 'application/pdf', size: 3, sha256: hash, addedAt: '2026-11-20', source: 'upload', omitted: true });
});

for (const [label, fixture] of [['version 1', { responses: { A01: 2, A02: 1 }, notes: { A02: 'partly' } }], ['version 3', v3], ['version 4', v4]]) {
  test(`a ${label} file opens, saves as version 5 and reopens with nothing lost`, () => {
    const first = SRAFormat.upgrade(plain(fixture));
    const saved = plain(SRAFormat.serialize(first));
    assert.equal(saved.version, 5);
    const again = SRAFormat.upgrade(saved);
    const resaved = plain(SRAFormat.serialize(again));
    for (const f of [saved, resaved]) { delete f.exportedAt; delete f.savedAt; }
    assert.deepEqual(resaved, saved);
    for (const [id, c] of Object.entries(first.controls)) {
      assert.equal(again.controls[id].status, c.status, id);
      assert.equal(again.controls[id].notes, c.notes, id);
      assert.equal(again.controls[id].evidence.length, c.evidence.length, id);
    }
    assert.equal(again.risks.length, first.risks.length);
    assert.equal(again.assets.length, first.assets.length);
  });
}

test('a version 4 file marked Final still prints as Final after it is saved as version 5', () => {
  const data = JSON.parse(read('samples/example-health-clinic-hipaa-sra-2026-09-06.json'));
  data.version = 4;
  const state = SRAFormat.upgrade(SRAFormat.serialize(SRAFormat.upgrade(data)));
  assert.equal(SRAReport.stats(state).isDraft, false);
});

test('the fingerprint is stable across a save and open, and ignores save times and embedded bytes', () => {
  const state = SRAFormat.upgrade(plain(v4));
  const a = SRAIntegrity.fingerprint(SRAFormat.serialize(state));
  assert.match(a, /^[0-9a-f]{64}$/);
  const reopened = SRAFormat.upgrade(plain(SRAFormat.serialize(state)));
  reopened.savedAt = '2030-01-01T00:00:00.000Z';
  assert.equal(SRAIntegrity.fingerprint(SRAFormat.serialize(reopened)), a);
  assert.equal(SRAIntegrity.fingerprint(SRAFormat.serialize(state, { includeEvidence: false })), a, 'a file saved without evidence has the same fingerprint');
  const raw = plain(SRAFormat.serialize(state));
  assert.equal(SRAIntegrity.fingerprint(raw), a, 'the fingerprint of the saved JSON equals the one printed');
});

test('the fingerprint changes when any recorded field changes', () => {
  const base = SRAFormat.upgrade(plain(v4));
  const original = SRAIntegrity.fingerprint(SRAFormat.serialize(base));
  const firstControl = Object.keys(base.controls)[0];
  const edits = [
    s => { s.meta.orgName += ' '; },
    s => { s.meta.reportStatus = s.meta.reportStatus === 'Final' ? 'Draft' : 'Final'; },
    s => { s.assets[0].name += 'x'; },
    s => { s.flows[0].inTransit = s.flows[0].inTransit === 'yes' ? 'no' : 'yes'; },
    s => { s.controls[firstControl].notes += '.'; },
    s => { s.risks[0].owner += 'x'; },
    s => { s.controls.A01.evidence.push({ name: 'x.txt', type: 'text/plain', size: 1, omitted: true, sha256: 'b'.repeat(64) }); }
  ];
  edits.forEach((edit, i) => {
    const s = SRAFormat.upgrade(plain(SRAFormat.serialize(base)));
    edit(s);
    assert.notEqual(SRAIntegrity.fingerprint(SRAFormat.serialize(s)), original, `edit ${i}`);
  });
  const withHash = SRAFormat.upgrade(plain(SRAFormat.serialize(base)));
  withHash.controls.A01.evidence.push({ name: 'x.txt', type: 'text/plain', size: 1, omitted: true, sha256: 'b'.repeat(64) });
  const changed = SRAFormat.upgrade(plain(SRAFormat.serialize(withHash)));
  changed.controls.A01.evidence.at(-1).sha256 = 'c'.repeat(64);
  assert.notEqual(SRAIntegrity.fingerprint(SRAFormat.serialize(changed)), SRAIntegrity.fingerprint(SRAFormat.serialize(withHash)), 'an evidence hash is part of the fingerprint');
});

test('the canonical form sorts keys at every level', () => {
  assert.equal(SRAIntegrity.canonical({ b: 1, a: { d: [3, { f: 1, e: 2 }], c: null } }), '{"a":{"c":null,"d":[3,{"e":2,"f":1}]},"b":1}');
});

test('the report prints the fingerprint on the cover, in document control and in full in Appendix B, and every evidence hash', () => {
  const state = SRAFormat.upgrade(plain(v4));
  const hash = 'd'.repeat(64);
  state.controls.A01.evidence.push({ name: 'risk-policy.pdf', type: 'application/pdf', size: 2048, omitted: true, sha256: hash, addedAt: '2026-11-20', source: 'upload' });
  const S = SRAReport.stats(state);
  const html = SRAReport.render(state, S);
  const print = SRAIntegrity.fingerprint(SRAFormat.serialize(state));
  assert.ok(html.includes(`<b class="hash">${print.slice(0, 16)}</b>`), 'cover');
  assert.ok(html.includes('Assessment file fingerprint'));
  assert.ok(html.includes(SRAIntegrity.grouped(print)), 'appendix');
  assert.ok(html.includes(SRAIntegrity.grouped(hash)), 'evidence index');
  assert.ok(html.includes('Nov 20, 2026'));
});

test('Ward attachments record Ward as their source and the date attached', () => {
  const file = SRAWard.read(JSON.parse(read('tests/fixtures/ward-evidence-example-v2.json')));
  const controls = {};
  SRAWard.apply(controls, SRAWard.plan(controls, {}, file), { today: '2026-11-24' });
  const items = Object.values(controls).flatMap(c => c.evidence);
  assert.ok(items.length > 0);
  for (const e of items) { assert.equal(e.source, 'ward'); assert.equal(e.addedAt, '2026-11-24'); }
});

test('a protected file round-trips with the default 600,000 iterations and has the agreed wrapper', async () => {
  const text = JSON.stringify({ format: FILE_FORMAT.name, version: 5, meta: { orgName: 'Example Health Clinic' } });
  const wrapper = plain(await SRAIntegrity.protect(text, 'correct horse battery'));
  assert.deepEqual(Object.keys(wrapper), ['format', 'version', 'kdf', 'cipher', 'data']);
  assert.equal(wrapper.format, 'SaberGuard HIPAA SRA (protected)');
  assert.equal(wrapper.version, 1);
  assert.deepEqual({ ...wrapper.kdf, salt: undefined }, { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: undefined });
  assert.equal(Buffer.from(wrapper.kdf.salt, 'base64').length, 16);
  assert.equal(wrapper.cipher.name, 'AES-GCM');
  assert.equal(Buffer.from(wrapper.cipher.iv, 'base64').length, 12);
  assert.ok(!wrapper.data.includes('Example'), 'the contents are not readable');
  assert.equal(await SRAIntegrity.unprotect(wrapper, 'correct horse battery'), text);
  assert.ok(SRAIntegrity.isProtected(wrapper));
});

test('a wrong passphrase, a changed byte, or another wrapper version opens nothing', async () => {
  const text = '{"format":"SaberGuard HIPAA SRA","version":5}';
  const wrapper = plain(await SRAIntegrity.protect(text, 'a long enough passphrase', { iterations: 100000 }));
  await assert.rejects(SRAIntegrity.unprotect(wrapper, 'a long enough passphrasf'), /passphrase/);
  const bytes = Buffer.from(wrapper.data, 'base64');
  bytes[5] ^= 1;
  await assert.rejects(SRAIntegrity.unprotect({ ...wrapper, data: bytes.toString('base64') }, 'a long enough passphrase'), /passphrase/, 'GCM authentication fails on tampered ciphertext');
  await assert.rejects(SRAIntegrity.unprotect({ ...wrapper, version: 2 }, 'a long enough passphrase'), /version/);
  await assert.rejects(SRAIntegrity.unprotect({ ...wrapper, kdf: { ...wrapper.kdf, iterations: 1000 } }, 'a long enough passphrase'), /format/);
  await assert.rejects(SRAIntegrity.unprotect({ ...wrapper, cipher: { ...wrapper.cipher, iv: Buffer.alloc(8).toString('base64') } }, 'a long enough passphrase'), /format/);
  await assert.rejects(SRAIntegrity.protect(text, 'too short'), /short/);
});

test('the workspace offers protected save in a modal dialog and opens protected files', () => {
  const html = read('index.html');
  const app = read('assets/app.js');
  assert.match(html, /<dialog class="dialog" id="passDialog" aria-labelledby="passTitle" aria-describedby="passDesc">/);
  assert.match(html, /id="saveProtectedBtn"/);
  assert.match(html, /<script src="assets\/integrity\.js"><\/script>/);
  assert.match(app, /dlg\.showModal\(\)/);
  assert.match(app, /addEventListener\('cancel'/);
  assert.match(app, /SRAIntegrity\.isProtected\(data\)/);
  assert.match(app, /showSaveFilePicker/);
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(read('assets/integrity.js')));
});
