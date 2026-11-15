// DUSTFALL — the entry program (Node 22, standard library only). It hands
// the game in: copies this repository's game/ and screenshots/ into the
// output directory and writes /output/dossier.json with make.fun's own
// dossier library (vendor/makefun-threejs.ts, the kit's copy unchanged).
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The output is deterministic: the same repository always writes the same
// bytes, so the grader's two runs agree.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// The dossier caps from the bounty's gate: 160 KiB of source text, at most
// 4 screenshots of 256 KiB each, game/ at most 993 entries / 48 MiB.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy one tree when it exists; the screenshots folder is optional in the
// repository (the gate refuses an entry with no screenshots, but the copy
// itself must not crash on a missing directory).
function copyTreeIfPresent(name) {
  const from = join(repoRoot, name);
  if (!existsSync(from)) return;
  cpSync(from, join(outputDir, name), { recursive: true });
}

function handIn() {
  mkdirSync(outputDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
  copyTreeIfPresent('screenshots');
  const dossier = buildDossier(outputDir, DOSSIER_CAPS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  return dossier.length;
}

const dossierBytes = handIn();
console.log(`DUSTFALL handed in: dossier.json is ${dossierBytes} bytes.`);
