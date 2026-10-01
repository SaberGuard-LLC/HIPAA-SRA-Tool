import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContext, globalsOf, read } from './helpers.mjs';

const ctx = loadContext(['assets/catalog.js', 'assets/format.js']);
const { SRAFormat, CONTROLS, CONTROL_BY_ID, V3_ID_MAP, V3_REVIEW_IDS, FILE_FORMAT } =
  globalsOf(ctx, ['SRAFormat', 'CONTROLS', 'CONTROL_BY_ID', 'V3_ID_MAP', 'V3_REVIEW_IDS', 'FILE_FORMAT']);
const plain = v => JSON.parse(JSON.stringify(v));
const v3 = JSON.parse(read('tests/fixtures/example-v3.json'));

test('the migration constants are the agreed ones', () => {
  assert.deepEqual(plain(V3_ID_MAP), { O01: 'O12', O02: 'O13', O03: 'O15' });
  assert.deepEqual([...V3_REVIEW_IDS].sort(), ['A01', 'A02', 'A05', 'A07', 'A10', 'A11', 'A12', 'A15', 'A20', 'A21', 'A22', 'A25', 'A28', 'A29', 'O12', 'O13', 'O15', 'P04']);
  for (const id of V3_REVIEW_IDS) assert.ok(CONTROL_BY_ID[id], id);
  assert.equal(FILE_FORMAT.version, 4);
});

test('a version 3 file opens: the old 164.314 answers land on O12, O13 and O15 and are marked for review', () => {
  assert.equal(v3.version, 3);
  const up = SRAFormat.upgrade(v3);
  assert.equal(up.version, 3);
  for (const [from, to] of Object.entries(plain(V3_ID_MAP))) {
    assert.equal(up.controls[to].status, v3.controls[from].status, `${from} status lands on ${to}`);
    assert.equal(up.controls[to].notes, v3.controls[from].notes, `${from} notes land on ${to}`);
    assert.equal(up.controls[to].carried, true, `${to} is marked carried`);
    assert.equal(up.controls[from], undefined, `${from} no longer exists`);
  }
  assert.equal(up.controls.O12.status, 'met');
  assert.equal(up.controls.O13.status, 'na');
  assert.equal(up.controls.O15.status, 'na');
});

test('A29 and the other changed rows are carried; unchanged rows keep their answer without a flag', () => {
  const up = SRAFormat.upgrade(v3);
  assert.equal(up.controls.A29.status, v3.controls.A29.status);
  assert.equal(up.controls.A29.carried, true);
  assert.equal(up.controls.A29.evidence.length, v3.controls.A29.evidence.length, 'evidence travels with the answer');
  assert.equal(up.controls.A03.status, v3.controls.A03.status);
  assert.equal(up.controls.A03.carried, undefined);
  const carried = Object.entries(up.controls).filter(([, c]) => c.carried).map(([id]) => id).sort();
  const expected = [...V3_REVIEW_IDS].filter(id => {
    const src = Object.entries(plain(V3_ID_MAP)).find(([, to]) => to === id)?.[0] || id;
    return v3.controls[src] && v3.controls[src].status;
  }).sort();
  assert.deepEqual(carried, expected);
  assert.deepEqual([...up.carried].sort(), expected);
});

test('new rows open as not reviewed and nothing from the version 3 file is lost', () => {
  const up = SRAFormat.upgrade(v3);
  for (const id of ['A30', 'O11', 'O14', 'O16']) {
    assert.ok(up.controls[id], id);
    assert.equal(up.controls[id].status, '');
    assert.equal(up.controls[id].carried, undefined);
  }
  assert.equal(Object.keys(up.controls).length, CONTROLS.length);
  for (const [id, c] of Object.entries(v3.controls)) {
    const target = plain(V3_ID_MAP)[id] || id;
    assert.equal(up.controls[target].notes, c.notes, `${id} notes`);
    assert.equal(up.controls[target].recommendation, c.recommendation, `${id} recommendation`);
  }
  assert.equal(up.assets.length, v3.assets.length);
  up.assets.forEach((a, i) => {
    const old = v3.assets[i];
    assert.equal(a.name, old.name); assert.equal(a.data, old.data); assert.equal(a.owner, old.owner);
    assert.equal(a.flow, old.flow, 'flow text is kept as legacy notes'); assert.equal(a.protection, old.protection);
    assert.equal(a.kind, 'unknown', 'kind is not guessed'); assert.equal(a.zone, 'unknown', 'zone is not guessed');
    assert.deepEqual([...a.lifecycle], []);
    assert.equal(a.count, 1);
  });
  assert.deepEqual([...up.flows], []);
  assert.equal(up.risks.length, v3.risks.length);
  up.risks.forEach((r, i) => {
    const old = v3.risks[i];
    assert.equal(r.description, old.description);
    assert.equal(r.legacyAssets, old.assets, 'free-text systems kept as legacy notes');
    assert.equal(r.legacyControls, old.controls, 'free-text rows kept as legacy notes');
    assert.deepEqual([...r.assetIds], []);
    for (const id of r.controlIds) assert.ok(CONTROL_BY_ID[id], `${id} parsed from "${old.controls}"`);
    assert.equal(r.likelihood, old.likelihood); assert.equal(r.impact, old.impact);
    assert.equal(r.residualLikelihood, old.residualLikelihood || ''); assert.equal(r.treatment, old.treatment);
  });
  assert.equal(up.meta.orgName, v3.meta.orgName);
  assert.equal(up.meta.entityType, '');
  assert.equal(up.savedAt, v3.savedAt);
});

test('a version 4 file round-trips', () => {
  const state = SRAFormat.upgrade(v3);
  state.meta.entityType = 'covered-entity'; state.meta.clearinghouse = 'no'; state.meta.groupHealthPlan = 'no';
  state.assets[0].kind = 'application'; state.assets[0].zone = 'systems'; state.assets[0].lifecycle = ['create', 'maintain']; state.assets[0].vendor = 'EHR vendor'; state.assets[0].baa = 'yes';
  state.flows.push(SRAFormat.newFlow({ from: state.assets[1].id, to: state.assets[0].id, twoWay: true, data: 'Referrals', transport: 'https', inTransit: 'yes' }));
  state.risks[0].assetIds = [state.assets[0].id]; state.risks[0].flowIds = [state.flows[0].id];
  state.controls.A01.basis = 'observed'; state.controls.A29.carried = false;
  const file1 = SRAFormat.serialize(state);
  assert.equal(file1.version, 4);
  assert.equal(file1.format, 'SaberGuard HIPAA SRA');
  const back = SRAFormat.upgrade(file1);
  assert.equal(back.version, 4);
  assert.deepEqual([...back.carried], []);
  const file2 = SRAFormat.serialize(back);
  delete file1.exportedAt; delete file2.exportedAt;
  assert.deepEqual(plain(file2), plain(file1));
  assert.equal(back.risks[0].assetIds[0], state.assets[0].id);
  assert.equal(back.risks[0].flowIds[0], state.flows[0].id);
  assert.equal(back.controls.A01.basis, 'observed');
  assert.equal(back.controls.A29.carried, undefined, 'a confirmed answer is no longer carried');
  assert.equal(back.controls.O12.carried, true, 'an unconfirmed carried answer stays carried through a save');
});

test('saving without evidence keeps the file names and sizes but not the contents', () => {
  const state = SRAFormat.upgrade(v3);
  const withData = Object.values(state.controls).flatMap(c => c.evidence).filter(e => e.data).length;
  assert.ok(withData > 0, 'the fixture has embedded evidence');
  const file = SRAFormat.serialize(state, { includeEvidence: false });
  assert.equal(file.evidenceIncluded, false);
  const items = Object.values(file.controls).flatMap(c => c.evidence);
  assert.equal(items.length, Object.values(state.controls).flatMap(c => c.evidence).length);
  for (const e of items) { assert.ok(e.name && e.size >= 0); assert.equal(e.data, undefined); assert.equal(e.omitted, true); }
  const back = SRAFormat.upgrade(file);
  assert.ok(Object.values(back.controls).flatMap(c => c.evidence).every(e => e.omitted));
});

test('a version 1 responses file still opens', () => {
  const up = SRAFormat.upgrade({ responses: { A01: 2, A02: 1, A03: 0 }, notes: { A02: 'partly' } });
  assert.equal(up.version, 1);
  assert.equal(up.controls.A01.status, 'met');
  assert.equal(up.controls.A02.status, 'partial');
  assert.equal(up.controls.A02.notes, 'partly');
  assert.equal(up.controls.A03.status, 'not-met');
});

test('unknown control ids are kept rather than dropped, and links to missing rows are removed', () => {
  const up = SRAFormat.upgrade({ format: 'SaberGuard HIPAA SRA', version: 4, controls: { Z99: { status: 'met', notes: 'kept' } }, assets: [{ id: 'a1', name: 'EHR' }], flows: [{ id: 'f1', from: 'a1', to: 'a1' }], risks: [{ assetIds: ['a1', 'gone'], flowIds: ['f1', 'nope'], controlIds: ['a01'] }] });
  assert.equal(up.controls.Z99.notes, 'kept');
  assert.deepEqual([...up.risks[0].assetIds], ['a1']);
  assert.deepEqual([...up.risks[0].flowIds], ['f1']);
  assert.deepEqual([...up.risks[0].controlIds], ['A01']);
});

test('files with another format are refused', () => {
  assert.throws(() => SRAFormat.upgrade({ format: 'Other', version: 4 }));
  assert.throws(() => SRAFormat.upgrade(null));
});
