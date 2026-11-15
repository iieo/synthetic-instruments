import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const only = process.argv.slice(2);
const scripts = readdirSync(join(root, 'demos')).filter((f) => f.endsWith('.mjs') && (!only.length || only.includes(f.slice(0, -4)))).sort();
const failed = [];
for (const f of scripts) {
  console.log(`\n> demos/${f}`);
  const r = spawnSync(process.execPath, [join('demos', f)], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) failed.push(f);
}
if (failed.length) {
  console.error(`\nFehlgeschlagen: ${failed.join(', ')}`);
  process.exit(1);
}
