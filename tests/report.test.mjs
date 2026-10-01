import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContext, globalsOf, read } from './helpers.mjs';

const ctx = loadContext();
const { CONTROLS, SRAReport, SRAFormat } = globalsOf(ctx, ['CONTROLS', 'SRAReport', 'SRAFormat']);

const fullMeta = { orgName: 'Test Org', assessmentDate: '2026-09-30', assessor: 'A. Assessor, Example Firm', scope: 'Everything.', executive: 'E. Exec, Owner', reportStatus: 'Draft', entityType: 'covered-entity', clearinghouse: 'no', groupHealthPlan: 'no' };
const completeRisk = { description: 'Risk', likelihood: 4, impact: 4, owner: 'Owner', target: '2026-12-31', treatment: 'Plan' };
const allMet = () => Object.fromEntries(CONTROLS.map(c => [c.id, { status: 'met', notes: 'ok', recommendation: '', basis: 'observed', evidence: [] }]));
const asset = { id: 'a1', name: 'EHR', kind: 'application', zone: 'systems', data: 'Records', lifecycle: ['maintain'], vendor: 'Vendor', baa: 'yes', atRest: 'yes', mfa: 'yes', location: 'vendor-hosted' };
const rowOfType = type => CONTROLS.find(c => c.type === type).id;
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

test('an empty workspace is a draft with the presence checks open', () => {
  const S = SRAReport.stats({ meta: {}, assets: [], flows: [], controls: {}, risks: [] });
  assert.equal(S.total, CONTROLS.length);
  assert.equal(S.reviewed, 0);
  assert.equal(S.score, null);
  assert.ok(S.isDraft);
  /* Checks phrased as "every X has Y" pass on an empty workspace. */
  assert.deepEqual([...S.missing].map(c => c.key), ['profile', 'inventory', 'reviewed', 'risksExist', 'approval']);
});

test('a report with no risks recorded does not pass the checks', () => {
  const S = SRAReport.stats({ meta: { ...fullMeta, reportStatus: 'Final' }, assets: [asset], flows: [], controls: allMet(), risks: [] });
  assert.ok(S.missing.some(c => c.key === 'risksExist'));
  assert.ok(S.isDraft);
});

test('Final prints only when every check passes and the assessor sets Final', () => {
  const base = { meta: fullMeta, assets: [asset], flows: [], controls: allMet(), risks: [completeRisk] };
  const draft = SRAReport.stats(base);
  assert.deepEqual([...draft.missing].map(c => c.key), []);
  assert.ok(draft.isDraft, 'status Draft keeps the report a draft');
  const final = SRAReport.stats({ ...base, meta: { ...fullMeta, reportStatus: 'Final' } });
  assert.ok(!final.isDraft);
  const html = SRAReport.render({ ...base, meta: { ...fullMeta, reportStatus: 'Final' } }, final);
  assert.ok(html.includes('1.0 · Final'));
  assert.ok(!html.includes('is-draft'));
});

test('the entity profile marks rows Not applicable with the basis recorded and locks nothing else', () => {
  const S = SRAReport.stats({ meta: fullMeta, assets: [], flows: [], controls: {}, risks: [] });
  const byId = Object.fromEntries(S.controls.map(c => [c.id, c]));
  for (const id of ['A12', 'O14', 'O15', 'O16']) {
    assert.equal(byId[id].status, 'na', id);
    assert.ok(byId[id].derivedNA);
    assert.ok(/entity profile/.test(byId[id].notes), id);
  }
  assert.equal(byId.A29.status, '');
  assert.equal(S.na, 4);
  const yes = SRAReport.stats({ meta: { ...fullMeta, clearinghouse: 'yes', groupHealthPlan: 'yes', entityType: 'both' }, assets: [], flows: [], controls: {}, risks: [] });
  assert.equal(yes.na, 0);
  const unanswered = SRAReport.stats({ meta: { ...fullMeta, clearinghouse: '', groupHealthPlan: '', entityType: '' }, assets: [], flows: [], controls: {}, risks: [] });
  assert.equal(unanswered.na, 0);
  assert.ok(unanswered.missing.some(c => c.key === 'profile'), 'an unanswered profile fails the profile check');
});

test('an answer carried from version 3 counts as not reviewed until confirmed', () => {
  const controls = allMet();
  controls.A01.carried = true;
  const S = SRAReport.stats({ meta: fullMeta, assets: [asset], flows: [], controls, risks: [completeRisk] });
  assert.equal(S.carried, 1);
  assert.equal(S.reviewed, CONTROLS.length - 1);
  assert.ok(S.missing.some(c => c.key === 'reviewed'));
  const row = S.controls.find(c => c.id === 'A01');
  assert.equal(row.status, '');
  assert.equal(row.recordedStatus, 'met');
  const html = SRAReport.render({ meta: fullMeta, assets: [asset], flows: [], controls, risks: [completeRisk] }, S);
  assert.ok(html.includes('Carried from version 3 (Met), review pending'));
});

test('the verification basis is required for every reviewed row and printed beside the status', () => {
  const controls = allMet();
  controls.A02.basis = '';
  const state = { meta: fullMeta, assets: [asset], flows: [], controls, risks: [completeRisk] };
  const S = SRAReport.stats(state);
  assert.ok(S.missing.some(c => c.key === 'basis'));
  const html = SRAReport.render(state, S);
  assert.ok(html.includes('Basis not recorded'));
  assert.ok(html.includes('Observed'));
});

test('inventory rows must be classified and flows must join two different rows', () => {
  const unclassified = SRAReport.stats({ meta: fullMeta, assets: [{ ...asset, kind: 'unknown' }], flows: [], controls: {}, risks: [] });
  assert.ok(unclassified.missing.some(c => c.key === 'inventory'));
  assert.equal(unclassified.facts.unclassified, 1);
  const badFlow = SRAReport.stats({ meta: fullMeta, assets: [asset], flows: [{ id: 'f1', from: 'a1', to: 'a1' }], controls: {}, risks: [] });
  assert.ok(badFlow.missing.some(c => c.key === 'flows'));
  const good = SRAReport.stats({ meta: fullMeta, assets: [asset, { ...asset, id: 'a2', name: 'Laptop', kind: 'device', zone: 'devices', vendor: '' }], flows: [{ id: 'f1', from: 'a2', to: 'a1', transport: 'https', inTransit: 'yes' }], controls: {}, risks: [] });
  assert.ok(!good.missing.some(c => c.key === 'flows') && !good.missing.some(c => c.key === 'inventory'));
  assert.equal(good.facts.out, 1, 'a flow to a vendor-hosted system reaches a vendor');
});

test('inventory facts count only confirmed gaps', () => {
  const assets = [
    { ...asset, id: 'v1', vendor: 'A', baa: 'no' },
    { ...asset, id: 'v2', vendor: 'B', baa: 'unknown' },
    { ...asset, id: 'v3', vendor: 'C', baa: 'yes' },
    { ...asset, id: 'p1', name: 'Clients', kind: 'person', zone: 'external', vendor: '', baa: 'not-required' }
  ];
  const flows = [{ id: 'f1', from: 'p1', to: 'v1', inTransit: 'no' }, { id: 'f2', from: 'p1', to: 'v2', inTransit: 'unknown' }, { id: 'f3', from: 'p1', to: 'v3', inTransit: 'yes' }, { id: 'f4', from: 'v1', to: 'v2', inTransit: 'n/a' }];
  const S = SRAReport.stats({ meta: fullMeta, assets, flows, controls: {}, risks: [] });
  assert.equal(S.facts.noBaa, 2, 'no and unknown count; not-required and yes do not');
  assert.equal(S.facts.weak, 2);
  assert.equal(S.facts.out, 4);
});

test('risks link to inventory rows, flows and catalog rows by id and print their references', () => {
  const assets = [asset, { ...asset, id: 'a2', name: 'Laptop', kind: 'device', zone: 'devices', vendor: '' }];
  const flows = [{ id: 'f1', from: 'a2', to: 'a1', transport: 'https', inTransit: 'yes' }];
  const risks = [{ ...completeRisk, assetIds: ['a1'], flowIds: ['f1'], controlIds: ['A05', 'T06'], legacyAssets: 'old text' }];
  const state = { meta: fullMeta, assets, flows, controls: allMet(), risks };
  const S = SRAReport.stats(state);
  assert.deepEqual([...S.risksByAsset.a1].map(r => r.ref), ['R-01']);
  assert.deepEqual([...S.risksByFlow.f1].map(r => r.ref), ['R-01']);
  const html = SRAReport.render(state, S);
  assert.ok(html.includes('F-01'));
  assert.ok(html.includes('Version 3 text: old text'));
  assert.ok(html.includes('<b>A05</b>'));
});

test('unrated risks are not scored and fail the risk check', () => {
  const S = SRAReport.stats({ meta: fullMeta, assets: [asset], flows: [], controls: allMet(), risks: [{ description: 'x', owner: 'o', target: '2026-12-31', treatment: 't' }] });
  assert.equal(S.risks[0].rated, false);
  assert.equal(S.risks[0].score, null);
  assert.equal(S.unrated, 1);
  assert.equal(S.high + S.medium + S.low, 0);
  assert.ok(S.missing.some(c => c.key === 'risks'));
});

test('implementation score counts alternative measures as met and leaves documented decisions out', () => {
  const addr = CONTROLS.filter(c => c.type === 'Addressable').map(c => c.id);
  const controls = {
    [rowOfType('Standard')]: { status: 'met' },
    [rowOfType('Required')]: { status: 'met' },
    [addr[0]]: { status: 'alt', notes: 'reason' },
    [addr[1]]: { status: 'partial', notes: 'n', recommendation: 'r' },
    [addr[2]]: { status: 'doc', notes: 'reason' },
    [addr[3]]: { status: 'na', notes: 'basis' }
  };
  const S = SRAReport.stats({ meta: {}, assets: [], flows: [], controls, risks: [] });
  assert.equal(S.reviewed, 6);
  assert.equal(S.applicable, 4);
  assert.equal(S.score, 88);
  assert.equal(S.alt, 1);
  assert.equal(S.doc, 1);
});

test('the addressable-only statuses are ignored on standards and required rows', () => {
  const S = SRAReport.stats({ meta: {}, assets: [], flows: [], controls: { [rowOfType('Required')]: { status: 'alt', notes: 'x' } }, risks: [] });
  assert.equal(S.reviewed, 0);
});

test('a note is required for every status that needs one, and a recommendation for gaps', () => {
  const addr = CONTROLS.find(c => c.type === 'Addressable').id;
  const noNote = SRAReport.stats({ meta: {}, assets: [], flows: [], controls: { [addr]: { status: 'alt', notes: '' } }, risks: [] });
  assert.ok(noNote.missing.some(c => c.key === 'gapnotes'));
  const noRec = SRAReport.stats({ meta: {}, assets: [], flows: [], controls: { [addr]: { status: 'partial', notes: 'n', recommendation: '' } }, risks: [] });
  assert.ok(noRec.missing.some(c => c.key === 'recs'));
});

test('the rendered report prints real counts, no prefilled approval, and no em dashes', () => {
  const state = { meta: { orgName: 'Test Org', executive: 'E. Exec' }, assets: [], flows: [], controls: { A01: { status: 'met' } }, risks: [] };
  const html = SRAReport.render(state, SRAReport.stats(state));
  assert.ok(html.includes(`1 of ${CONTROLS.length} catalog rows were rated`));
  assert.ok(!html.includes('Every Security Rule standard'));
  assert.ok(!html.includes('Approved by'));
  assert.ok(!html.includes('<img'), 'no logo on the report');
  const outsideQuotes = CONTROLS.reduce((h, c) => c.regulation ? h.split(esc(c.regulation)).join('') : h, html);
  assert.ok(!outsideQuotes.includes('—'), 'em dashes may appear only inside quoted regulation text');
  assert.ok(!html.includes('undefined') && !html.includes('NaN'));
  assert.ok(html.includes('Preparer not named'));
  assert.ok(html.includes('Report completeness checks'));
  assert.ok(html.includes('did not review this report unless named as the assessor'));
  assert.ok(!/MIT/.test(html), 'no software license in the report');
  assert.ok(html.includes('Date: ________________'));
  assert.ok(html.includes('file format version 4'));
});

test('the version 3 sample upgrades and renders without errors', () => {
  const data = JSON.parse(read('tests/fixtures/example-v3.json'));
  const state = SRAFormat.upgrade(data);
  const S = SRAReport.stats(state);
  const html = SRAReport.render(state, S);
  assert.ok(!html.includes('undefined') && !html.includes('NaN'));
  assert.ok(S.reviewed > 0);
  assert.ok(S.carried > 0);
  assert.ok(html.includes('Flow notes (version 3)'), 'legacy flow notes print');
  assert.ok(!/SaberGuard LLC/.test(JSON.stringify(data.meta)), 'sample must not name a SaberGuard consultant');
});
