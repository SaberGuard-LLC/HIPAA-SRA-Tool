import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { read, ROOT } from './helpers.mjs';
import { sampleScript } from '../scripts/build-sample.mjs';

const html = read('index.html');
const app = read('assets/app.js');
const css = read('assets/styles.css');
const VIEWS = ['start', 'overview', 'profile', 'inventory', 'map', 'catalog', 'risks', 'attestation', 'report'];

test('each step is its own view, reached by an address', () => {
  for (const v of VIEWS) assert.match(html, new RegExp(`data-view="${v}"`), v);
  for (const v of VIEWS.slice(1)) assert.match(html, new RegExp(`<a href="#${v}" data-step="${v}">`), `rail link to ${v}`);
  assert.match(app, /addEventListener\('hashchange', route\)/);
  assert.match(app, /history\.replaceState\(history\.state, '', `#catalog\/\$\{id\}`\)/, 'a catalog row can be linked');
  assert.ok(!/class="affiliation/.test(html), 'the affiliation bar under the header is gone');
  assert.ok(!/hero-note/.test(html), 'the duplicate hero note is gone');
});

test('the start screen offers three ways in and a quiet link to SaberGuard', () => {
  for (const id of ['startNew', 'startOpen', 'startSample']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<a href="https:\/\/saberguard\.tech" rel="noopener">/);
  assert.match(html, /id="startChecked"/);
  assert.match(app, /CATALOG_SOURCE\.checked/);
});

test('the File menu is a menu button with the five file actions', () => {
  assert.match(html, /id="fileBtn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="fileMenu"/);
  assert.match(html, /id="fileMenu" role="menu" aria-labelledby="fileBtn" hidden/);
  const actions = [...html.matchAll(/role="menuitem" tabindex="-1" data-action="([a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(actions, ['open', 'save', 'save-protected', 'save-lean', 'export-csv']);
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab']) assert.ok(app.includes(`'${key}'`), key);
});

test('catalog shortcuts skip text fields and are listed in a dialog', () => {
  assert.match(app, /isTyping\(e\.target\)/);
  assert.match(app, /const KEY_STATUS = \['met', 'partial', 'not-met', 'na', 'alt', 'doc'\]/);
  assert.match(html, /<dialog class="dialog" id="keysDialog" aria-labelledby="keysTitle">/);
  for (const k of ['J', 'K', '1', '2', '3', '4', '5', '6', '/']) assert.ok(html.includes(`<kbd>${k}</kbd>`), k);
  assert.match(app, /role="radiogroup"/);
  assert.match(app, /role="radio"/);
});

test('the sample loads from a same-origin script generated from the sample JSON', () => {
  assert.equal(read('assets/sample.js'), sampleScript(), 'run node scripts/build-sample.mjs after changing the sample');
  assert.match(app, /s\.src = 'assets\/sample\.js'/);
  assert.ok(!/<script src="assets\/sample\.js">/.test(html), 'the sample is loaded only when asked for');
});

test('the interface logo is small and sized, with a separate favicon', () => {
  assert.match(html, /<img class="logo" src="assets\/logo\.png" width="115" height="28" alt="">/);
  assert.ok(statSync(join(ROOT, 'assets/logo.png')).size < 20000);
  assert.match(html, /<link rel="icon" href="assets\/favicon\.png" type="image\/png" sizes="64x64">/);
  assert.ok(statSync(join(ROOT, 'assets/favicon.png')).size < 10000);
  assert.ok(!html.includes('SaberGuard_1.png'), 'the 80 KB original stays for the README and the printed letterhead');
});

function tokens(block) {
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
}
const light = tokens(css.slice(css.indexOf(':root{'), css.indexOf(':root[data-theme="dark"]')));
const dark = { ...light, ...tokens(css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf('*{box-sizing'))) };
const lum = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('tokens carry the agreed light values', () => {
  assert.equal(light['text-3'], '#5f6b7c');
  assert.equal(light.border, '#e1e5eb');
  assert.equal(light.bg, '#f6f7f9');
  assert.equal(light['partial-fill'], '#d99a12');
  assert.deepEqual([light['good-bg'], light['good-ink']], ['#e6f4ea', '#11562a']);
  assert.deepEqual([light['warn-bg'], light['warn-ink']], ['#fcf3d6', '#6b4a00']);
  assert.deepEqual([light['crit-bg'], light['crit-ink']], ['#fbeaea', '#9b1c1c']);
  assert.deepEqual([light['na-bg'], light['na-ink']], ['#edf0f4', '#475262']);
  assert.ok(dark['partial-fill'] && dark['partial-fill'] !== light['partial-fill'], 'a dark value is defined');
});

for (const [name, t] of [['light', light], ['dark', dark]]) {
  test(`text and fills meet contrast minimums in the ${name} theme`, () => {
    const text = [['text', 'bg'], ['text-2', 'bg'], ['text-3', 'bg'], ['text-2', 'surface'], ['text-3', 'surface'], ['good-ink', 'good-bg'], ['warn-ink', 'warn-bg'], ['crit-ink', 'crit-bg'], ['na-ink', 'na-bg'], ['partial-fill-ink', 'partial-fill'], ['surface', 'good'], ['surface', 'crit'], ['accent-text', 'accent-soft'], ['accent-ink', 'accent']];
    for (const [fg, bg] of text) assert.ok(ratio(t[fg], t[bg]) >= 4.5, `${fg} on ${bg}: ${ratio(t[fg], t[bg]).toFixed(2)}`);
    const fills = name === 'dark' ? ['partial-fill', 'good', 'crit'] : ['good', 'crit'];
    for (const fill of fills) assert.ok(ratio(t[fill], t.surface) >= 3, `${fill} against surface: ${ratio(t[fill], t.surface).toFixed(2)}`);
  });
}

test('targets are large enough and focus is never hidden under the header', () => {
  assert.match(css, /scroll-padding-top:calc\(var\(--header-h\) \+ 12px\)/);
  assert.match(css, /\.top-actions \.btn\{min-height:36px\}/);
  assert.match(css, /\.radio\{min-height:40px;/);
  assert.match(css, /\.pick-remove\{min-width:24px;min-height:24px\}/);
  assert.match(css, /--radius:8px;--radius-sm:6px;/);
  assert.ok(!/border-radius:99px/.test(css), 'pills and chips use 999px');
});
