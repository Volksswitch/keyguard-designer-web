// One-shot: build a markdown table of the 56 broken cases for manual
// investigation. Joins the calibration report's "broken" list with each
// step's preset+label from the upstream test.json files.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCAD_ROOT = path.resolve(PROJECT_ROOT, '..', 'My SCAD files', 'keyguard designer');
const TESTS_DIR = path.join(SCAD_ROOT, 'tests/cases');
const REPORT = path.join(PROJECT_ROOT, 'output', 'cgal-probe-calibration.json');

const calib = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const broken = calib.buckets.broken;

const rows = [];
for (const b of broken) {
  const tjPath = path.join(TESTS_DIR, b.case, 'test.json');
  let preset = '?', label = '?';
  if (fs.existsSync(tjPath)) {
    const tj = JSON.parse(fs.readFileSync(tjPath, 'utf8'));
    const step = (tj.steps || [])[b.step - 1];
    if (step) {
      preset = step.params || '?';
      label  = step.label  || '?';
    }
  }
  rows.push({ case: b.case, step: b.step, preset, label });
}

const out = [];
out.push('# CGAL Nef-probe "broken" cases — for manual investigation');
out.push('');
out.push(`Calibration run: ${calib.generatedAt}  (${calib.totalSteps} steps total, ${calib.elapsedMin} min wall time)`);
out.push('');
out.push('These 56 of 160 test-case steps had their Manifold-rendered STL flagged');
out.push('by CGAL\'s Nef-conversion probe (`ERROR: The given mesh is not closed!`).');
out.push('This is the same probe we considered for an auto-warning dialog. At 35% of');
out.push('all cases, the false-positive risk is too high to ship the auto-check —');
out.push('but the list below identifies every case for which CGAL disagrees with');
out.push('admesh\'s `disconnected==0` verdict, so each one is worth checking by hand:');
out.push('');
out.push('1. Render the listed preset through native OpenSCAD (`scripts/render.sh` or');
out.push('   manual `openscad -o ... -P "<preset>" keyguard.scad`).');
out.push('2. Load the resulting STL into a slicer.');
out.push('3. Classify:');
out.push('   - **Genuinely broken**: visible membranes, holes, floating pieces — like TC57.');
out.push('     These point at additional Manifold UB shapes worth fixing at the .scad level.');
out.push('   - **CGAL-strict false positive**: looks normal in slicer (no membranes, prints fine).');
out.push('     CGAL refuses to certify the STL but the mesh is functionally OK.');
out.push('');
out.push('TC57 step 1 is in this list and IS genuinely broken — the canonical case');
out.push('that started this whole investigation. It serves as the calibration anchor:');
out.push('whatever the failure mode TC57 has, the other 55 are probably worth ranking');
out.push('against it.');
out.push('');
out.push('| # | Case | Step | Preset | Label |');
out.push('|---|---|---|---|---|');
rows.forEach((r, i) => {
  const labelClean = String(r.label).replace(/\|/g, '\\|');
  out.push(`| ${i + 1} | ${r.case} | ${r.step} | \`${r.preset}\` | ${labelClean} |`);
});
out.push('');
out.push('Source: `output/cgal-probe-calibration.json` (full bucket data including');
out.push('the 62 "clean", 31 "inconclusive", and 11 "renderFailed" cases).');

const outPath = path.join(PROJECT_ROOT, 'CGAL_NEF_BROKEN_CASES.md');
fs.writeFileSync(outPath, out.join('\n') + '\n');
console.log(`Wrote ${outPath}  (${rows.length} cases)`);
