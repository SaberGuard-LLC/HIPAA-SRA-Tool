import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContext, globalsOf, read } from './helpers.mjs';

const ctx = loadContext(['assets/catalog.js', 'assets/format.js', 'assets/ward.js']);
const { SRAWard, SRAFormat, CONTROLS } = globalsOf(ctx, ['SRAWard', 'SRAFormat', 'CONTROLS']);
const fixture = () => JSON.parse(read('tests/fixtures/ward-evidence-example.json'));
const plain = v => JSON.parse(JSON.stringify(v));
const freshControls = () => Object.fromEntries(CONTROLS.map(c => [c.id, SRAFormat.newControl()]));
const decode = dataUrl => JSON.parse(decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1)));

test('a Ward evidence file is read; anything else is refused with a reason', () => {
  const file = SRAWard.read(fixture());
  assert.equal(file.client.id, 'example-clinic');
  assert.equal(file.safeguards.length, 5);

  assert.throws(() => SRAWard.read({ format: 'SaberGuard HIPAA SRA', version: 4 }), /assessment file, not a Ward evidence file/);
  assert.throws(() => SRAWard.read({ ...fixture(), version: 2 }), /version 2/);
  assert.throws(() => SRAWard.read({ ...fixture(), safeguards: 'x' }), /safeguards/);
  assert.throws(() => SRAWard.read({ ...fixture(), collection: {} }), /collection/);
  assert.throws(() => SRAWard.read(null), /not a Ward evidence file/);
  const bad = fixture();
  bad.safeguards[0].outcome = 'compliant';
  assert.throws(() => SRAWard.read(bad), /outcome/);
});

test('safeguards land on the catalog row with the same citation; unknown citations are reported, not attached', () => {
  const plan = SRAWard.plan(freshControls(), {}, SRAWard.read(fixture()));
  assert.deepEqual(plain(plan.rows.map(r => [r.citation, r.id])), [
    ['164.308(a)(3)(ii)(C)', 'A10'],
    ['164.312(d)', 'T09'],
    ['164.312(a)(1)', 'T01'],
    ['164.310(b)', 'P06']
  ]);
  assert.deepEqual(plain(plan.unmatched), ['164.999(z)']);
});

test('applying attaches one JSON file per row and never sets a status or a verification basis', () => {
  const controls = freshControls();
  const result = SRAWard.apply(controls, SRAWard.plan(controls, {}, SRAWard.read(fixture())));
  assert.deepEqual(plain(result.attached), ['A10', 'T09', 'T01', 'P06']);
  for (const c of Object.values(controls)) {
    assert.equal(c.status, '', 'status untouched');
    assert.equal(c.basis, '', 'basis untouched');
  }
  const ev = controls.A10.evidence;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].name, 'ward-example-clinic-2026-10-05-3f2a9c1b-A10.json');
  assert.equal(ev[0].type, 'application/json');
  const slice = decode(ev[0].data);
  assert.equal(slice.format, 'SaberGuard Ward evidence, one safeguard');
  assert.equal(slice.collection.sha256, fixture().collection.sha256);
  assert.equal(slice.engine_version, '0.3.0');
  assert.equal(slice.safeguard.citation, '164.308(a)(3)(ii)(C)');
  assert.deepEqual(slice.safeguard, fixture().safeguards[0]);
  assert.equal(ev[0].size, new TextEncoder().encode(JSON.stringify(slice, null, 2)).length);
});

test('notes are filled with one line only where the row has none', () => {
  const controls = freshControls();
  controls.T09.notes = 'Interviewed the owner about MFA.';
  const result = SRAWard.apply(controls, SRAWard.plan(controls, {}, SRAWard.read(fixture())));
  assert.equal(controls.T09.notes, 'Interviewed the owner about MFA.');
  assert.deepEqual(plain(result.noted), ['A10', 'T01', 'P06']);
  const line = controls.A10.notes;
  assert.ok(!line.includes('\n'), 'one line');
  assert.match(line, /^Ward, Microsoft 365 collection of 2026-10-05 \(3f2a9c1b\):/);
  assert.match(line, /Rule outcome: finding\./);
  assert.match(line, /ACCT-001 finding \(medium\)/);
  assert.match(line, /accounts\.inactive_users/);
  assert.match(line, /Status is the assessor's call\.$/);
  assert.match(controls.T01.notes, /1 finding rejected in review \(SHARE-002\)/);
  assert.match(controls.P06.notes, /Rule outcome: insufficient evidence\./);
});

test('attaching the same file twice adds nothing the second time', () => {
  const controls = freshControls();
  const file = SRAWard.read(fixture());
  SRAWard.apply(controls, SRAWard.plan(controls, {}, file));
  const before = JSON.stringify(controls);
  const plan = SRAWard.plan(controls, {}, file);
  assert.deepEqual(plain(plan.rows.map(r => r.duplicate)), [true, true, true, true]);
  const second = SRAWard.apply(controls, plan);
  assert.deepEqual(plain(second.attached), []);
  assert.deepEqual(plain(second.noted), []);
  assert.equal(JSON.stringify(controls), before);
});

test('rows whose attachment would pass the evidence limit are skipped and reported', () => {
  const controls = freshControls();
  const plan = SRAWard.plan(controls, {}, SRAWard.read(fixture()));
  const first = plan.rows[0].attachment.size;
  const result = SRAWard.apply(controls, plan, { budget: first });
  assert.deepEqual(plain(result.attached), ['A10']);
  assert.deepEqual(plain(result.overLimit), ['T09', 'T01', 'P06']);
  for (const id of result.overLimit) {
    assert.equal(controls[id].evidence.length, 0);
    assert.equal(controls[id].notes, '', 'no note without the attachment');
  }
});

test('an organization name that does not match the Ward client is flagged', () => {
  const file = SRAWard.read(fixture());
  assert.equal(SRAWard.plan(freshControls(), { orgName: 'Example Health Clinic, LLC' }, file).nameMismatch, false);
  assert.equal(SRAWard.plan(freshControls(), { orgName: 'example health clinic' }, file).nameMismatch, false);
  assert.equal(SRAWard.plan(freshControls(), { orgName: '' }, file).nameMismatch, false);
  assert.equal(SRAWard.plan(freshControls(), { orgName: 'Riverside Dental' }, file).nameMismatch, true);
});

test('Ward attachments survive saving and reopening the assessment', () => {
  const controls = freshControls();
  SRAWard.apply(controls, SRAWard.plan(controls, {}, SRAWard.read(fixture())));
  const saved = SRAFormat.serialize({ meta: {}, assets: [], flows: [], controls, risks: [] });
  const reopened = SRAFormat.upgrade(JSON.parse(JSON.stringify(saved)));
  assert.equal(reopened.controls.A10.evidence[0].name, controls.A10.evidence[0].name);
  assert.equal(decode(reopened.controls.A10.evidence[0].data).safeguard.citation, '164.308(a)(3)(ii)(C)');
});
