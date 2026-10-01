/* Compares every catalog row's regulation text with the official text of
   45 CFR Part 164, Subpart C kept in tests/fixtures/ (see the README there),
   and confirms the handful of statements the workspace makes about that text.

   The parser reads the eCFR versioner XML (DIV8 sections with P paragraphs)
   and the govinfo bulk XML (SECTION with SECTNO and P). It is regex based so
   the repository has no dependencies. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadContext, globalsOf, ROOT } from './helpers.mjs';

const FIXTURE_DIR = join(ROOT, 'tests', 'fixtures');
const FIXTURE_META = join(FIXTURE_DIR, 'fixture.json');

const ctx = loadContext(['assets/catalog.js']);
const { CONTROLS, CATEGORIES, CATALOG_SOURCE } = globalsOf(ctx, ['CONTROLS', 'CATEGORIES', 'CATALOG_SOURCE']);

/* ---- XML to paragraphs ------------------------------------------------- */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", sect: '§', nbsp: ' ', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
/* Keep italic runs marked so headings can be separated from the text. */
function toText(inner) {
  let s = inner.replace(/<(I|E T="03"|em|i)(\s[^>]*)?>/gi, '\u0001').replace(/<\/(I|E|em|i)>/gi, '\u0002');
  s = s.replace(/<[^>]+>/g, '');
  return normalize(decode(s));
}
export function normalize(s) {
  return String(s)
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/ /g, ' ').replace(/\s+/g, ' ')
    .replace(/§\s*/g, '§ ')
    .trim();
}
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv)$/;
function levelOf(tok, italic) {
  if (/^\d+$/.test(tok)) return italic ? 5 : 2;
  if (/^[A-Z]+$/.test(tok)) return 4;
  if (ROMAN.test(tok)) return italic ? 6 : 3;
  return 1;
}
/* Returns [{ path, heading, body, raw, children }] for one section. */
function paragraphsOf(sectionXml) {
  const out = [];
  const path = [];
  const re = /<P(?:\s[^>]*)?>([\s\S]*?)<\/P>/gi;
  let m;
  while ((m = re.exec(sectionXml))) {
    let t = toText(m[1]);
    const labels = [];
    let rest = t;
    for (;;) {
      const lm = /^(\u0001)?\(([a-zA-Z0-9]+)\)(\u0002)?\s*/.exec(rest);
      if (!lm) break;
      labels.push({ tok: lm[2], italic: !!lm[1] });
      rest = rest.slice(lm[0].length);
    }
    if (labels.length) {
      const first = levelOf(labels[0].tok, labels[0].italic);
      path.length = first - 1;
      labels.forEach(l => path.push(`(${l.tok})`));
    }
    let heading = '';
    const hm = /^\u0001([^\u0002]*)\u0002\s*/.exec(rest);
    if (hm) { heading = normalize(hm[1]); rest = rest.slice(hm[0].length); }
    rest = rest.replace(/^\((Required|Addressable)\)\.?\s*/, '');
    const clean = s => normalize(s.replace(/[\u0001\u0002]/g, ''));
    out.push({ path: path.join(''), depth: path.length, heading: clean(heading).replace(/[.:]$/, ''), body: clean(rest), raw: clean(labels.map(l => `(${l.tok})`).join('') + ' ' + rest) });
  }
  out.forEach((p, i) => {
    p.children = [];
    for (let j = i + 1; j < out.length; j++) {
      if (!out[j].path.startsWith(p.path) || out[j].depth <= p.depth) break;
      if (out[j].depth === p.depth + 1) p.children.push(out[j]);
    }
  });
  return out;
}
function sectionsOf(xml) {
  const sections = {};
  const ecfr = /<DIV8[^>]*\bN="§\s*(164\.\d+)"[^>]*>([\s\S]*?)<\/DIV8>/g;
  const govinfo = /<SECTION>\s*<SECTNO>§\s*(164\.\d+)<\/SECTNO>([\s\S]*?)<\/SECTION>/g;
  let m;
  while ((m = ecfr.exec(xml))) sections[m[1]] = m[2];
  while ((m = govinfo.exec(xml))) sections[m[1]] = m[2];
  return sections;
}
function headingOf(sectionXml) {
  const h = /<HEAD>([\s\S]*?)<\/HEAD>/i.exec(sectionXml) || /<SUBJECT>([\s\S]*?)<\/SUBJECT>/i.exec(sectionXml);
  return h ? normalize(decode(h[1].replace(/<[^>]+>/g, ''))).replace(/^§\s*164\.\d+\s*/, '').replace(/\.$/, '') : '';
}
function appendixOf(xml) {
  const m = /<DIV9[^>]*>([\s\S]*?)<\/DIV9>/.exec(xml) || /<APPENDIX>([\s\S]*?)<\/APPENDIX>/.exec(xml);
  return m ? normalize(decode(m[1].replace(/<[^>]+>/g, ' '))) : '';
}
function lookup(sections, cite) {
  const sec = cite.slice(0, 7);
  const path = cite.slice(7);
  const paras = paragraphsOf(sections[sec] || '');
  return { sec, paras, para: paras.find(p => p.path === path) };
}
/* Candidate readings of a paragraph: its own text, a lead-in joined with it,
   its text joined with its clauses, or a lead-in plus both. */
function candidates(paras, para) {
  const parent = paras.find(p => p.path && para.path.startsWith(p.path) && p.depth === para.depth - 1);
  const leadIn = parent && parent.body ? parent.body + ' ' : '';
  const kids = para.children.map(c => c.raw).join(' ');
  const set = new Set([para.body, leadIn + para.body, normalize(para.body + ' ' + kids), normalize(leadIn + para.body + ' ' + kids)]);
  return [...set].map(normalize);
}

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
      const cites = c.cite.split(' and ').map((x, i) => i ? c.cite.slice(0, 7) + x : x);
      const found = cites.map(ci => lookup(sections, ci));
      found.forEach((f, i) => assert.ok(f.para, `${cites[i]} not found in fixture`));
      let cands;
      if (found.length > 1) cands = [normalize(found.map(f => f.para.body).join(' '))];
      else cands = candidates(found[0].paras, found[0].para);
      const want = normalize(c.regulation);
      assert.ok(cands.includes(want), `${c.id} text differs.\n  catalog: ${want}\n  fixture: ${cands.join('\n           | ')}`);
      const p = found[0].para;
      const heading = p.heading.replace(/^(Standard|Implementation specifications?):\s*/i, '');
      if (c.titleBy) assert.ok(/^Implementation specifications?/i.test(p.heading) || !heading, `${c.id} should carry a SaberGuard label only when the regulation gives no heading`);
      else assert.equal(heading.toLowerCase(), c.title.toLowerCase(), `${c.id} title`);
      const rawPara = (sections[found[0].sec].match(/<P(?:\s[^>]*)?>[\s\S]*?<\/P>/gi) || []).map(x => toText(x)).find(x => x.replace(/[\u0001\u0002]/g, '').startsWith(p.raw.slice(0, 20)) || x.includes(p.body.slice(0, 30)));
      if (c.type === 'Standard') assert.ok(/Standard/i.test(p.heading) || c.id === 'A29', `${c.id} should be headed Standard`);
      else assert.ok(new RegExp(`\\(${c.type}\\)`).test(rawPara || '') || /\(Required\)/.test(p.heading) || (found[0].paras.find(q => q.path === p.path.replace(/\([^)]+\)$/, '')) || {}).heading.includes(`(${c.type})`), `${c.id} should be marked (${c.type})`);
    });
  }

  test('Appendix A lists the business associate standard at 164.308(b)(1)', () => {
    const app = appendixOf(xml);
    assert.ok(app.length > 0, 'Appendix A to Subpart C not found in the fixture');
    assert.ok(/Business Associate Contracts and Other Arrangement/i.test(app) && /164\.308\(b\)\(1\)/.test(app));
  });

  test('statements the workspace makes about the regulation text hold', () => {
    const all = Object.values(sections).map(s => normalize(decode(s.replace(/<[^>]+>/g, ' ')))).join(' ');
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
