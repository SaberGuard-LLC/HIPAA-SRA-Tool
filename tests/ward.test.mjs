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
  assert.throws(() => SRAWard.read({ ...fixture(), version: 3 }), /version 3; this workspace reads versions 1 and 2/);
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
  assert.match(line, /Status and verification basis are the assessor's call\.$/);
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

/* ---- Version 2: every source, one file ------------------------------------ */
const fixtureV2 = () => JSON.parse(read('tests/fixtures/ward-evidence-example-v2.json'));

test('a version 2 file is read; one without its collections list is refused', () => {
  const file = SRAWard.read(fixtureV2());
  assert.equal(file.version, 2);
  assert.equal(file.collections.length, 4);
  assert.throws(() => SRAWard.read({ ...fixtureV2(), collections: undefined }), /collections list/);
  assert.throws(() => SRAWard.read({ ...fixtureV2(), collections: [] }), /collections list/);
  const bad = fixtureV2();
  delete bad.collections[2].collected_at;
  assert.throws(() => SRAWard.read(bad), /Collection 3 .* no id, date or source/);
  assert.equal(SRAWard.describe(file), '4 collections (Attestation 2026-10-30, Devices (Level) 2026-10-29, Mail domain (DNS) 2026-10-29, Microsoft 365 2026-10-29)');
  assert.equal(SRAWard.describe(SRAWard.read(fixture())), 'Microsoft 365 collection of 2026-10-05');
});

test('a safeguard citing one paragraph of a joined row lands on that row: 164.308(b)(1) goes to A29', () => {
  const plan = SRAWard.plan(freshControls(), {}, SRAWard.read(fixtureV2()));
  assert.deepEqual(plain(plan.rows.map(r => [r.citation, r.id])), [
    ['164.308(a)(5)(ii)(B)', 'A17'],
    ['164.308(a)(7)(ii)(A)', 'A23'],
    ['164.308(b)(1)', 'A29'],
    ['164.312(a)(2)(iv)', 'T05'],
    ['164.312(d)', 'T09']
  ]);
  assert.deepEqual(plain(plan.unmatched), []);
  const p = SRAWard.plan(freshControls(), {}, { ...SRAWard.read(fixtureV2()), safeguards: [{ ...fixtureV2().safeguards[2], citation: '164.308(b)(2)' }] });
  assert.deepEqual(plain(p.rows.map(r => r.id)), ['A29']);
});

test('version 2 notes name each source a safeguard draws on, with its date and collection', () => {
  const controls = freshControls();
  SRAWard.apply(controls, SRAWard.plan(controls, {}, SRAWard.read(fixtureV2())));
  assert.match(controls.T05.notes, /^Ward, Devices \(Level\) collection of 2026-10-29 \(7c1d2e3f\) and Microsoft 365 collection of 2026-10-29 \(b4c5d6e7\):/);
  assert.match(controls.T05.notes, /DEV-002 did not apply, RMM-001 met, RMM-002 finding \(medium\)/);
  assert.match(controls.A17.notes, /^Ward, Devices \(Level\) collection of 2026-10-29 \(7c1d2e3f\) and Mail domain \(DNS\) collection of 2026-10-29 \(5e6f7a8b\):/);
  assert.match(controls.T09.notes, /^Ward, Microsoft 365 collection of 2026-10-29 \(b4c5d6e7\):/);
  for (const c of Object.values(controls)) assert.ok(!c.notes.includes('\n'), 'one line');
});

test('an attested fact shows its basis in the note and never sets the row\'s verification basis or status', () => {
  const controls = freshControls();
  SRAWard.apply(controls, SRAWard.plan(controls, {}, SRAWard.read(fixtureV2())));
  const baa = controls.A29.notes;
  assert.match(baa, /^Ward, Attestation collection of 2026-10-30 \(9a8b7c6d\):/);
  assert.match(baa, /BAA-001 finding \(high\)/);
  assert.match(baa, /baa\.vendors_reviewed_count \(attested, document reviewed\)/);
  assert.match(baa, /baa\.vendors_without_agreement_count \(attested, stated by the client\)/);
  assert.match(baa, /identity\.provider\./, 'a fact with no basis in its source_ref carries none');
  assert.match(controls.A23.notes, /contingency\.backup_exists \(attested, observed\)/);
  assert.doesNotMatch(controls.T05.notes, /attested/, 'configuration facts are not attested');
  for (const c of Object.values(controls)) {
    assert.equal(c.status, '', 'status untouched');
    assert.equal(c.basis, '', 'basis untouched');
  }
});

test('a version 2 attachment carries the safeguard and only the collections it draws on', () => {
  const controls = freshControls();
  SRAWard.apply(controls, SRAWard.plan(controls, {}, SRAWard.read(fixtureV2())));
  const ev = controls.T05.evidence;
  assert.equal(ev.length, 1);
  assert.equal(ev[0].name, 'ward-example-clinic-2026-10-30-9a8b7c6d-T05.json');
  const slice = decode(ev[0].data);
  assert.equal(slice.version, 2);
  assert.equal(slice.collection.id, fixtureV2().collection.id, 'the newest collection is kept, as in the file');
  assert.deepEqual(slice.collections.map(c => c.source), ['level', 'microsoft']);
  assert.equal(slice.collections[0].sha256, '3'.repeat(64));
  assert.deepEqual(slice.safeguard, fixtureV2().safeguards[3]);
  assert.equal(ev[0].size, new TextEncoder().encode(JSON.stringify(slice, null, 2)).length);
});

test('the same version 2 file, downloaded again, adds nothing; a version 1 file attached earlier stays', () => {
  const controls = freshControls();
  SRAWard.apply(controls, SRAWard.plan(controls, {}, SRAWard.read(fixture())));
  const t09Note = controls.T09.notes;
  const first = SRAWard.apply(controls, SRAWard.plan(controls, {}, SRAWard.read(fixtureV2())));
  assert.deepEqual(plain(first.attached), ['A17', 'A23', 'A29', 'T05', 'T09']);
  assert.equal(controls.T09.evidence.length, 2, 'version 1 and version 2 attachments side by side');
  assert.equal(controls.T09.notes, t09Note, 'notes written by the first file are not replaced');
  const before = JSON.stringify(controls);
  const again = { ...fixtureV2(), generated_at: '2026-11-01T08:00:00.000Z' };
  const second = SRAWard.apply(controls, SRAWard.plan(controls, {}, SRAWard.read(again)));
  assert.deepEqual(plain(second.attached), []);
  assert.deepEqual(plain(second.skipped), ['A17', 'A23', 'A29', 'T05', 'T09']);
  assert.equal(JSON.stringify(controls), before);
});

test('a collection evaluated again under new rules attaches the new outcome beside the old one', () => {
  const controls = freshControls();
  SRAWard.apply(controls, SRAWard.plan(controls, {}, SRAWard.read(fixtureV2())));
  const reevaluated = fixtureV2();
  reevaluated.safeguards[4].rules.push({ rule_id: 'AUTH-007', title: 'Administrators without a phishing-resistant method', status: 'met', reason: null, facts: [], source: 'microsoft' });
  const plan = SRAWard.plan(controls, {}, SRAWard.read(reevaluated));
  assert.deepEqual(plain(plan.rows.map(r => r.duplicate)), [true, true, true, true, false]);
  const t09 = plan.rows.find(r => r.id === 'T09');
  assert.match(t09.attachment.name, /^ward-example-clinic-2026-10-30-9a8b7c6d-T09-[0-9a-f]{8}\.json$/);
  const result = SRAWard.apply(controls, plan);
  assert.deepEqual(plain(result.attached), ['T09']);
  assert.equal(controls.T09.evidence.length, 2);
  assert.ok(decode(controls.T09.evidence[1].data).safeguard.rules.some(r => r.rule_id === 'AUTH-007'));
  const third = SRAWard.apply(controls, SRAWard.plan(controls, {}, SRAWard.read(reevaluated)));
  assert.deepEqual(plain(third.attached), [], 'and that one too is attached only once');
});

test('an attachment kept by name only (saved without evidence) is still a duplicate', () => {
  const controls = freshControls();
  SRAWard.apply(controls, SRAWard.plan(controls, {}, SRAWard.read(fixtureV2())));
  for (const c of Object.values(controls)) c.evidence = c.evidence.map(({ name, type, size }) => ({ name, type, size, omitted: true }));
  const plan = SRAWard.plan(controls, {}, SRAWard.read(fixtureV2()));
  assert.ok(plan.rows.every(r => r.duplicate));
});
