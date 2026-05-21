// calibrate-cgal-probe.mjs — Calibration for the auto-check feature.
//
// For every shared test-case step with 3D geometry, render the design via
// openscad-wasm Manifold and run the CGAL Nef-conversion probe (the same
// difference()/cube(0) trick we measured during the TC57 investigation).
// Bucket each step into one of three outcomes:
//
//   clean         CGAL printed "Simple: yes"        → safe
//   broken        CGAL printed "mesh is not closed" → warn the clinician
//   inconclusive  CGAL hit an assertion or other    → save silently, do not warn
//                 failure; we do NOT trust this as
//                 evidence of breakage
//
// Pre-deploy question: what fraction of normally-OK Manifold STLs land in
// "broken" (the user-warning bucket) when they shouldn't? If the answer is
// small (handful at most), the auto-check is shippable. If it's large, the
// false-positive rate is too high to warn clinicians automatically.
//
// Run from project root:   node scripts/calibrate-cgal-probe.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenSCAD } from '../openscad-wasm/openscad.js';
import { addFonts } from '../openscad-wasm/openscad.fonts.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCAD_ROOT    = path.resolve(PROJECT_ROOT, '..', 'My SCAD files', 'keyguard designer');
const TESTS_DIR    = path.join(SCAD_ROOT, 'tests/cases');

const scad = fs.readFileSync(path.join(SCAD_ROOT, 'keyguard.scad'), 'utf8');
const json = fs.readFileSync(path.join(SCAD_ROOT, 'keyguard.json'), 'utf8');

// Mirror the geometry.spec.mjs discovery: every step from every test case
// that produces 3D geometry (geometry: false is the skip convention).
function discoverCases() {
  const out = [];
  if (!fs.existsSync(TESTS_DIR)) {
    console.error(`Tests dir missing: ${TESTS_DIR}`);
    process.exit(1);
  }
  const entries = fs.readdirSync(TESTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'visual.snapshots')
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  for (const name of entries) {
    const dir = path.join(TESTS_DIR, name);
    const testJsonPath = path.join(dir, 'test.json');
    if (!fs.existsSync(testJsonPath)) continue;
    let tj;
    try { tj = JSON.parse(fs.readFileSync(testJsonPath, 'utf8')); }
    catch { continue; }
    if (!Array.isArray(tj.steps)) continue;
    const oaFile = tj.openings || 'openings_and_additions.txt';
    if (!fs.existsSync(path.join(dir, oaFile))) continue;
    for (let i = 0; i < tj.steps.length; i++) {
      const step = tj.steps[i];
      if (!step || !step.params) continue;
      if (step.geometry === false) continue;
      out.push({ caseName: name, stepIndex: i + 1, preset: step.params, oaFile, dir });
    }
  }
  return out;
}

async function renderManifoldStl(preset, oaText) {
  let stderrBuf = '';
  const oscad = await createOpenSCAD({
    print:    () => {},
    printErr: t => { stderrBuf += t + '\n'; },
  });
  const inst = oscad.getInstance();
  addFonts(inst);
  inst.FS.writeFile('/keyguard.scad', scad);
  inst.FS.writeFile('/keyguard.json', json);
  inst.FS.writeFile('/openings_and_additions.txt', oaText);
  const t0 = performance.now();
  const rc = inst.callMain([
    '/keyguard.scad', '-o', '/keyguard.stl', '--backend=Manifold',
    '-p', '/keyguard.json', '-P', preset,
    '-D', 'fudge=0.05', '-D', 'ff=0.05', '-D', 'include_screenshot="no"',
  ]);
  const dt = (performance.now() - t0) / 1000;
  if (rc !== 0) throw new Error(`Manifold rc=${rc}; ${stderrBuf.slice(-200)}`);
  const bytes = inst.FS.readFile('/keyguard.stl');
  return { bytes, dt };
}

async function probeCgalNef(stlBytes) {
  let logBuf = '';
  const oscad = await createOpenSCAD({
    print:    t => { logBuf += t + '\n'; },
    printErr: t => { logBuf += t + '\n'; },
  });
  const inst = oscad.getInstance();
  inst.FS.writeFile('/in.stl', stlBytes);
  inst.FS.writeFile('/probe.scad', 'difference() { import("in.stl"); cube(0); }');
  const t0 = performance.now();
  let crashed = false;
  let rc = -1;
  try {
    rc = inst.callMain(['/probe.scad', '-o', '/out.stl', '--backend=CGAL']);
  } catch (e) {
    crashed = true;
    logBuf += '\n[JS exception: ' + e.message + ']';
  }
  const dt = (performance.now() - t0) / 1000;
  if (/Simple:\s*yes/i.test(logBuf))         return { verdict: 'clean',        dt, log: logBuf };
  if (/mesh is not closed/i.test(logBuf))    return { verdict: 'broken',       dt, log: logBuf };
  return { verdict: 'inconclusive', dt, log: logBuf, crashed, rc };
}

const cases = discoverCases();
console.log(`Discovered ${cases.length} step(s) with 3D geometry`);
console.log();

const buckets = { clean: [], broken: [], inconclusive: [], renderFailed: [] };
const startMs = Date.now();
for (let i = 0; i < cases.length; i++) {
  const c = cases[i];
  const oa = fs.readFileSync(path.join(c.dir, c.oaFile), 'utf8');
  const tag = `[${(i + 1).toString().padStart(3)}/${cases.length}] ${c.caseName} s${c.stepIndex}`.padEnd(45);
  let manifoldDt = 0;
  let stlBytes;
  try {
    const m = await renderManifoldStl(c.preset, oa);
    stlBytes = m.bytes;
    manifoldDt = m.dt;
  } catch (e) {
    console.log(`${tag} render-failed (${e.message.split('\n')[0].slice(0, 80)})`);
    buckets.renderFailed.push(c);
    continue;
  }
  const v = await probeCgalNef(stlBytes);
  // Extract the first "ERROR" or "CGAL error" line for inconclusive diagnosis.
  let reason = '';
  if (v.verdict === 'inconclusive') {
    const m = v.log.match(/(ERROR|CGAL error)[^\n]*/i);
    reason = m ? `  «${m[0].slice(0, 70)}»` : '  (no error string)';
  }
  console.log(`${tag} m=${manifoldDt.toFixed(1).padStart(4)}s  probe=${v.dt.toFixed(1).padStart(5)}s  ${v.verdict}${reason}`);
  buckets[v.verdict].push({ ...c, manifoldDt, probeDt: v.dt, log: v.log });
}
const elapsedMin = ((Date.now() - startMs) / 60000).toFixed(1);
console.log();
console.log(`Total wall time: ${elapsedMin} min`);
console.log();
console.log('--- summary ---');
console.log(`  clean        : ${buckets.clean.length.toString().padStart(3)}`);
console.log(`  broken       : ${buckets.broken.length.toString().padStart(3)}   (would trigger warning)`);
console.log(`  inconclusive : ${buckets.inconclusive.length.toString().padStart(3)}   (would save silently)`);
console.log(`  renderFailed : ${buckets.renderFailed.length.toString().padStart(3)}   (Manifold rc!=0; out of scope)`);
console.log();
if (buckets.broken.length) {
  console.log('Broken cases (these will trigger the warning dialog):');
  for (const c of buckets.broken) console.log(`  ${c.caseName} s${c.stepIndex}`);
  console.log();
}
if (buckets.inconclusive.length) {
  console.log('Inconclusive cases (silently passed by auto-check):');
  for (const c of buckets.inconclusive) console.log(`  ${c.caseName} s${c.stepIndex}`);
  console.log();
}

// Persist a JSON report alongside the script so we can refer back without re-running.
const outDir = path.join(PROJECT_ROOT, 'output');
fs.mkdirSync(outDir, { recursive: true });
const reportPath = path.join(outDir, 'cgal-probe-calibration.json');
fs.writeFileSync(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  totalSteps:  cases.length,
  elapsedMin:  +elapsedMin,
  buckets: {
    clean:        buckets.clean.map(c => ({ case: c.caseName, step: c.stepIndex })),
    broken:       buckets.broken.map(c => ({ case: c.caseName, step: c.stepIndex })),
    inconclusive: buckets.inconclusive.map(c => ({ case: c.caseName, step: c.stepIndex })),
    renderFailed: buckets.renderFailed.map(c => ({ case: c.caseName, step: c.stepIndex })),
  },
}, null, 2));
console.log(`Wrote ${reportPath}`);
