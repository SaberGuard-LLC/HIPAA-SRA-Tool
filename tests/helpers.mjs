/* Test helpers. The tool's scripts are classic browser scripts, so they are
   evaluated in one shared vm context with a minimal window object. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

export function loadContext(files = ['assets/catalog.js', 'assets/report.js']) {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of files) new vm.Script(read(f), { filename: f }).runInContext(ctx);
  return ctx;
}

/* Lexical declarations (const) made by a script live in the context, not on
   the sandbox object, so read them back with a second script. */
export function globalsOf(ctx, names) {
  return new vm.Script(`({ ${names.join(', ')} })`).runInContext(ctx);
}
