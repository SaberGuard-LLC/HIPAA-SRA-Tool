#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/fingerprint.mjs <assessment.json>');
  process.exit(2);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { TextEncoder, TextDecoder, atob, btoa, crypto: globalThis.crypto };
sandbox.window = sandbox;
const ctx = vm.createContext(sandbox);
new vm.Script(readFileSync(join(root, 'assets/integrity.js'), 'utf8')).runInContext(ctx);
const integrity = new vm.Script('SRAIntegrity').runInContext(ctx);
const data = JSON.parse(readFileSync(file, 'utf8'));
if (integrity.isProtected(data)) {
  console.error('This file is passphrase protected. Open it in the workspace to see its fingerprint in step 7.');
  process.exit(1);
}
const print = integrity.fingerprint(data);
console.log(integrity.grouped(print));
console.log(`First 16 characters, as printed on the report cover: ${print.slice(0, 16)}`);
