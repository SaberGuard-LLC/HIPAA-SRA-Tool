/* The host seam: a host that serves a copy of this page (Ward) keeps the
   assessment for the assessor. The public page must stay exactly what the
   README says: no backend, no network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './helpers.mjs';

const app = read('assets/app.js');
const html = read('index.html');

test('the page exposes what a host needs and nothing calls it by default', () => {
  const exposed = app.match(/window\.SRA = \{([^}]*)/)[1];
  for (const name of ['snapshot', 'markSaved', 'isDirty', 'importAssessment', 'attachWardEvidence']) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(exposed), `window.SRA.${name}`);
  }
  for (const f of ['app.js', 'theme.js', 'catalog.js', 'format.js', 'integrity.js', 'ephi-map.js', 'report.js', 'ward.js']) {
    assert.ok(!/SRAHost|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(read(`assets/${f}`)), `${f} makes no network call`);
  }
});

test('saving a file and a host snapshot serialize the same way', () => {
  assert.match(app, /function snapshot\(includeEvidence = true\) \{\s*collectMeta\(\);/);
  assert.match(app, /function exportAssessment\(includeEvidence = true\) \{\s*const payload = snapshot\(includeEvidence\);/);
});

test('the public page still forbids every network connection', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /default-src 'none'/);
  assert.ok(!/host\.js/.test(html), 'no host script on the public page');
});

test('the theme is light unless the address asks for dark, and nothing is kept in browser storage', () => {
  const theme = read('assets/theme.js');
  assert.match(theme, /\? 'dark' : 'light'/);
  assert.match(html, /<script src="assets\/theme\.js"><\/script>/);
  for (const src of [app, theme, read('assets/report.js'), read('assets/format.js'), read('assets/ward.js'), read('assets/ephi-map.js')]) {
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(src), 'no browser storage');
  }
  assert.ok(!/prefers-color-scheme/.test(read('assets/styles.css')), 'the operating system setting does not override the light default');
});

test('fonts are served from this page only', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /font-src 'self'/);
  const css = read('assets/styles.css');
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/["']/g, ''));
  assert.ok(urls.length > 0);
  for (const u of urls) assert.match(u, /^fonts\/inter-[a-z-]+-(400|500)-normal\.woff2$/);
});

test('the stylesheet keeps to two font weights and has no gradients, shadows or forced capitals', () => {
  const css = read('assets/styles.css');
  assert.deepEqual([...new Set([...css.matchAll(/font-weight:\s*(\d+)/g)].map(m => m[1]))].sort(), ['400', '500']);
  assert.ok(!/gradient\(|box-shadow|text-shadow|backdrop-filter|filter:\s*blur|text-transform:\s*uppercase/.test(css));
});

test('a host can embed the workspace and own saving', () => {
  const exposed = app.match(/window\.SRA = \{([^}]*)/)[1];
  for (const name of ['configure', 'navigate', 'setTheme', 'snapshot', 'importAssessment', 'markSaved', 'isDirty']) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(exposed), `window.SRA.${name}`);
  }
  assert.match(app, /function configure\(opts = \{\}\) \{/);
  assert.match(app, /document\.body\.classList\.toggle\('embedded', host\.embedded\)/);
  assert.match(app, /if \(host\.embedded && view === 'start'\) navigate\('overview'\)/);
  assert.match(app, /if \(!name\) name = state\.pristine && !host\.embedded \? 'start' : 'overview';/, 'an embedded page never shows the start screen');
  assert.match(app, /if \(host\.embedded\) emit\('sra:save-requested', \{\}\); else saveFile\(\);/, 'Ctrl or Cmd + S asks the host to save');
  assert.match(read('assets/styles.css'), /\.embedded \.footer\{display:none\}/);
});

test('embedding hides the open and save controls and nothing else', () => {
  const hidden = [...html.matchAll(/<[^>]*data-host-hide[^>]*>/g)].map(m => m[0]);
  const actions = hidden.map(t => (t.match(/data-action="([a-z-]+)"/) || [])[1]).filter(Boolean).sort();
  assert.deepEqual(actions, ['open', 'save', 'save-lean', 'save-protected']);
  for (const id of ['exportBtn2', 'exportNoEvidenceBtn', 'saveProtectedBtn', 'protectNote']) assert.ok(hidden.some(t => t.includes(`id="${id}"`)), id);
  assert.ok(!/data-action="export-csv"[^>]*data-host-hide/.test(html), 'the CSV export stays');
  assert.ok(!/id="(printBtn|previewBtn|themeBtn|fileBtn)"[^>]*data-host-hide/.test(html), 'print, preview, theme and the menu button stay');
});

test('the page tells a host when work becomes unsaved and when it is saved, once per change', () => {
  assert.match(app, /function markDirty\(\) \{\s*if \(state\.dirty\) return;\s*state\.dirty = true;\s*emit\('sra:dirty', \{ dirty: true \}\);/);
  assert.match(app, /function markClean\(how\) \{[\s\S]*?emit\('sra:saved', \{ how, savedAt: state\.savedAt \}\);/);
  assert.match(app, /const emit = \(name, detail\) => document\.dispatchEvent\(new CustomEvent\(name, \{ detail \}\)\);/);
  assert.match(app, /function markSaved\(message\) \{\s*markClean\('host'\);/);
  assert.match(app, /if \(!includeEvidence && embedded\) markDirty\(\); else markClean\(how\);/);
  assert.match(app, /if \(!opts\.keepClean\) \{ markDirty\(\);/);
  assert.equal((app.match(/state\.dirty = true/g) || []).length, 1, 'only markDirty sets the flag');
});

test('the public page behaves as before when nothing calls configure', () => {
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal((code.match(/(?<!function )\bconfigure\(/g) || []).length, 0, 'configure is defined but never called by the page');
  assert.ok(!/class="[^"]*\bembedded\b/.test(html), 'the page does not start embedded');
  assert.match(app, /const host = \{ embedded: false \};/);
});

test('leaving a field without changing it does not mark the work unsaved', () => {
  assert.match(app, /const h = \(\) => \{\s*if \(state\.meta\[el\.id\] === el\.value\) return;/);
});
