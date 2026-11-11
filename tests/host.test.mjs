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
  assert.ok(!/SRAHost|fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(app), 'app.js makes no network call');
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
