import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContext, globalsOf, read, ROOT } from './helpers.mjs';

const ctx = loadContext(['assets/catalog.js', 'assets/format.js', 'assets/ephi-map.js']);
const { SRAMap, SRAFormat } = globalsOf(ctx, ['SRAMap', 'SRAFormat']);
const sample = JSON.parse(read('tests/fixtures/example-v4.json'));
const GOLDEN = join(ROOT, 'tests', 'fixtures', 'map-golden.svg');
const byName = name => sample.assets.find(a => a.name === name);
const flowOf = (from, to) => sample.flows.find(f => f.from === byName(from).id && f.to === byName(to).id);
const has = (svg, re) => re.test(svg);

test('the same file produces the same SVG, byte for byte', () => {
  const a = SRAMap.toString(SRAMap.build(sample).tree);
  const b = SRAMap.toString(SRAMap.build(JSON.parse(JSON.stringify(sample))).tree);
  const c = SRAMap.toString(SRAMap.build(SRAFormat.upgrade(sample)).tree);
  assert.equal(a, b);
  assert.equal(a, c);
  if (process.env.UPDATE_GOLDEN) writeFileSync(GOLDEN, a + '\n');
  assert.ok(existsSync(GOLDEN), 'golden file missing; run with UPDATE_GOLDEN=1 to create it');
  assert.equal(a + '\n', readFileSync(GOLDEN, 'utf8'), 'map output differs from tests/fixtures/map-golden.svg; if the change is intended, run with UPDATE_GOLDEN=1');
});

test('the SVG is one well-formed element with the three columns and an accessible label', () => {
  const svg = SRAMap.toString(SRAMap.build(sample).tree);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 710 '));
  assert.ok(svg.endsWith('</svg>'));
  const opens = (svg.match(/<(svg|g|rect|text|path|polygon|line)\b/g) || []).length;
  const closes = (svg.match(/<\/(svg|g|rect|text|path|polygon|line)>/g) || []).length;
  assert.equal(opens, closes, 'every element is closed');
  for (const t of ['IN THE PRACTICE', 'SYSTEMS', 'OUTSIDE PARTIES', 'where ePHI is kept']) assert.ok(svg.includes(t), t);
  assert.ok(!/patient data/i.test(svg), 'the map says ePHI, not patient data');
  assert.ok(/aria-label="Map of where ePHI lives and moves for Example Counseling Practice\./.test(svg));
});

test('direct-entry flows are not drawn and the person who only types is folded away', () => {
  const b = SRAMap.build(sample);
  const svg = SRAMap.toString(b.tree);
  const entry = sample.flows.filter(f => f.transport === 'direct-entry');
  assert.equal(entry.length, 2);
  for (const f of entry) assert.ok(!svg.includes(`data-flow="${f.id}"`), `${f.id} is direct entry`);
  assert.deepEqual([...b.view.hidden].map(a => a.name), ['Therapist (owner)']);
  assert.ok(!svg.includes(`data-asset="${byName('Therapist (owner)').id}"`));
});

test('backups are listed inside the system they copy', () => {
  const b = SRAMap.build(sample);
  const svg = SRAMap.toString(b.tree);
  const ehr = b.view.byId[byName('EHR and client portal').id];
  assert.deepEqual([...ehr.copies].map(c => c.a.name), ['EHR vendor backups']);
  const laptop = b.view.byId[byName('Therapist laptop').id];
  assert.deepEqual([...laptop.copies].map(c => c.a.name).sort(), ['Laptop cloud backup', 'USB drive']);
  assert.ok(svg.includes('COPIES KEPT'));
  assert.ok(!b.view.nodes.some(n => n.a.zone === 'backup'), 'no backup gets its own box');
  assert.equal(b.view.absorbed.length, 3);
});

test('a label appears only on flows that are not encrypted or not checked', () => {
  const b = SRAMap.build(sample);
  const svg = SRAMap.toString(b.tree);
  const labelled = [...svg.matchAll(/<g class="lab[^"]*" data-flow="([^"]+)"/g)].map(m => m[1]).sort();
  const expected = sample.flows.filter(f => f.transport !== 'direct-entry' && (f.inTransit === 'no' || f.inTransit === 'unknown') && !b.view.absorbed.some(a => a.id === f.id)).map(f => f.id).sort();
  assert.deepEqual(labelled, expected);
  assert.ok(svg.includes('>not encrypted<'));
  assert.ok(svg.includes('>not checked<'));
  const ok = flowOf('Therapist laptop', 'EHR and client portal');
  assert.ok(!labelled.includes(ok.id), 'an encrypted flow with no extra risk has no label');
});

test('one tag per finding, using the risk register reference', () => {
  const svg = SRAMap.toString(SRAMap.build(sample).tree);
  assert.ok(/<g class="node r-high" transform="[^"]+" data-asset="s3">/.test(svg), 'email has a high finding');
  assert.ok(svg.includes('>R-01 · High<'));
  assert.ok(svg.includes('>R-06 · Low<'));
  assert.ok(svg.includes('>R-02<'), 'a copy carries the short tag');
  assert.ok(!/>R\d/.test(svg), 'tags use the R-01 form');
});

test('nothing flagged is left out, and every flag in the sample has a linked risk', () => {
  const b = SRAMap.build(sample);
  const svg = SRAMap.toString(b.tree);
  const flaggedIds = sample.assets.filter(a => (a.vendor && ['no', 'unknown'].includes(a.baa)) || ['no', 'unknown'].includes(a.atRest) || ['no', 'unknown'].includes(a.mfa)).map(a => a.id);
  assert.ok(flaggedIds.length >= 5);
  for (const id of flaggedIds) assert.ok(svg.includes(`data-asset="${id}"`), `${id} drawn`);
  assert.deepEqual([...b.unlinked], []);
  assert.deepEqual(JSON.parse(JSON.stringify(b.facts)), { systems: 15, flows: 17, out: 14, weak: 5, noBaa: 3, unclassified: 0, findings: 6 });
});

test('a flagged row or flow with no linked risk is reported', () => {
  const state = JSON.parse(JSON.stringify(sample));
  state.risks = state.risks.filter(r => r.id !== 'R1');
  const u = [...SRAMap.unlinked(state)];
  assert.ok(u.some(x => x.type === 'asset' && x.what === 'Email and calendar' && /no BAA/.test(x.why)));
  assert.ok(u.some(x => x.type === 'flow' && /Not encrypted in transit/.test(x.why)));
  const closed = JSON.parse(JSON.stringify(sample));
  closed.risks[0].status = 'Closed';
  assert.ok([...SRAMap.unlinked(closed)].length > 0, 'a closed risk does not cover a flag');
});

test('an unclassified row is drawn as unclassified in the systems column, not defaulted silently', () => {
  const state = JSON.parse(JSON.stringify(sample));
  const row = state.assets.find(a => a.name === 'Office printer and scanner');
  row.kind = 'unknown'; row.zone = 'unknown';
  const b = SRAMap.build(state);
  const svg = SRAMap.toString(b.tree);
  const node = b.view.byId[row.id];
  assert.equal(node.col, 1);
  assert.ok(new RegExp(`data-asset="${row.id}"><rect class="box unclassified"`).test(svg));
  assert.ok(svg.includes('Unclassified: kind or zone not set'));
  assert.equal(b.facts.unclassified, 1);
});

test('an empty inventory still yields an SVG', () => {
  const svg = SRAMap.toString(SRAMap.build({ meta: {}, assets: [], flows: [], risks: [] }).tree);
  assert.ok(svg.startsWith('<svg') && svg.includes('IN THE PRACTICE'));
});
