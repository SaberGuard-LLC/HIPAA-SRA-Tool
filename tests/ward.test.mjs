import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContext, globalsOf, read } from './helpers.mjs';

const ctx = loadContext(['assets/catalog.js', 'assets/format.js', 'assets/ward.js']);
const { SRAWard, SRAFormat, CONTROLS } = globalsOf(ctx, ['SRAWard', 'SRAFormat', 'CONTROLS']);
const fixture = () => JSON.parse(read('tests/fixtures/ward-evidence-example.json'));
const fixture2 = () => JSON.parse(read('tests/fixtures/ward-evidence-example-v2.json'));
const plain = v => JSON.parse(JSON.stringify(v));
const freshControls = () => Object.fromEntries(CONTROLS.map(c => [c.id, SRAFormat.newControl()]));
const decode = dataUrl => JSON.parse(decodeURIComponent(dataUrl.slice(dataUrl.indexOf(',') + 1)));

test('a Ward evidence file is read; anything else is refused with a reason', () => {
  const file = SRAWard.read(fixture());
  assert.equal(file.client.id, 'example-clinic');
  assert.equal(file.safeguards.length, 5);

  assert.throws(() => SRAWard.read({ format: 'SaberGuard HIPAA SRA', version: 4 }), /assessment file, not a Ward evidence file/);
  assert.throws(() => SRAWard.read({ ...fixture(), version: 3 }), /version 3/);
  assert.throws(() => SRAWard.read({ ...fixture(), version: 2 }), /collections list/);
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
  const fresh = freshControls();
  SRAWard.apply(fresh, SRAWard.plan(fresh, {}, SRAWard.read(fixture())));
  assert.match(fresh.T09.notes, /AUTH-002 did not apply/);
  assert.doesNotMatch(fresh.T09.notes, /not applicable/i);
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

test('a version 2 file carries one collection per source; a version 1 file still opens as before', () => {
  const v1 = SRAWard.read(fixture());
  assert.equal(v1.version, 1);
  assert.deepEqual(plain(v1.collections.map(c => c.source)), ['microsoft']);

  const file = SRAWard.read(fixture2());
  assert.equal(file.version, 2);
  assert.deepEqual(plain(file.collections.map(c => c.source)), ['dns', 'microsoft', 'attestation']);
  assert.equal(file.collection.source, 'dns', 'the newest collection');
  assert.deepEqual(plain(SRAWard.VERSIONS), [1, 2]);
});

test('a paragraph of a joined catalog cite matches that row on its own', () => {
  const file = SRAWard.read(fixture());
  file.safeguards = [{ ...file.safeguards[0], citation: '164.308(b)(2)' }, { ...file.safeguards[0], citation: '164.308(b)(1) and (b)(2)' }];
  const plan = SRAWard.plan(freshControls(), {}, file);
  assert.deepEqual(plain(plan.rows.map(r => r.id)), ['A29', 'A29']);
  assert.deepEqual(plain(plan.unmatched), []);
});

test('version 2 safeguards land by citation, name the collections they draw on, and keep the basis of attested facts', () => {
  const controls = freshControls();
  const plan = SRAWard.plan(controls, {}, SRAWard.read(fixture2()));
  assert.deepEqual(plain(plan.rows.map(r => [r.citation, r.id])), [
    ['164.308(a)(3)(ii)(C)', 'A10'],
    ['164.312(d)', 'T09'],
    ['164.312(a)(1)', 'T01'],
    ['164.310(b)', 'P06'],
    ['164.308(a)(5)(ii)(B)', 'A17'],
    ['164.308(b)(1)', 'A29']
  ]);
  const result = SRAWard.apply(controls, plan);
  assert.deepEqual(plain(result.attached), ['A10', 'T09', 'T01', 'P06', 'A17', 'A29']);
  for (const c of Object.values(controls)) {
    assert.equal(c.status, '', 'status untouched');
    assert.equal(c.basis, '', 'basis untouched');
  }
  // A Microsoft safeguard names only its own collection, not the newest one.
  assert.match(controls.A10.notes, /^Ward, Microsoft 365 collection of 2026-10-05 \(3f2a9c1b\):/);
  assert.doesNotMatch(controls.A10.notes, /mail domain/);
  assert.match(controls.A17.notes, /^Ward, mail domain \(DNS\) collection of 2026-10-06 \(7b1d2e3f\):/);
  assert.match(controls.A17.notes, /MAIL-001 finding \(medium\)/);
  // The attested safeguard says how each fact was verified; status stays the assessor's.
  assert.match(controls.A29.notes, /^Ward, attestation collection of 2026-10-04 \(9c8b7a6f\):/);
  assert.match(controls.A29.notes, /Attested: document reviewed \(1\), stated by the client \(1\)\./);
  assert.match(controls.A29.notes, /Status is the assessor's call\.$/);
  assert.doesNotMatch(controls.A10.notes, /Attested:/);
  // The attachment name uses the newest collection; the slice carries every collection.
  const ev = controls.A17.evidence[0];
  assert.equal(ev.name, 'ward-example-clinic-2026-10-06-7b1d2e3f-A17.json');
  const slice = decode(ev.data);
  assert.equal(slice.version, 2);
  assert.deepEqual(plain(slice.collections.map(c => c.source)), ['dns', 'microsoft', 'attestation']);
  assert.equal(slice.safeguard.facts[0].source, 'dns');
});
