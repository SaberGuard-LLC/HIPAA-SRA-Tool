/* Compares every catalog row's regulation text with the official text of
   45 CFR Part 164, Subpart C kept in tests/fixtures/ (see the README there),
   and confirms the handful of statements the workspace makes about that text.
   The parser is in tests/regulation-text.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadContext, globalsOf, ROOT } from './helpers.mjs';
import { sectionsOf, headingOf, appendixOf, sectionText, lookup, parentOf, typeOf, readings, citesOf, normalize } from './regulation-text.mjs';

const FIXTURE_DIR = join(ROOT, 'tests', 'fixtures');
const FIXTURE_META = join(FIXTURE_DIR, 'fixture.json');

const ctx = loadContext(['assets/catalog.js']);
const { CONTROLS, CATEGORIES, CATALOG_SOURCE } = globalsOf(ctx, ['CONTROLS', 'CATEGORIES', 'CATALOG_SOURCE']);

const fixtureFile = existsSync(FIXTURE_DIR) ? readdirSync(FIXTURE_DIR).find(f => /\.xml$/i.test(f)) : null;

test('the official regulation text is present in tests/fixtures', () => {
  assert.ok(fixtureFile, 'No regulation fixture found. Retrieve the eCFR XML for 45 CFR Part 164 Subpart C into tests/fixtures/ as described in tests/fixtures/README.md.');
  assert.ok(existsSync(FIXTURE_META), 'tests/fixtures/fixture.json with the retrieval date and URL is missing');
  const meta = JSON.parse(readFileSync(FIXTURE_META, 'utf8'));
  assert.match(meta.retrieved, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(/^https:\/\/(www\.ecfr\.gov|www\.govinfo\.gov)\//.test(meta.url), 'fixture must come from ecfr.gov or govinfo.gov');
  assert.equal(CATALOG_SOURCE.checked, meta.retrieved, 'CATALOG_SOURCE.checked must equal the fixture retrieval date');
});

if (fixtureFile) {
  const xml = readFileSync(join(FIXTURE_DIR, fixtureFile), 'utf8');
  const sections = sectionsOf(xml);

  test('every section the catalog cites is in the fixture', () => {
    for (const s of ['164.306', '164.308', '164.310', '164.312', '164.314', '164.316']) assert.ok(sections[s], `missing ${s}`);
  });

  test('section headings match the category labels', () => {
    const expect = { administrative: '164.308', physical: '164.310', technical: '164.312', organization: '164.314', documentation: '164.316' };
    for (const [key, sec] of Object.entries(expect)) {
      assert.equal(headingOf(sections[sec]).toLowerCase(), CATEGORIES[key].label.toLowerCase(), key);
    }
  });

  for (const c of CONTROLS) {
    test(`${c.id} ${c.cite}: regulation text, heading and type match the fixture`, () => {
      assert.ok(c.regulation, `${c.id} has no regulation text`);
      const cites = citesOf(c.cite);
      const found = cites.map(ci => lookup(sections, ci));
      found.forEach((f, i) => assert.ok(f.para, `${cites[i]} not found in fixture`));
      const want = normalize(c.regulation);
      const first = found[0];
      if (found.length > 1) {
        assert.equal(want, normalize(found.map(f => f.para.body).join(' ')), `${c.id} text`);
      } else {
        const r = readings(first.paras, first.para);
        const allowed = c.joined ? [r.withLeadIn, r.withClauses, r.withBoth] : [r.own];
        assert.ok(allowed.includes(want), `${c.id} text differs.\n  catalog: ${want}\n  fixture: ${allowed.join('\n           | ')}`);
      }
      const p = first.para;
      const title = p.heading.replace(/^(Standard|Implementation specifications?)(:\s*|$)/i, '');
      if (c.titleBy) assert.equal(title, '', `${c.id} carries a SaberGuard label, so the regulation must give the paragraph no title`);
      else assert.equal(title.toLowerCase(), c.title.toLowerCase(), `${c.id} title`);
      if (c.type === 'Standard') assert.ok(/^Standard:/i.test(p.heading) || c.id === 'A29', `${c.id} should be headed Standard`);
      else assert.equal(typeOf(first.paras, p), c.type, `${c.id} type`);
      if (c.parent) {
        const parentRow = CONTROLS.find(x => x.id === c.parent);
        assert.ok(parentRow && parentRow.type === 'Standard', `${c.id} parent must be a standard`);
        const stem = c.cite.replace(/(\([^)]+\))$/, '');
        const parentStem = citesOf(parentRow.cite)[0].replace(/\((i|1)\)$/, '');
        assert.ok(stem.startsWith(parentStem), `${c.id} at ${c.cite} is not under ${parentRow.id} at ${parentRow.cite}`);
      }
    });
  }

  test('the catalog has a row for every standard and every titled implementation specification in the fixture', () => {
    const cited = new Set(CONTROLS.flatMap(c => citesOf(c.cite)));
    const missing = [];
    for (const sec of ['164.308', '164.310', '164.312', '164.314', '164.316']) {
      const paras = lookup(sections, sec).paras;
      for (const p of paras) {
        const isStandard = /^Standard:/i.test(p.heading);
        const isTitledSpec = p.heading && !/^Standard:/i.test(p.heading) && !/^Implementation specifications?$/i.test(p.heading) && typeOf(paras, p);
        const isUntitledSpec = /^Implementation specifications?$/i.test(p.heading) && p.type && p.body;
        if ((isStandard || isTitledSpec || isUntitledSpec) && !cited.has(sec + p.path)) missing.push(`${sec}${p.path} ${p.heading}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  test('Appendix A lists the business associate standard at 164.308(b)(1)', () => {
    const app = appendixOf(xml);
    assert.ok(app.length > 0, 'Appendix A to Subpart C not found in the fixture');
    assert.ok(/Business Associate Contracts and Other Arrangement/i.test(app) && /164\.308\(b\)\(1\)/.test(app));
  });

  test('statements the workspace makes about the regulation text hold', () => {
    const all = Object.values(sections).map(sectionText).join(' ');
    assert.ok(!/\b(annual|annually|12 months|twelve months|every year|each year)\b/i.test(all), 'Subpart C sets no fixed interval');
    assert.ok(!/multi-?factor/i.test(all), 'the current rule does not name multi-factor authentication');
    const d3 = lookup(sections, '164.306(d)(3)');
    const d3text = normalize(d3.para.body + ' ' + d3.paras.filter(p => p.path.startsWith('(d)(3)') && p.path !== '(d)(3)').map(p => p.raw).join(' '));
    for (const phrase of ['Assess whether each implementation specification is a reasonable and appropriate safeguard in its environment', 'Implement the implementation specification if reasonable and appropriate', 'Document why it would not be reasonable and appropriate to implement the implementation specification', 'Implement an equivalent alternative measure if reasonable and appropriate']) {
      assert.ok(d3text.includes(phrase), `164.306(d)(3) should contain: ${phrase}`);
    }
    assert.ok(/must implement the implementation specifications/.test(lookup(sections, '164.306(d)(2)').para.body));
    assert.ok(/review and modify the security measures implemented under this subpart as needed/.test(lookup(sections, '164.306(e)').para.body));
    assert.ok(/6 years from the date of its creation or the date when it last was in effect, whichever is later/.test(lookup(sections, '164.316(b)(2)(i)').para.body));
    assert.ok(/environmental or operational changes/.test(lookup(sections, '164.316(b)(2)(iii)').para.body));
    assert.equal(lookup(sections, '164.308(b)(4)').para, undefined, '164.308(b) has no paragraph (4)');
    assert.ok(/§ 164\.308\(b\)\(4\)/.test(lookup(sections, '164.314(a)(2)(iii)').para.body), 'the dangling cross-reference is in the published text');
  });
}
