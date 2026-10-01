#!/usr/bin/env node
// Text lint for the SaberGuard SRA Workspace.
// Fails on em dashes (U+2014), emoji, and a list of banned phrases in the
// files a reader sees: index.html, assets/, docs/, README.md and samples/.
//
// Verbatim quotations are exempt, because the regulation uses both em dashes
// and some of the banned words. A quotation is marked in one of three ways:
// - a JavaScript or CSS line that starts with the block comment "quote"
//   (slash, star, the word quote, star, slash); the whole line is skipped
// - an HTML element that carries the attribute data-quote, or a blockquote
// - a Markdown blockquote line (starts with ">")
// Nothing else is exempt. Run: node scripts/lint-text.mjs [paths...]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const DEFAULT_PATHS = ['index.html', 'assets', 'docs', 'README.md', 'samples'];
const EXTENSIONS = new Set(['.html', '.js', '.mjs', '.cjs', '.css', '.md', '.json', '.svg', '.txt']);
const BANNED = [
  ['ensure', /\bensur(e|es|ed|ing)\b/i],
  ['leverage', /\bleverag(e|es|ed|ing)\b/i],
  ['robust', /\brobust(ly|ness)?\b/i],
  ['seamless', /\bseamless(ly)?\b/i],
  ['comprehensive', /\bcomprehensive(ly|ness)?\b/i],
  ['empower', /\bempower(s|ed|ing|ment)?\b/i],
  ['streamline', /\bstreamlin(e|es|ed|ing)\b/i],
  ['cutting-edge', /\bcutting[- ]edge\b/i],
  ['best-in-class', /\bbest[- ]in[- ]class\b/i],
  ['peace of mind', /\bpeace of mind\b/i],
  ["in today's", /\bin today's\b/i],
  ["it's important to note", /\bit's important to note\b/i],
  ["whether you're", /\bwhether you're\b/i]
];
/* Extended_Pictographic covers emoji. The three text symbols below carry that
   property but are ordinary typography, and plain arrows (U+2190 to U+21FF)
   are allowed in tables by the style rules, so they pass. */
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|️|[\u{1F3FB}-\u{1F3FF}]/u;
const EMOJI_ALLOWED = /[\u00A9\u00AE\u2122\u2190-\u21FF]/;

function listFiles(path) {
  if (!existsSync(path)) return [];
  const st = statSync(path);
  if (st.isFile()) return EXTENSIONS.has(extname(path)) ? [path] : [];
  return readdirSync(path).flatMap(name => listFiles(join(path, name)));
}

/* Replace quoted regions with spaces of the same length so line numbers hold. */
function blank(text, re) {
  return text.replace(re, m => m.replace(/[^\n]/g, ' '));
}
function stripQuotes(text, ext) {
  let out = text;
  if (ext === '.html' || ext === '.md' || ext === '.svg') {
    out = blank(out, /<blockquote\b[\s\S]*?<\/blockquote>/gi);
    out = blank(out, /<([a-z][a-z0-9-]*)\b[^>]*\bdata-quote\b[^>]*>[\s\S]*?<\/\1>/gi);
  }
  if (ext === '.md') out = out.split('\n').map(l => /^\s*>/.test(l) ? ' '.repeat(l.length) : l).join('\n');
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.css') {
    out = out.split('\n').map(l => /^\s*\/\* quote \*\//.test(l) ? ' '.repeat(l.length) : l).join('\n');
  }
  return out;
}

function lintFile(path) {
  const ext = extname(path);
  const raw = readFileSync(path, 'utf8');
  const text = stripQuotes(raw, ext).replace(/[’‘]/g, "'");
  const findings = [];
  text.split('\n').forEach((line, i) => {
    const where = `${path}:${i + 1}`;
    if (line.includes('—')) findings.push(`${where}: em dash (U+2014)`);
    const chars = [...line].filter(ch => EMOJI.test(ch) && !EMOJI_ALLOWED.test(ch));
    if (chars.length) findings.push(`${where}: emoji ${chars.map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' ')}`);
    for (const [name, re] of BANNED) if (re.test(line)) findings.push(`${where}: banned phrase "${name}"`);
  });
  return findings;
}

const args = process.argv.slice(2);
const paths = (args.length ? args : DEFAULT_PATHS).flatMap(listFiles);
const findings = paths.flatMap(lintFile);
if (findings.length) {
  console.error(findings.join('\n'));
  console.error(`\nText lint: ${findings.length} finding${findings.length === 1 ? '' : 's'} in ${paths.length} files.`);
  process.exit(1);
}
console.log(`Text lint: ${paths.length} files clean.`);
