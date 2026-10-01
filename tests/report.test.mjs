import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContext, globalsOf, read } from './helpers.mjs';

const ctx = loadContext(['assets/catalog.js', 'assets/report.js']);
const { CONTROLS, SRAReport } = globalsOf(ctx, ['CONTROLS', 'SRAReport']);

const fullMeta = { orgName: 'Test Org', assessmentDate: '2026-09-30', assessor: 'A. Assessor, Example Firm', scope: 'Everything.', executive: 'E. Exec, Owner', reportStatus: 'Draft' };
const completeRisk = { description: 'Risk', likelihood: 4, impact: 4, owner: 'Owner', target: '2026-12-31', treatment: 'Plan' };
const allMet = () => Object.fromEntries(CONTROLS.map(c => [c.id, { status: 'met', notes: 'ok', recommendation: '', evidence: [] }]));
const asset = { id: 'a1', name: 'EHR', data: 'Records', owner: 'Vendor', flow: 'Browser', protection: 'MFA' };
const rowOfType = type => CONTROLS.find(c => c.type === type).id;

test('an empty workspace is a draft with every check open', () => {
  const S = SRAReport.stats({ meta: {}, assets: [], controls: {}, risks: [] });
  assert.equal(S.total, CONTROLS.length);
  assert.equal(S.reviewed, 0);
  assert.equal(S.score, null);
  assert.ok(S.isDraft);
  /* Checks phrased as "every X has Y" pass on an empty workspace; the
     presence checks are what fail. */
  assert.deepEqual([...S.missing].map(c => c.key), ['profile', 'inventory', 'reviewed', 'risksExist', 'approval']);
});

test('a report with no risks recorded does not pass the checks', () => {
  const S = SRAReport.stats({ meta: { ...fullMeta, reportStatus: 'Final' }, assets: [asset], controls: allMet(), risks: [] });
  assert.ok(S.missing.some(c => c.key === 'risksExist'));
  assert.ok(S.isDraft);
});

test('Final prints only when every check passes and the assessor sets Final', () => {
  const base = { meta: fullMeta, assets: [asset], controls: allMet(), risks: [completeRisk] };
  const draft = SRAReport.stats(base);
  assert.equal(draft.missing.length, 0);
  assert.ok(draft.isDraft, 'status Draft keeps the report a draft');
  const final = SRAReport.stats({ ...base, meta: { ...fullMeta, reportStatus: 'Final' } });
  assert.ok(!final.isDraft);
  const html = SRAReport.render({ ...base, meta: { ...fullMeta, reportStatus: 'Final' } }, final);
  assert.ok(html.includes('1.0 · Final'));
  assert.ok(!html.includes('is-draft'));
});

test('unrated risks are not scored and fail the risk check', () => {
  const S = SRAReport.stats({ meta: fullMeta, assets: [asset], controls: allMet(), risks: [{ description: 'x', owner: 'o', target: '2026-12-31', treatment: 't' }] });
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
  const S = SRAReport.stats({ meta: {}, assets: [], controls, risks: [] });
  assert.equal(S.reviewed, 6);
  assert.equal(S.applicable, 4);
  assert.equal(S.score, 88);
  assert.equal(S.alt, 1);
  assert.equal(S.doc, 1);
});

test('the addressable-only statuses are ignored on standards and required rows', () => {
  const S = SRAReport.stats({ meta: {}, assets: [], controls: { [rowOfType('Required')]: { status: 'alt', notes: 'x' } }, risks: [] });
  assert.equal(S.reviewed, 0);
});

test('a note is required for every status that needs one, and a recommendation for gaps', () => {
  const addr = CONTROLS.find(c => c.type === 'Addressable').id;
  const noNote = SRAReport.stats({ meta: {}, assets: [], controls: { [addr]: { status: 'alt', notes: '' } }, risks: [] });
  assert.ok(noNote.missing.some(c => c.key === 'gapnotes'));
  const noRec = SRAReport.stats({ meta: {}, assets: [], controls: { [addr]: { status: 'partial', notes: 'n', recommendation: '' } }, risks: [] });
  assert.ok(noRec.missing.some(c => c.key === 'recs'));
});

test('the rendered report prints real counts, no prefilled approval, and no em dashes', () => {
  const state = { meta: { orgName: 'Test Org', executive: 'E. Exec' }, assets: [], controls: { A01: { status: 'met' } }, risks: [] };
  const html = SRAReport.render(state, SRAReport.stats(state));
  assert.ok(html.includes(`1 of ${CONTROLS.length} catalog rows were rated`));
  assert.ok(!html.includes('Every Security Rule standard'));
  assert.ok(!html.includes('Approved by'));
  assert.ok(!html.includes('<img'), 'no logo on the report');
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const outsideQuotes = CONTROLS.reduce((h, c) => c.regulation ? h.split(esc(c.regulation)).join('') : h, html);
  assert.ok(!outsideQuotes.includes('—'), 'em dashes may appear only inside quoted regulation text');
  assert.ok(!html.includes('undefined') && !html.includes('NaN'));
  assert.ok(html.includes('Preparer not named'));
  assert.ok(html.includes('Report completeness checks'));
  assert.ok(html.includes('did not review this report unless named as the assessor'));
  assert.ok(!/MIT/.test(html), 'no software license in the report');
  assert.ok(html.includes('Date: ________________'));
});

test('the version 3 sample renders without errors', () => {
  const data = JSON.parse(read('samples/example-health-clinic-hipaa-sra-2026-09-06.json'));
  assert.equal(data.version, 3);
  const S = SRAReport.stats(data);
  const html = SRAReport.render(data, S);
  assert.ok(!html.includes('undefined') && !html.includes('NaN'));
  assert.ok(S.reviewed > 0);
  assert.ok(!/SaberGuard LLC/.test(JSON.stringify(data.meta)), 'sample must not name a SaberGuard consultant');
});
