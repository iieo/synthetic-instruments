import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../../out/', import.meta.url));

// Path of a demo file in out/ at the repo root, independent of the working directory.
export function outPath(name) {
  mkdirSync(DIR, { recursive: true });
  return DIR + name;
}
