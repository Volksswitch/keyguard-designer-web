#!/usr/bin/env node
// publish-scad-version.mjs — regenerate latest_scad_version.json from the
// current keyguard.scad. Trigger phrase: "publish scad version".
//
// Reads keyguard_designer_version from the .scad source repo's keyguard.scad and
// writes the manifest the web app fetches to offer clinicians an in-app update.
// Run this at PUBLISH time — i.e. when the keyguard.scad on disk is the one you
// are pushing to Volksswitch/keyguard (main). Existing `notes` are preserved so
// hand-written release notes survive re-runs.

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));      // web-app repo root
// Sibling .scad project — resolves on both machines via OneDrive (Windows is
// case-insensitive, so .../Keyguard/../My SCAD files lands in the right place).
const designerRoot = join(root, '..', 'My SCAD files', 'keyguard designer');
const scadPath = join(designerRoot, 'keyguard.scad');
const outPath  = join(designerRoot, 'latest_scad_version.json');

const scad = readFileSync(scadPath, 'utf8');
const m = scad.match(/keyguard_designer_version\s*=\s*(\d+)/);
if (!m) {
  console.error(`ERROR: keyguard_designer_version not found in ${scadPath}`);
  process.exit(1);
}
const version = parseInt(m[1], 10);

// Preserve a hand-written notes line if one already exists.
let notes = `Keyguard Designer v${version}.`;
try {
  const prev = JSON.parse(readFileSync(outPath, 'utf8'));
  if (prev && typeof prev.notes === 'string' && prev.notes.trim()) notes = prev.notes;
} catch { /* no prior file — use the default */ }

const manifest = {
  version,
  scad_filename: `keyguard_v${version}.scad`,
  scad_url: 'https://raw.githubusercontent.com/Volksswitch/keyguard/main/keyguard.scad',
  notes,
};

writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${outPath}\n`);
console.log(JSON.stringify(manifest, null, 2));
console.log(`\nNext: commit & push latest_scad_version.json to Volksswitch/keyguard (main),`);
console.log(`and make sure keyguard.scad on main is the v${version} this manifest names.`);
