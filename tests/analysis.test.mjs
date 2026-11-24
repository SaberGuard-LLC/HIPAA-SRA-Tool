import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContext, globalsOf, read } from './helpers.mjs';

const ctx = loadContext();
const { SRAFormat, SRAReport, RISK_SCENARIOS, CIA, INTERVIEW_METHODS, ADVISORY_CHECKS, READINESS_CHECKS, CONTROL_BY_ID } =
  globalsOf(ctx, ['SRAFormat', 'SRAReport', 'RISK_SCENARIOS', 'CIA', 'INTERVIEW_METHODS', 'ADVISORY_CHECKS', 'READINESS_CHECKS', 'CONTROL_BY_ID']);
const plain = v => JSON.parse(JSON.stringify(v));
const v4 = JSON.parse(read('tests/fixtures/example-v4.json'));
const sample = () => JSON.parse(read('samples/example-health-clinic-hipaa-sra-2026-09-06.json'));

test('a risk records a threat, a vulnerability and the properties it affects; unknown properties are dropped', () => {
  const r = SRAFormat.newRisk({ threat: 'External attacker', vulnerability: 'Password only', cia: ['availability', 'secrecy', 'confidentiality'] });
  assert.equal(r.threat, 'External attacker');
  assert.equal(r.vulnerability, 'Password only');
  assert.deepEqual([...r.cia], ['confidentiality', 'availability']);
  assert.deepEqual(plain(CIA).map(([k]) => k), ['confidentiality', 'integrity', 'availability']);
});

test('version 4 risks keep their statement and open with the new fields empty', () => {
  const up = SRAFormat.upgrade(plain(v4));
  assert.ok(up.risks.length > 0);
  up.risks.forEach((r, i) => {
    assert.equal(r.description, v4.risks[i].description);
    assert.equal(r.threat, '');
    assert.equal(r.vulnerability, '');
    assert.deepEqual([...r.cia], []);
  });
});

test('every risk scenario names a threat, a vulnerability and what it affects', () => {
  assert.equal(RISK_SCENARIOS.length, 18);
  for (const s of RISK_SCENARIOS) {
    assert.ok(s.threat.trim().length > 20, s.text);
    assert.ok(s.vulnerability.trim().length > 20, s.text);
    assert.ok(s.cia.length > 0 && s.cia.every(k => plain(CIA).some(([c]) => c === k)), s.text);
    for (const id of SRAFormat.parseIds(s.controls)) assert.ok(CONTROL_BY_ID[id], `${s.text} links ${id}`);
  }
});

test('the threat and vulnerability check is advisory: shown, but a Final file stays Final', () => {
  assert.equal(ADVISORY_CHECKS.length, 1);
  assert.ok(!READINESS_CHECKS.some(c => c.key === 'threatVuln'), 'not a completeness check in 5.0');
  const data = sample();
  data.risks.forEach(r => { r.threat = ''; r.vulnerability = ''; });
  const state = SRAFormat.upgrade(data);
  const S = SRAReport.stats(state);
  assert.equal(S.advisory.find(c => c.key === 'threatVuln').ok, false);
  assert.equal(S.isDraft, false);
  const html = SRAReport.render(state, S);
  assert.ok(html.includes('Every risk names a threat and a vulnerability'));
  assert.ok(html.includes('Advisory'));
});

test('coverage counts what is linked and lists what is missing', () => {
  const state = SRAFormat.upgrade({ format: 'SaberGuard HIPAA SRA', version: 5,
    assets: [
      { id: 'a1', name: 'EHR', vendor: 'EHR Co', baa: 'yes', atRest: 'yes', mfa: 'yes', kind: 'application', zone: 'systems' },
      { id: 'a2', name: 'Laptops', atRest: 'no', mfa: 'yes', kind: 'device', zone: 'devices' },
      { id: 'a3', name: 'Reference binder scanner', atRest: 'yes', mfa: 'yes', kind: 'device', zone: 'devices', noThreatNote: 'Holds no ePHI after each scan.' },
      { id: 'a4', name: 'Front desk', kind: 'person', zone: 'people', atRest: 'n/a', mfa: 'yes' }
    ],
    flows: [{ id: 'f1', from: 'a2', to: 'a1', inTransit: 'unknown', transport: 'https' }],
    controls: { A05: { status: 'partial' }, T06: { status: 'not-met' }, A01: { status: 'met' } },
    risks: [{ id: 'r1', description: 'Lost laptop', assetIds: ['a1'], controlIds: ['A05'], owner: 'Office manager', target: '2026-12-01' }, { id: 'r2', description: 'Unlogged access', status: 'Closed', assetIds: ['a2'] }]
  });
  const c = SRAReport.stats(state).coverage;
  assert.deepEqual([c.inventory.done, c.inventory.total], [3, 4]);
  assert.deepEqual([...c.inventory.missing.map(m => m.ref)], ['#4']);
  assert.deepEqual([c.flagged.done, c.flagged.total], [0, 2], 'a closed risk does not cover a flag');
  assert.deepEqual([...c.flagged.missing.map(m => m.ref)].sort(), ['#2', 'F-01']);
  assert.deepEqual([c.gaps.done, c.gaps.total], [1, 2]);
  assert.deepEqual([...c.gaps.missing.map(m => m.id)], ['T06']);
  assert.deepEqual([c.owned.done, c.owned.total], [1, 2]);
  assert.deepEqual([...c.owned.missing.map(m => m.ref)], ['R-02']);
});

test('an inventory row keeps its note on why no threat applies through a save', () => {
  const state = SRAFormat.upgrade({ format: 'SaberGuard HIPAA SRA', version: 5, assets: [{ id: 'a1', name: 'Scanner', noThreatNote: 'No ePHI retained.' }] });
  const back = SRAFormat.upgrade(plain(SRAFormat.serialize(state)));
  assert.equal(back.assets[0].noThreatNote, 'No ePHI retained.');
});

test('the interview and document log saves, validates, and prints in the methodology section', () => {
  const state = SRAFormat.upgrade({ format: 'SaberGuard HIPAA SRA', version: 5, interviews: [
    { participant: 'Practice administrator', role: 'Security official', date: '2026-08-25', topics: 'Access, training', method: 'interview' },
    { participant: 'MSP engineer', role: 'IT', date: 'last week', topics: 'Backups', method: 'phone call' }
  ] });
  assert.equal(state.interviews[1].date, '');
  assert.equal(state.interviews[1].method, 'interview');
  assert.deepEqual(plain(INTERVIEW_METHODS).map(([k]) => k), ['interview', 'walkthrough', 'document']);
  const back = SRAFormat.upgrade(plain(SRAFormat.serialize(state)));
  assert.deepEqual(plain(back.interviews), plain(state.interviews));
  const html = SRAReport.render(state, SRAReport.stats(state));
  const methodology = html.slice(html.indexOf('Methodology &amp; participants'));
  assert.ok(methodology.includes('Interviews, walkthroughs and document reviews'));
  assert.ok(methodology.includes('Practice administrator') && methodology.includes('Aug 25, 2026'));
  assert.ok(!SRAReport.render(SRAFormat.upgrade(plain(v4)), SRAReport.stats(SRAFormat.upgrade(plain(v4)))).includes('Interviews, walkthroughs and document reviews'), 'no empty table');
});

test('the report prints each risk threat, vulnerability and affected properties', () => {
  const state = SRAFormat.upgrade(sample());
  const html = SRAReport.render(state, SRAReport.stats(state));
  assert.ok(html.includes('<dt>Threat</dt>') && html.includes('<dt>Vulnerability</dt>'));
  assert.ok(html.includes(state.risks[0].threat.replace(/'/g, '&#39;')));
  assert.ok(html.includes('Confidentiality, Integrity'));
});

test('CSV fields follow RFC 4180 and cannot start a spreadsheet formula', () => {
  const f = SRAReport.csvField;
  assert.equal(f('plain'), 'plain');
  assert.equal(f('a,b'), '"a,b"');
  assert.equal(f('say "hi"'), '"say ""hi"""');
  assert.equal(f('two\nlines'), '"two\nlines"');
  assert.equal(f('cr\r\nlf'), '"cr\r\nlf"');
  assert.equal(f('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(f('+1'), "'+1");
  assert.equal(f('-1'), "'-1");
  assert.equal(f('@sum'), "'@sum");
  assert.equal(f(null), '');
  assert.equal(f(16), '16');
});

test('the remediation plan CSV has a BOM, CRLF rows, the agreed columns and one row per risk', () => {
  const state = SRAFormat.upgrade(sample());
  state.risks[0].treatment = 'Turn on auditing, then review weekly, "every Monday"';
  const csv = SRAReport.remediationCsv(state);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.ok(csv.endsWith('\r\n'));
  const lines = csv.slice(1).split('\r\n').filter(Boolean);
  assert.equal(lines[0], 'Risk ID,Risk statement,Threat,Vulnerability,Inherent score,Inherent level,Treatment decision,Remediation plan,Owner,Target date,Residual score,Residual level,Status,Linked catalog rows');
  assert.equal(lines.length, state.risks.length + 1);
  assert.ok(lines[1].startsWith('R-01,'));
  assert.ok(lines[1].includes('"Turn on auditing, then review weekly, ""every Monday"""'));
  const S = SRAReport.stats(state);
  const r1 = S.risks[0];
  assert.ok(lines[1].includes(`,${r1.score},${r1.level.label},`));
  assert.ok(lines[1].endsWith(r1.controlIds.join(' ')));
});
