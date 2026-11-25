#!/usr/bin/env node
import { readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIGEST = 'sha256:[0-9a-f]{64}';

export function parsePins(yaml) {
  const image = (name, repo) => {
    const m = new RegExp(`${repo.replace('/', '\\/')}:(\\d+\\.\\d+\\.\\d+)@(${DIGEST})`).exec(yaml);
    if (!m) throw new Error(`No pinned ${name} image in security.yml`);
    return { name, kind: 'image', repo, release: repo, version: m[1], pin: m[2] };
  };
  const version = /GITLEAKS_VERSION:\s*([\d.]+)/.exec(yaml);
  const sum = /GITLEAKS_SHA256:\s*([0-9a-f]{64})/.exec(yaml);
  if (!version || !sum) throw new Error('No pinned gitleaks version and SHA-256 in security.yml');
  return [
    image('Semgrep', 'semgrep/semgrep'),
    { name: 'gitleaks', kind: 'tarball', repo: 'gitleaks/gitleaks', release: 'gitleaks/gitleaks', version: version[1], pin: sum[1] },
    image('actionlint', 'rhysd/actionlint')
  ];
}

const newer = (a, b) => {
  const [x, y] = [a, b].map(v => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

export async function check(pins, upstream) {
  const rows = [];
  for (const p of pins) {
    const latest = await upstream.latestVersion(p.release);
    const current = await upstream.pinFor(p, p.version);
    const row = { name: p.name, version: p.version, latest, pinMatches: current === p.pin, update: null };
    if (newer(latest, p.version)) row.update = { version: latest, pin: await upstream.pinFor(p, latest) };
    rows.push(row);
  }
  return rows;
}

export function report(rows) {
  const lines = ['| Scanner | Pinned | Latest | Pinned value matches upstream | New pin |', '| --- | --- | --- | --- | --- |'];
  for (const r of rows) {
    lines.push(`| ${r.name} | ${r.version} | ${r.latest} | ${r.pinMatches ? 'Yes' : 'No'} | ${r.update ? `\`${r.update.pin}\`` : 'None needed'} |`);
  }
  const stale = rows.filter(r => r.update || !r.pinMatches);
  lines.push('', stale.length
    ? `${stale.length} pin${stale.length === 1 ? '' : 's'} in .github/workflows/security.yml need attention. See "Keeping scanner pins current" in docs/development.md.`
    : 'Every scanner pin is current and matches upstream.');
  return { text: lines.join('\n'), ok: stale.length === 0 };
}

export function liveUpstream(token = process.env.GITHUB_TOKEN) {
  const get = async (url, headers = {}) => {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return res;
  };
  const gh = token ? { Authorization: `Bearer ${token}` } : {};
  return {
    async latestVersion(repo) {
      const data = await (await get(`https://api.github.com/repos/${repo}/releases/latest`, { Accept: 'application/vnd.github+json', ...gh })).json();
      return String(data.tag_name).replace(/^v/, '');
    },
    async pinFor(p, version) {
      if (p.kind === 'image') {
        const data = await (await get(`https://hub.docker.com/v2/repositories/${p.repo}/tags/${version}`)).json();
        return data.digest;
      }
      const sums = await (await get(`https://github.com/${p.repo}/releases/download/v${version}/gitleaks_${version}_checksums.txt`)).text();
      const line = sums.split('\n').find(l => l.endsWith(`gitleaks_${version}_linux_x64.tar.gz`));
      return line ? line.split(/\s+/)[0] : null;
    }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const pins = parsePins(readFileSync(join(root, '.github/workflows/security.yml'), 'utf8'));
  const { text, ok } = report(await check(pins, liveUpstream()));
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  process.exit(ok ? 0 : 1);
}
