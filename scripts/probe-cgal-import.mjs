// Measure option C: import the already-rendered Manifold STL into OpenSCAD
// and ask CGAL whether the imported mesh is "Simple: yes". This is the
// cheapest CGAL operation possible — no CSG, no booleans, just the mesh
// verification step that CGAL prints in its render-info dump.
//
// Compares the cost against a full CGAL render of the same TC57 design.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenSCAD } from '../openscad-wasm/openscad.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCAD_ROOT = path.resolve(__dirname, '..', '..', 'My SCAD files', 'keyguard designer');
const STL_INPUT = path.resolve(__dirname, '..', 'output', 'tc57-binstl.stl');  // Or any prior render

async function probe(label, scadText, inputStl) {
  let logBuf = '';
  const oscad = await createOpenSCAD({
    print:    t => { logBuf += t + '\n'; },
    printErr: t => { logBuf += t + '\n'; },
  });
  const inst = oscad.getInstance();
  inst.FS.writeFile('/probe.scad', scadText);
  if (inputStl) inst.FS.writeFile('/in.stl', inputStl);
  const t0 = performance.now();
  const rc = inst.callMain(['/probe.scad', '-o', '/out.stl', '--backend=CGAL']);
  const dt = (performance.now() - t0) / 1000;
  const bytes = rc === 0 ? inst.FS.readFile('/out.stl') : new Uint8Array(0);
  const outPath = path.resolve(__dirname, '..', 'output', `probe-${label.replace(/[^a-z0-9]+/gi,'-')}.stl`);
  if (bytes.length) fs.writeFileSync(outPath, bytes);
  console.log(`\n=== ${label} ===  rc=${rc}  ${dt.toFixed(1)}s  out=${bytes.length.toLocaleString()} bytes`);
  console.log('--- full openscad log ---');
  console.log(logBuf.trim() || '(empty)');
  return { dt, rc, bytes, outPath };
}

// Make sure we have a recent Manifold STL — render TC57 with Manifold once.
const scadText = fs.readFileSync(path.join(SCAD_ROOT, 'keyguard.scad'), 'utf8');
const jsonText = fs.readFileSync(path.join(SCAD_ROOT, 'keyguard.json'), 'utf8');
const oaText   = fs.readFileSync(path.join(SCAD_ROOT, 'tests/cases/Test Case 57/openings_and_additions.txt'), 'utf8');

{
  let logBuf = '';
  const oscad = await createOpenSCAD({ print: () => {}, printErr: () => {} });
  const inst = oscad.getInstance();
  inst.FS.writeFile('/keyguard.scad', scadText);
  inst.FS.writeFile('/keyguard.json', jsonText);
  inst.FS.writeFile('/openings_and_additions.txt', oaText);
  inst.callMain([
    '/keyguard.scad', '-o', '/keyguard.stl', '--backend=Manifold',
    '-p', '/keyguard.json', '-P', 'Test Case 57',
    '-D', 'fudge=0.05', '-D', 'ff=0.05', '-D', 'include_screenshot="no"',
  ]);
  const bytes = inst.FS.readFile('/keyguard.stl');
  fs.mkdirSync(path.dirname(STL_INPUT), { recursive: true });
  fs.writeFileSync(STL_INPUT, bytes);
  console.log(`Wrote Manifold TC57 STL: ${bytes.length.toLocaleString()} bytes`);
}

const stlBytes = fs.readFileSync(STL_INPUT);
console.log();

// (C) The probe: import the STL and CGAL-verify it. We add a no-op union()
// so OpenSCAD sees a CSG tree and (hopefully) prints its Simple: line.
const r1 = await probe(
  'plain import',
  'import("in.stl");',
  stlBytes,
);
const r2 = await probe(
  'import wrapped in union()',
  'union() { import("in.stl"); }',
  stlBytes,
);
// Force a trivial difference so CGAL must construct a Nef polyhedron and emit "Simple:".
const r3 = await probe(
  'import differenced with empty cube',
  'difference() { import("in.stl"); cube(0); }',
  stlBytes,
);

// Compare against a baseline: import a known-clean CGAL STL and verify Simple: line.
const cleanRender = await (async () => {
  const oscad = await createOpenSCAD({ print: () => {}, printErr: () => {} });
  const inst = oscad.getInstance();
  inst.FS.writeFile('/keyguard.scad', scadText);
  inst.FS.writeFile('/keyguard.json', jsonText);
  inst.FS.writeFile('/openings_and_additions.txt', oaText);
  inst.callMain([
    '/keyguard.scad', '-o', '/keyguard.stl', '--backend=Manifold',
    '-p', '/keyguard.json', '-P', 'Test Case 2',
    '-D', 'fudge=0.05', '-D', 'ff=0.05', '-D', 'include_screenshot="no"',
  ]);
  return inst.FS.readFile('/keyguard.stl');
})();
console.log(`\nClean TC2 Manifold STL: ${cleanRender.length.toLocaleString()} bytes`);
const r4 = await probe(
  'TC2 (clean) plain import',
  'import("in.stl");',
  cleanRender,
);
const r5 = await probe(
  'TC2 (clean) differenced with empty cube',
  'difference() { import("in.stl"); cube(0); }',
  cleanRender,
);

// Smallest possible trigger — render TC57 CGAL-clean and verify it passes too.
const cleanCgalRender = await (async () => {
  const oscad = await createOpenSCAD({ print: () => {}, printErr: () => {} });
  const inst = oscad.getInstance();
  inst.FS.writeFile('/keyguard.scad', scadText);
  inst.FS.writeFile('/keyguard.json', jsonText);
  inst.FS.writeFile('/openings_and_additions.txt', oaText);
  inst.callMain([
    '/keyguard.scad', '-o', '/keyguard.stl', '--backend=CGAL',
    '-p', '/keyguard.json', '-P', 'Test Case 57',
    '-D', 'fudge=0.05', '-D', 'ff=0.05', '-D', 'include_screenshot="no"',
  ]);
  return inst.FS.readFile('/keyguard.stl');
})();
console.log(`\nClean CGAL TC57 STL: ${cleanCgalRender.length.toLocaleString()} bytes`);
const r6 = await probe(
  'TC57-CGAL (known clean) differenced',
  'difference() { import("in.stl"); cube(0); }',
  cleanCgalRender,
);
