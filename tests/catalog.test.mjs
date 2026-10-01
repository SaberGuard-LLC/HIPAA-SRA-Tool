import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContext, globalsOf, read } from './helpers.mjs';

const ctx = loadContext(['assets/catalog.js']);
const { CONTROLS, CONTROL_BY_ID, CATEGORIES, CATALOG_COUNTS, STATUSES, statusesFor, RISK_SCENARIOS, READINESS_CHECKS, FILE_FORMAT } =
  globalsOf(ctx, ['CONTROLS', 'CONTROL_BY_ID', 'CATEGORIES', 'CATALOG_COUNTS', 'STATUSES', 'statusesFor', 'RISK_SCENARIOS', 'READINESS_CHECKS', 'FILE_FORMAT']);

const EXPECTED_TOTAL = 65;
const EXPECTED_BY_SECTION = { '164.308': 30, '164.310': 12, '164.312': 12, '164.314': 6, '164.316': 5 };
const EXPECTED_BY_TYPE = { Standard: 22, Required: 21, Addressable: 22 };
/* The two-paragraph citation for the business associate standard is allowed. */
const CITE = /^164\.3(08|10|12|14|16)(\([a-zA-Z0-9]+\))+( and \(b\)\(2\))?$/;

test('row count follows the stated convention', () => {
  assert.equal(CONTROLS.length, EXPECTED_TOTAL);
  assert.equal(CATALOG_COUNTS.total, EXPECTED_TOTAL);
});

test('ids are unique and old ids are never reused', () => {
  const ids = CONTROLS.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const old of ['O01', 'O02', 'O03']) assert.ok(!CONTROL_BY_ID[old], `${old} must not exist`);
  for (const id of ['A30', 'O11', 'O12', 'O13', 'O14', 'O15', 'O16']) assert.ok(CONTROL_BY_ID[id], `${id} missing`);
  assert.match(ids.join(' '), /^A01 /);
});

test('citations are well formed and the 164.308(b)(4) reference appears only inside the 164.314(a)(2)(iii) quotation', () => {
  for (const c of CONTROLS) assert.match(c.cite, CITE, `${c.id} cite ${c.cite}`);
  assert.equal(CONTROL_BY_ID.A29.cite, '164.308(b)(1) and (b)(2)');
  for (const c of CONTROLS) {
    assert.ok(!c.cite.includes('(b)(4)'), `${c.id} cites (b)(4)`);
    const mentions = [c.regulation || '', c.summary, c.prompt, c.title].join(' ').includes('164.308(b)(4)');
    if (c.id === 'O14') assert.ok(mentions, 'O14 must quote the cross-reference as published');
    else assert.ok(!mentions, `${c.id} must not use 164.308(b)(4)`);
  }
  assert.ok(/164\.308\(b\) has no paragraph \(4\)/.test(CONTROL_BY_ID.O14.summary));
  assert.ok(/\(b\)\(2\)/.test(CONTROL_BY_ID.O14.summary) && /\(b\)\(3\)/.test(CONTROL_BY_ID.O14.summary));
});

test('types, sections and categories match the audited counts', () => {
  const byType = { Standard: 0, Required: 0, Addressable: 0 };
  const bySection = {};
  for (const c of CONTROLS) {
    assert.ok(c.type in byType, `${c.id} type ${c.type}`);
    byType[c.type]++;
    const sec = c.cite.slice(0, 7);
    bySection[sec] = (bySection[sec] || 0) + 1;
    assert.ok(CATEGORIES[c.category], `${c.id} category`);
    assert.equal(CATEGORIES[c.category].cite, `45 CFR ${sec}`, `${c.id} category matches section`);
  }
  assert.deepEqual(byType, EXPECTED_BY_TYPE);
  assert.deepEqual(bySection, EXPECTED_BY_SECTION);
  /* Loose equality: CATALOG_COUNTS comes from another vm realm. */
  assert.deepEqual(JSON.parse(JSON.stringify(CATALOG_COUNTS.byType)), EXPECTED_BY_TYPE);
});

test('implementation specifications name their parent standard', () => {
  for (const c of CONTROLS) {
    if (c.type === 'Standard') {
      assert.equal(c.parent, undefined, `${c.id} is a standard and has no parent`);
    } else {
      const p = CONTROL_BY_ID[c.parent];
      assert.ok(p, `${c.id} needs a parent`);
      assert.equal(p.type, 'Standard', `${c.id} parent must be a standard`);
      assert.equal(p.category, c.category);
    }
  }
});

test('every row has a title, a summary and a prompt; only 164.314(b)(2) carries a SaberGuard label', () => {
  for (const c of CONTROLS) {
    assert.ok(c.title && c.summary && c.prompt, c.id);
    if (c.id === 'O16') assert.equal(c.titleBy, 'SaberGuard');
    else assert.equal(c.titleBy, undefined, `${c.id} title must be the regulation's heading`);
    assert.ok(c.regulation === null || (typeof c.regulation === 'string' && c.regulation.trim() === c.regulation && c.regulation.length > 0), `${c.id} regulation field`);
  }
});

test('regulation lines are marked as quotations for the text linter', () => {
  const src = read('assets/catalog.js');
  const quoted = src.split('\n').filter(l => /^\s*\/\* quote \*\/ regulation:/.test(l)).length;
  const withText = CONTROLS.filter(c => c.regulation).length;
  assert.equal(quoted, withText);
  assert.equal(src.split('\n').filter(l => /^\s*regulation: null/.test(l)).length, CONTROLS.length - withText);
});

test('statuses: the two 164.306(d)(3) statuses are offered on addressable rows only', () => {
  assert.deepEqual([...Object.keys(STATUSES)], ['met', 'partial', 'not-met', 'alt', 'doc', 'na']);
  assert.ok(STATUSES.alt.addressableOnly && STATUSES.doc.addressableOnly);
  assert.equal(STATUSES.alt.scoreAs, 'met');
  assert.equal(STATUSES.doc.scoreAs, 'excluded');
  assert.equal(STATUSES.na.scoreAs, 'excluded');
  for (const k of ['partial', 'not-met', 'alt', 'doc', 'na']) assert.ok(STATUSES[k].needsNote, k);
  assert.equal(statusesFor(CONTROL_BY_ID.A08).length, 6);
  assert.equal(statusesFor(CONTROL_BY_ID.A02).length, 4);
  assert.equal(statusesFor(CONTROL_BY_ID.A01).length, 4);
});

test('risk scenario library links only to existing rows and has no paper entry', () => {
  for (const s of RISK_SCENARIOS) {
    assert.ok(!/paper/i.test(s.text), s.text);
    for (const id of s.controls.split(/[\s,]+/).filter(Boolean)) assert.ok(CONTROL_BY_ID[id], `${id} in "${s.text}"`);
  }
});

test('completeness checks include a recorded-risk check', () => {
  const keys = READINESS_CHECKS.map(c => c.key);
  assert.ok(keys.includes('risksExist'));
  assert.ok(keys.includes('recs'));
  for (const c of READINESS_CHECKS) assert.ok(!/\d{2}/.test(c.label), `check label must not hardcode a count: ${c.label}`);
});

test('no shipped text hardcodes the old total', () => {
  for (const f of ['index.html', 'assets/app.js', 'assets/report.js', 'assets/catalog.js']) {
    assert.ok(!/\b61\b/.test(read(f)), `${f} mentions 61`);
  }
  const readme = read('README.md');
  assert.ok(readme.includes(`${EXPECTED_TOTAL} catalog rows`), 'README states the row count');
  assert.ok(readme.includes("The count is SaberGuard's convention"), 'README states the convention');
  assert.ok(readme.includes(`${EXPECTED_BY_TYPE.Standard} standards`) && readme.includes(`${EXPECTED_BY_TYPE.Required} Required`) && readme.includes(`${EXPECTED_BY_TYPE.Addressable} Addressable`));
});

test('file format name is unchanged so older files still open', () => {
  assert.equal(FILE_FORMAT.name, 'SaberGuard HIPAA SRA');
});
