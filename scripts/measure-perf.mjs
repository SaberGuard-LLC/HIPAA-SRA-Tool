#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = Number(process.env.RUNS || 5);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon' };

function serve() {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.statusCode = 404; res.end(); return; }
    res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream');
    res.end(readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const round = n => n == null ? null : Math.round(n * 10) / 10;

function bytes() {
  const out = {};
  const list = dir => readdirSync(join(ROOT, dir)).filter(f => /\.(js|css)$/.test(f)).map(f => `${dir}/${f}`);
  for (const f of list('assets')) {
    const buf = readFileSync(join(ROOT, f));
    out[f] = { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  }
  return out;
}

async function run(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    window.__perf = { events: [], longtasks: [], lcp: 0, cls: 0 };
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__perf.events.push({ name: e.name, duration: e.duration, id: e.interactionId, start: e.startTime }))).observe({ type: 'event', durationThreshold: 16, buffered: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => window.__perf.longtasks.push({ start: e.startTime, duration: e.duration }))).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => { window.__perf.lcp = e.startTime; })).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__perf.cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const load = await page.evaluate(() => ({ lcp: window.__perf.lcp, cls: window.__perf.cls, nodes: document.getElementsByTagName('*').length }));

  const sample = readFileSync(join(ROOT, 'samples/example-health-clinic-hipaa-sra-2026-09-06.json'), 'utf8');
  await page.evaluate(async text => { await window.SRA.importAssessment({ name: 'sample.json', text: async () => text }); }, sample);
  await page.evaluate(() => { if (window.SRA.navigate) window.SRA.navigate('catalog'); else location.hash = 'controlsSection'; });
  await page.waitForTimeout(300);
  const catalogNodes = await page.evaluate(() => document.getElementsByTagName('*').length);

  const mark = () => page.evaluate(() => performance.now());
  const slice = (from, to) => page.evaluate(([a, b]) => ({
    events: window.__perf.events.filter(e => e.start >= a && e.start <= b && e.id),
    longtasks: window.__perf.longtasks.filter(e => e.start >= a && e.start <= b)
  }), [from, to]);

  const toggle = page.locator('.toggle-detail').first();
  if (await toggle.count() && await toggle.isVisible()) await toggle.click();
  const notes = page.locator('.control-notes:visible').first();
  await notes.click();
  let t0 = await mark();
  await page.keyboard.type('Reviewed the policy a', { delay: 60 });
  await page.waitForTimeout(300);
  const typing = await slice(t0, await mark());

  t0 = await mark();
  for (const f of ['gaps', 'technical', 'all']) {
    await page.locator(`[data-filter="${f}"]`).first().click();
    await page.waitForTimeout(200);
  }
  const filters = await slice(t0, await mark());

  const ten = Buffer.alloc(10 * 1024 * 1024, 7);
  const input = page.locator('.evidence-input').first();
  t0 = await mark();
  const attachStart = Date.now();
  await input.setInputFiles({ name: 'ten.bin', mimeType: 'application/octet-stream', buffer: ten });
  await page.waitForFunction(() => [...document.querySelectorAll('.evidence-list, .evidence-table')].some(el => el.textContent.includes('ten.bin')), null, { timeout: 60000 });
  const attachMs = Date.now() - attachStart;
  const attach = await slice(t0, await mark());

  const saveOnce = () => page.evaluate(async () => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    const a = performance.now();
    await window.SRA.exportAssessment(true);
    const b = performance.now();
    HTMLAnchorElement.prototype.click = orig;
    return b - a;
  });
  const save10 = await saveOnce();

  const more = [Buffer.alloc(10 * 1024 * 1024, 8), Buffer.alloc(5 * 1024 * 1024 - 400, 9)];
  await page.locator('.evidence-input').first().setInputFiles([
    { name: 'ten-b.bin', mimeType: 'application/octet-stream', buffer: more[0] },
    { name: 'five.bin', mimeType: 'application/octet-stream', buffer: more[1] }
  ]);
  await page.waitForFunction(() => [...document.querySelectorAll('.evidence-list, .evidence-table')].some(el => el.textContent.includes('five.bin')), null, { timeout: 60000 });
  const evidenceBytes = await page.evaluate(() => Object.values(window.SRA.state.controls).reduce((n, c) => n + (c.evidence || []).reduce((m, e) => m + (e.size || 0), 0), 0));
  const save25 = await saveOnce();

  await page.close();
  const inp = s => Math.max(0, ...s.events.map(e => e.duration));
  const lt = s => s.longtasks.filter(t => t.duration > 50);
  return {
    lcp: load.lcp, cls: load.cls, nodesStart: load.nodes, nodesCatalog: catalogNodes,
    typingInp: inp(typing), typingLong: lt(typing).length, typingLongMax: Math.max(0, ...lt(typing).map(t => t.duration)),
    filterInp: inp(filters), filterLong: lt(filters).length,
    attachMs, attachLong: lt(attach).length, attachLongMax: Math.max(0, ...lt(attach).map(t => t.duration)),
    save10, save25, evidenceMB: evidenceBytes / 1048576
  };
}

const server = await serve();
const url = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch();
const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(await run(browser, url));
await browser.close();
server.close();

const keys = Object.keys(runs[0]);
const summary = Object.fromEntries(keys.map(k => [k, { median: round(median(runs.map(r => r[k]))), min: round(Math.min(...runs.map(r => r[k]))), max: round(Math.max(...runs.map(r => r[k]))) }]));
console.log(JSON.stringify({ runs: RUNS, summary, bytes: bytes() }, null, 2));
