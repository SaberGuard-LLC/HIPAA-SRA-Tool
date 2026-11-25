import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePins, check, report } from '../scripts/scanner-pins.mjs';
import { read } from './helpers.mjs';

const yaml = read('.github/workflows/security.yml');

test('every scanner pin in security.yml is found', () => {
  const pins = parsePins(yaml);
  assert.deepEqual(pins.map(p => p.name), ['Semgrep', 'gitleaks', 'actionlint']);
  for (const p of pins) {
    assert.match(p.version, /^\d+\.\d+\.\d+$/);
    assert.match(p.pin, p.kind === 'image' ? /^sha256:[0-9a-f]{64}$/ : /^[0-9a-f]{64}$/);
  }
});

test('a workflow without a pin is refused', () => {
  assert.throws(() => parsePins(yaml.replace(/GITLEAKS_SHA256:.*/, '')), /gitleaks/);
  assert.throws(() => parsePins(yaml.replace(/semgrep\/semgrep:[^\s]+/, 'semgrep/semgrep:latest')), /Semgrep/);
});

const fake = (latest, pins) => ({
  latestVersion: async repo => latest[repo],
  pinFor: async (p, version) => pins[`${p.name} ${version}`] ?? null
});

test('current pins that match upstream pass', async () => {
  const pins = parsePins(yaml);
  const latest = Object.fromEntries(pins.map(p => [p.release, p.version]));
  const values = Object.fromEntries(pins.map(p => [`${p.name} ${p.version}`, p.pin]));
  const { ok, text } = report(await check(pins, fake(latest, values)));
  assert.ok(ok);
  assert.match(text, /Every scanner pin is current/);
});

test('a newer release is reported with the pin to use, and a changed upstream value is flagged', async () => {
  const pins = parsePins(yaml);
  const semgrep = pins[0];
  const [major, minor, patch] = semgrep.version.split('.').map(Number);
  const next = `${major}.${minor + 1}.${patch}`;
  const latest = Object.fromEntries(pins.map(p => [p.release, p === semgrep ? next : p.version]));
  const values = Object.fromEntries(pins.map(p => [`${p.name} ${p.version}`, p.name === 'actionlint' ? 'sha256:changed' : p.pin]));
  values[`Semgrep ${next}`] = `sha256:${'a'.repeat(64)}`;
  const rows = await check(pins, fake(latest, values));
  assert.deepEqual(rows[0].update, { version: next, pin: `sha256:${'a'.repeat(64)}` });
  assert.equal(rows[2].pinMatches, false);
  const { ok, text } = report(rows);
  assert.equal(ok, false);
  assert.match(text, /2 pins in \.github\/workflows\/security\.yml need attention/);
});

test('an older or equal upstream version is not an update', async () => {
  const pins = parsePins(yaml);
  const latest = Object.fromEntries(pins.map(p => [p.release, '0.0.1']));
  const values = Object.fromEntries(pins.map(p => [`${p.name} ${p.version}`, p.pin]));
  const rows = await check(pins, fake(latest, values));
  assert.ok(rows.every(r => r.update === null));
});
