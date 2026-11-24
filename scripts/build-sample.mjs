#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SAMPLE_JSON = 'samples/example-health-clinic-hipaa-sra-2026-09-06.json';
export const SAMPLE_SCRIPT = 'assets/sample.js';

export function sampleScript() {
  const data = JSON.parse(readFileSync(join(root, SAMPLE_JSON), 'utf8'));
  return `window.SRA_SAMPLE = ${JSON.stringify({ name: SAMPLE_JSON.split('/').pop(), data })};\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(root, SAMPLE_SCRIPT), sampleScript());
  console.log(`Wrote ${SAMPLE_SCRIPT} from ${SAMPLE_JSON}`);
}
