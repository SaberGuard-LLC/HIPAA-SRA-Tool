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
