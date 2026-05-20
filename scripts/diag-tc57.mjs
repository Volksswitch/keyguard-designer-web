// diag-tc57.mjs — Reproduces the TC57 viewport-vs-export STL divergence by
// driving openscad-wasm directly with each pipeline's exact arg list, then
// runs admesh on each output. Written when we discovered that app.html's
// renderExportBytes was producing membrane-bearing STLs for TC57 even though
// the on-screen viewport was clean. The variants table at the bottom of the
// script's output is what established that adding -D echo_dims="yes" and
// -D show_oa_highlights="no" to the export args (matching the viewport's
// keyguard render) flips Manifold from a broken evaluation back to a clean
// one. Keep this around as a smoke test for future Manifold-WASM upgrades —
// if `viewport == exp+both` ever stops being byte-identical, the fix has
// drifted. Requires `admesh` on PATH.
//
// Run from the project root:   node scripts/diag-tc57.mjs

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createOpenSCAD } from '../openscad-wasm/openscad.js';
import { addFonts } from '../openscad-wasm/openscad.fonts.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCAD_ROOT    = path.resolve(PROJECT_ROOT, '../My SCAD files/keyguard designer');
const TC_DIR       = path.join(SCAD_ROOT, 'tests/cases/Test Case 57');
const OUT_DIR      = path.join(PROJECT_ROOT, 'output', 'diag-tc57');
fs.mkdirSync(OUT_DIR, { recursive: true });

const scadText  = fs.readFileSync(path.join(SCAD_ROOT, 'keyguard.scad'), 'utf8');
const jsonText  = fs.readFileSync(path.join(SCAD_ROOT, 'keyguard.json'), 'utf8');
const oaText    = fs.readFileSync(path.join(TC_DIR, 'openings_and_additions.txt'), 'utf8');

const VIEWPORT_ARGS = [
  '/keyguard.scad', '-o', '/keyguard.stl',
  '--backend=Manifold',
  '-p', '/keyguard.json', '-P', 'Test Case 57',
  '-D', 'fudge=0.05', '-D', 'ff=0.05',
  '-D', 'include_screenshot="no"',
  '-D', 'echo_dims="yes"',
  '-D', 'show_oa_highlights="no"',
];

const EXPORT_ARGS = [
  '/keyguard.scad', '-o', '/keyguard.stl',
  '--backend=Manifold',
  '-p', '/keyguard.json', '-P', 'Test Case 57',
  '-D', 'fudge=0.05', '-D', 'ff=0.05',
  '-D', 'include_screenshot="no"',
];

async function renderOnce(args, label) {
  const oscad = await createOpenSCAD({
    print:    () => {},
    printErr: () => {},
  });
  const inst = oscad.getInstance();
  addFonts(inst);
  const fsw = inst.FS;
  fsw.writeFile('/keyguard.scad', scadText);
  fsw.writeFile('/keyguard.json', jsonText);
  fsw.writeFile('/openings_and_additions.txt', oaText);
  const t0 = performance.now();
  const rc = inst.callMain(args);
  const dt = (performance.now() - t0) / 1000;
  if (rc !== 0) throw new Error(`${label}: callMain exit ${rc}`);
  const bytes = fsw.readFile('/keyguard.stl');
  const sha = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  console.log(`${label.padEnd(8)} ${dt.toFixed(1)}s  ${bytes.length.toLocaleString().padStart(11)} bytes  sha=${sha}`);
  return bytes;
}

function admeshReport(stlPath) {
  const r = spawnSync('admesh', [stlPath],
    { encoding: 'utf8', timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  if (r.error) return `admesh error: ${r.error.message}`;
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const grab = (re, lbl) => {
    const m = out.match(re); return `${lbl}=${m ? m[1] : '?'}`;
  };
  return [
    grab(/Total disconnected facets\s*:\s*(\d+)/i, 'disconnected'),
    grab(/Degenerate facets\s*:\s*(\d+)/i,         'degenerate'),
    grab(/Number of parts\s*:\s*(\d+)/i,           'parts'),
    grab(/Facets reversed\s*:\s*(\d+)/i,           'reversed'),
    grab(/Backwards edges\s*:\s*(\d+)/i,           'backwards'),
    grab(/Number of facets\s*:\s*(\d+)/i,          'facets'),
  ].join('  ');
}

console.log(`Diagnosing TC57 viewport-vs-export STL divergence`);
console.log(`SCAD root: ${SCAD_ROOT}`);
console.log(`Out dir  : ${OUT_DIR}`);
console.log();

// Variant matrix to isolate which arg is doing what.
const variants = [
  ['viewport',  VIEWPORT_ARGS],
  ['export',    EXPORT_ARGS],
  ['exp+echo',  [...EXPORT_ARGS, '-D', 'echo_dims="yes"']],
  ['exp+oa=no', [...EXPORT_ARGS, '-D', 'show_oa_highlights="no"']],
  ['exp+both',  [...EXPORT_ARGS, '-D', 'echo_dims="yes"', '-D', 'show_oa_highlights="no"']],
];

console.log('Running variants...');
const results = {};
for (const [label, args] of variants) {
  try {
    const bytes = await renderOnce(args, label);
    const p = path.join(OUT_DIR, `tc57-${label}.stl`);
    fs.writeFileSync(p, bytes);
    results[label] = { bytes, path: p, crashed: false };
  } catch (e) {
    console.log(`${label.padEnd(13)} CRASHED  (${e.message.split('\n')[0]})`);
    results[label] = { crashed: true, error: e.message };
  }
}
console.log();

console.log();
console.log('admesh verdict:');
for (const [label] of variants) {
  const r = results[label];
  console.log(`  ${label.padEnd(13)} ${r.crashed ? 'CRASHED — no STL' : admeshReport(r.path)}`);
}
console.log();

const eq = (a, b) => results[a]?.bytes && results[b]?.bytes &&
  results[a].bytes.length === results[b].bytes.length &&
  Buffer.compare(Buffer.from(results[a].bytes), Buffer.from(results[b].bytes)) === 0;

console.log('Pairwise byte-identical comparisons:');
console.log(`  viewport == exp+both : ${eq('viewport','exp+both')}`);
console.log(`  export   == exp+echo : ${eq('export','exp+echo')}`);
