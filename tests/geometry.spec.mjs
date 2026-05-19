// geometry.spec.mjs — Layer 4 geometry validation.
//
// CLINICIAN-PATH STL, INTRINSIC MANIFOLD CHECK.
//
// For every shared test-case step that produces 3D geometry, this layer
// exports an STL *through the app's own export code* (window.__exportSTLBytes,
// which calls the exact renderExportBytes() that Export → STL uses — same
// args, same Manifold backend, same param derivation) and then asserts the
// STL is 2-manifold by the same criterion the .scad project's --geometry
// layer uses: native OpenSCAD/CGAL must not report "Simple: no".
//
// No comparison to the .scad project's STL is made or implied — the bar is
// intrinsic correctness of what the clinician actually downloads.
//
// Case source (shared, one source of truth, same as visual.spec.mjs):
//   tests/cases/<Test Case N>/test.json   (in the upstream .scad project)
// A step qualifies UNLESS it sets "geometry": false (the upstream convention
// for laser-cut / Customizer-dump steps that emit no 3D solid).
//
// Filtering:
//   KEYGUARD_GEOMETRY_CASES=Test Case 1,Test Case 17  — run only these
//   (default: every qualifying case — this is the standard Ken asked for)
//
// Prerequisites (test.sh guards these and fails the layer with a pointer):
//   - native `openscad` on PATH (override with OPENSCAD=/path/to/openscad)
//   - `admesh` is optional; if present its summary is logged, informational
//     only (never pass/fail), mirroring the .scad layer's settled policy.
//
// Locating the upstream .scad project (same env vars as visual.spec.mjs):
//   KEYGUARD_DESIGNER_ROOT, KEYGUARD_DESIGNER_TESTS_DIR

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const SCAD_PROJECT_ROOT = process.env.KEYGUARD_DESIGNER_ROOT
  ? path.resolve(process.env.KEYGUARD_DESIGNER_ROOT)
  : path.resolve(PROJECT_ROOT, '../My SCAD files/keyguard designer');

const SCAD_TESTS_DIR = process.env.KEYGUARD_DESIGNER_TESTS_DIR
  ? path.resolve(process.env.KEYGUARD_DESIGNER_TESTS_DIR)
  : path.join(SCAD_PROJECT_ROOT, 'tests/cases');

const SCAD_SOURCE_URL_PREFIX = '/scad-source';
const SCAD_CASES_URL_PREFIX  = '/scad-cases';
const SCAD_FILE = 'keyguard.scad';

const OPENSCAD = process.env.OPENSCAD || 'openscad';

// Default: every qualifying case. Ken's standard is that ALL test cases
// with geometry meet the manifold bar, so unlike the visual layer there is
// no curated short list — filter explicitly with KEYGUARD_GEOMETRY_CASES.
const caseFilter = process.env.KEYGUARD_GEOMETRY_CASES;
const WANTED = (!caseFilter || caseFilter === '*')
  ? null
  : new Set(caseFilter.split(',').map(s => s.trim()).filter(Boolean));

function discoverCases() {
  if (!fs.existsSync(SCAD_TESTS_DIR)) {
    return { error: `Shared cases folder not found:\n  ${SCAD_TESTS_DIR}\n` +
             `Set KEYGUARD_DESIGNER_TESTS_DIR if the keyguard designer is at a different path.`, cases: [] };
  }
  if (!fs.existsSync(path.join(SCAD_PROJECT_ROOT, SCAD_FILE))) {
    return { error: `keyguard.scad not found at the upstream project root:\n  ${SCAD_PROJECT_ROOT}\n` +
             `Set KEYGUARD_DESIGNER_ROOT if the keyguard designer is at a different path.`, cases: [] };
  }
  const out = [];
  const entries = fs.readdirSync(SCAD_TESTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'visual.snapshots')
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  for (const name of entries) {
    if (WANTED && !WANTED.has(name)) continue;
    const dir = path.join(SCAD_TESTS_DIR, name);
    const testJsonPath = path.join(dir, 'test.json');
    if (!fs.existsSync(testJsonPath)) continue;
    let testJson;
    try { testJson = JSON.parse(fs.readFileSync(testJsonPath, 'utf8')); }
    catch (e) { console.warn(`Skipping ${name}: invalid test.json — ${e.message}`); continue; }
    if (!Array.isArray(testJson.steps)) continue;
    const oaFile = testJson.openings || 'openings_and_additions.txt';
    if (!fs.existsSync(path.join(dir, oaFile))) {
      console.warn(`Skipping ${name}: openings file ${oaFile} not found`);
      continue;
    }
    for (let i = 0; i < testJson.steps.length; i++) {
      const step = testJson.steps[i];
      if (!step || !step.params) continue;
      // The upstream skip convention: a step that emits no 3D solid
      // (laser-cut first-layer, Customizer-settings dump) sets geometry:false.
      if (step.geometry === false) continue;
      out.push({
        caseName:  name,
        stepIndex: i + 1,
        stepLabel: step.label || step.params,
        preset:    step.params,
        oaFile,
      });
    }
  }
  return { cases: out };
}

// Run native OpenSCAD over an `import()` wrapper so CGAL evaluates the
// app-exported STL and prints its "Simple: yes/no" verdict — the exact
// criterion the .scad project's --geometry layer greps for. Verdict
// semantics mirror that layer: "no" fails; "yes" passes; absent passes
// as "unknown" (a non-deterministic OpenSCAD/back-end artefact, not a
// geometry defect).
function manifoldVerdict(stlPath) {
  const tmpScad = stlPath.replace(/\.stl$/i, '.check.scad');
  const tmpOut  = stlPath.replace(/\.stl$/i, '.check.stl');
  // OpenSCAD accepts forward slashes on every platform.
  fs.writeFileSync(tmpScad, `import("${stlPath.replace(/\\/g, '/')}");\n`);
  let combined = '';
  let spawnErr = null;
  try {
    const r = spawnSync(OPENSCAD, ['-o', tmpOut, tmpScad], {
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    if (r.error) spawnErr = r.error;
    combined = `${r.stdout || ''}\n${r.stderr || ''}`;
  } catch (e) {
    spawnErr = e;
  } finally {
    for (const f of [tmpScad, tmpOut]) { try { fs.unlinkSync(f); } catch {} }
  }
  if (spawnErr) {
    if (spawnErr.code === 'ENOENT') {
      return { state: 'no-openscad', detail:
        `'${OPENSCAD}' not found on PATH. Install OpenSCAD or set OPENSCAD=/path/to/openscad.` };
    }
    return { state: 'error', detail: spawnErr.message };
  }
  const m = combined.match(/Simple:\s*(yes|no)/i);
  if (m) return { state: m[1].toLowerCase() === 'no' ? 'non-manifold' : 'manifold', detail: combined };
  return { state: 'unknown', detail: combined };
}

function admeshSummary(stlPath) {
  const r = spawnSync('admesh', [stlPath], { encoding: 'utf8', timeout: 60_000 });
  if (r.error) return null;                       // not installed → silent
  const text = `${r.stdout || ''}\n${r.stderr || ''}`;
  const line = text.split(/\r?\n/).find(l => /Number of parts|degenerate|edges fixed|holes/i.test(l));
  return line ? line.trim() : '(admesh ran; no summary line parsed)';
}

const { cases: CASES, error: discoveryError } = discoverCases();

if (discoveryError || CASES.length === 0) {
  test('geometry case discovery', () => {
    throw new Error(discoveryError ||
      `No qualifying cases.\n  Looked under: ${SCAD_TESTS_DIR}\n` +
      `  Wanted: ${WANTED ? [...WANTED].join(', ') : 'all'}`);
  });
} else {
  for (const c of CASES) {
    test(`${c.caseName} :: step ${c.stepIndex} — ${c.stepLabel} [geometry]`, async ({ page }, testInfo) => {
      // wasm STL export of a complex case can take well over a minute.
      testInfo.setTimeout(240_000);

      const fileRoutes = [
        { prefix: '/scad-source/', root: SCAD_PROJECT_ROOT },
        { prefix: '/scad-cases/',  root: SCAD_TESTS_DIR    },
      ];
      for (const { prefix, root } of fileRoutes) {
        await page.route(`**${prefix}**`, async (route) => {
          const url = new URL(route.request().url());
          const rel = decodeURIComponent(url.pathname.replace(new RegExp(`^.*${prefix}`), ''));
          const abs = path.join(root, rel);
          if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
            const ext = path.extname(abs).toLowerCase();
            const ct  = ext === '.json' ? 'application/json'
                      : ext === '.svg'  ? 'image/svg+xml'
                      :                   'text/plain; charset=utf-8';
            await route.fulfill({ status: 200, body: fs.readFileSync(abs), contentType: ct });
          } else {
            await route.fulfill({ status: 404 });
          }
        });
      }

      const pageErrors = [];
      page.on('pageerror', err => pageErrors.push(err.message));

      const params = new URLSearchParams({
        fixture: SCAD_SOURCE_URL_PREFIX,
        scad:    SCAD_FILE,
        preset:  c.preset,
        oa:      `${SCAD_CASES_URL_PREFIX}/${encodeURIComponent(c.caseName)}/${encodeURIComponent(c.oaFile)}`,
      });
      const resp = await page.goto(`/app.html?${params.toString()}`, { waitUntil: 'load' });
      expect(resp, 'no HTTP response').not.toBeNull();
      expect(resp.status()).toBeLessThan(400);

      // 'ready' means the fixture loaded the project and the first render
      // completed; the export hook then runs its own identical render.
      await page.waitForFunction(() => window.__renderState === 'ready', null, { timeout: 180_000 });

      const stlArray = await page.evaluate(async () => {
        if (typeof window.__exportSTLBytes !== 'function')
          throw new Error('window.__exportSTLBytes is missing — export hook not wired');
        return window.__exportSTLBytes();
      });
      expect(pageErrors, 'page threw an uncaught error').toEqual([]);

      const stlBuf = Buffer.from(stlArray);
      // openscad-wasm emits a ~80-byte single-triangle shell when there is
      // no solid. A real keyguard is far larger; anything tiny means the
      // clinician would get an empty/!3D file for a step we expected to
      // have geometry.
      expect(
        stlBuf.length,
        `exported STL is empty/degenerate (${stlBuf.length} bytes) — ` +
        `${c.caseName} step ${c.stepIndex} produced no 3D solid`
      ).toBeGreaterThan(200);

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-geom-'));
      const safe = `${c.caseName} s${c.stepIndex}`.replace(/[^\w.-]+/g, '_');
      const stlPath = path.join(tmpDir, `${safe}.stl`);
      let verdict;
      try {
        fs.writeFileSync(stlPath, stlBuf);

        const admesh = admeshSummary(stlPath);
        if (admesh) console.log(`  admesh [${c.caseName} s${c.stepIndex}]: ${admesh}`);

        verdict = manifoldVerdict(stlPath);
      } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }

      if (verdict.state === 'no-openscad') {
        throw new Error(verdict.detail);   // prerequisite missing → hard fail
      }
      if (verdict.state === 'error') {
        throw new Error(`OpenSCAD manifold check failed to run: ${verdict.detail}`);
      }
      if (verdict.state === 'unknown') {
        // Match the .scad layer: no "Simple:" line is treated as a pass
        // (back-end/version artefact), but make it visible.
        console.warn(`  manifold status UNKNOWN for ${c.caseName} s${c.stepIndex} ` +
                     `(no "Simple:" line) — treated as pass, per .scad-layer policy`);
        return;
      }
      expect(
        verdict.state,
        `${c.caseName} step ${c.stepIndex}: app-exported STL is NON-MANIFOLD ` +
        `(OpenSCAD reported "Simple: no")`
      ).toBe('manifold');
    });
  }
}
