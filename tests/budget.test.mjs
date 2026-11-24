import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { read } from './helpers.mjs';

const BUDGETS = {
  'app.js': 29700,
  'catalog.js': 17900,
  'ephi-map.js': 7700,
  'format.js': 4100,
  'integrity.js': 3500,
  'report.js': 20800,
  'sample.js': 11700,
  'styles.css': 13000,
  'theme.js': 600,
  'ward.js': 8300
};

const gzipped = file => gzipSync(Buffer.from(read(`assets/${file}`), 'utf8'), { level: 9 }).length;

test('every script and the stylesheet has a size budget', () => {
  const files = readdirSync(new URL('../assets', import.meta.url)).filter(f => /\.(js|css)$/.test(f)).sort();
  assert.deepEqual(files, Object.keys(BUDGETS).sort(), 'add a budget in tests/budget.test.mjs for a new file, or remove one for a deleted file');
});

for (const [file, budget] of Object.entries(BUDGETS)) {
  test(`${file} stays within its gzip budget`, () => {
    const size = gzipped(file);
    assert.ok(size <= budget, `${file} is ${size} bytes gzipped, over its budget of ${budget}. Shrink it, or raise the budget in a commit that says why and update PERF.md.`);
  });
}
