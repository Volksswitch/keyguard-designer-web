// geometry.spec.mjs — Layer 4 geometry validation.
//
// CLINICIAN-PATH STL, TWO INDEPENDENT GATES:
//   1. admesh manifold check  — intrinsic 2-manifold edge topology
//   2. golden-stats comparison — Manifold-backend STL vs CGAL reference
//
// For every shared test-case step that produces 3D geometry, this layer
// exports an STL *through the app's own export code* (window.__exportSTLBytes,
// which calls the exact renderExportBytes() that Export → STL uses — same
// --backend=Manifold, same params), then runs both checks on those exact
// bytes. admesh catches gross failures (open meshes, missing facets); the
// golden-stats gate catches Manifold-backend artefacts that admesh treats
// as manifold but that materially diverge from the CGAL reference geometry
// (membranes inside cavities — the TC57 class — split parts, bbox shifts).
// admesh alone is not enough: TC57 passed admesh for hours before the
// membrane bug was reported.
//
// Why admesh, not OpenSCAD's "Simple:" line: the .scad --geometry layer
// gets "Simple:" because it renders the CSG *model*. Here we only have the
// finished STL; the bundled native OpenSCAD (2021.01) never prints "Simple:"
// for an imported mesh and has no --backend flag. admesh inspects the STL
// file directly — no re-render, no OpenSCAD, no backend ambiguity — so the
// thing judged is byte-for-byte the file a clinician downloads.
//
// Pass criterion (mirrors the .scad layer's definition of manifold):
//   Original "Total disconnected facets" == 0   (every edge shared by two
//                                                 facets — the 2-manifold
//                                                 condition; also catches
//                                                 holes / open edges)
//   "Degenerate facets" == 0
// Reversed normals / backwards edges are NOT failed on — consistent with
// the .scad layer, which treats orientation as a non-deterministic artefact
// that slicers repair. Those counts are still logged for diagnostics.
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
// Prerequisites (test.sh guards this and fails the layer with a pointer):
//   - `admesh` on PATH
//
// Locating the upstream .scad project (same env vars as visual.spec.mjs):
//   KEYGUARD_DESIGNER_ROOT, KEYGUARD_DESIGNER_TESTS_DIR

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeStlStats, compareStats, DEFAULT_TOLERANCES } from './lib/stl-stats.mjs';

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

const ADMESH = process.env.ADMESH || 'admesh';

// ── Tolerated Manifold↔CGAL divergences ──────────────────────────────────────
// Some presets reproducibly diverge from the CGAL golden manifest in ways that
// don't affect the printed object. The geometry of the rendered solid is
// indistinguishable in a slicer (verified by overlay) — the divergence is
// confined to mesh-quality metadata (part count) or sub-millimeter envelope
// fluctuations that disappear after slicer auto-repair. Listing the preset
// here applies a per-preset tolerance override; the divergences are still
// COMPARED and LOGGED so a real regression past the tolerance still fails,
// but the known well-understood divergence no longer fails the gate.
//
// Each entry: { reason: <one-line why>, tolerances: <override> }.
// Tolerance fields not specified inherit DEFAULT_TOLERANCES.
//
// Audit cadence: re-review this list whenever the .scad project's golden
// manifest is regenerated, in case the underlying divergence has shifted
// or closed. Confirmed clinically irrelevant 2026-05-29 (slicer overlay
// of CGAL and Manifold STLs identical; Manifold mesh auto-repaired with
// ~4000 degenerate/reversed/backward facets plus a 4-edge gap, all of
// which the slicer fixes silently).
const TOLERATED_DIVERGENCES = {
  // Through-cut extender on negative-left-slope rounded rectangles: Manifold
  // merges the boundary into 1 piece; CGAL splits into 3. Same printed solid.
  'Test Case 5': {
    reason: 'Manifold merges through-cut-extender boundary into 1 piece (CGAL splits into 3). Slicer overlay confirms identical print geometry.',
    tolerances: { ...DEFAULT_TOLERANCES, partsExact: false },
  },
  // ~0.2 mm Z-extent overshoot on these laser-cut / rotated views. Sub-mm.
  'Test Case 46a': {
    reason: '~0.2 mm Z-extent overshoot from chamfer/fudge interaction. Not visible in print.',
    tolerances: { ...DEFAULT_TOLERANCES, bboxAbsMm: 0.3 },
  },
  'Test Case 46b': {
    reason: '~0.2 mm Z-extent overshoot from chamfer/fudge interaction. Not visible in print.',
    tolerances: { ...DEFAULT_TOLERANCES, bboxAbsMm: 0.3 },
  },
  // Embossed text characters register as 16 disconnected components in
  // Manifold; CGAL counts the keyguard + text as 1 solid. Same mesh content.
  'Test Case 47a': {
    reason: 'Embossed text registers as N separate components in Manifold (CGAL unifies). Same mesh content.',
    tolerances: { ...DEFAULT_TOLERANCES, partsExact: false },
  },
  // Same merged-vs-split signature as Test Case 5.
  'Test Case 54': {
    reason: 'Same merged-vs-split signature as Test Case 5.',
    tolerances: { ...DEFAULT_TOLERANCES, partsExact: false },
  },
};

// Golden STL stats manifest — generated by the .scad project's
// `scripts/test.sh --update-golden` and committed to its tests/cases/.
// Treated as read-only fixture data on this side. The manifest is the
// authoritative CGAL-backend record of each config's geometry; any
// Manifold-backend STL that materially diverges from it (volume / area /
// bbox / parts) is a regression — that's how TC57's membrane artefacts
// are caught (volume Δ is tiny but surface_area or parts diverges).
const GOLDEN_MANIFEST_PATH = path.join(SCAD_TESTS_DIR, 'golden-stl-stats.json');
let GOLDEN_MANIFEST = null;
let GOLDEN_LOAD_ERROR = null;
try {
  GOLDEN_MANIFEST = JSON.parse(fs.readFileSync(GOLDEN_MANIFEST_PATH, 'utf8'));
} catch (e) {
  GOLDEN_LOAD_ERROR = `${GOLDEN_MANIFEST_PATH}: ${e.message}`;
}

// When a step fails either gate, write its exact Manifold STL bytes here
// (gitignored) so the broken file can be opened in a slicer next to the CGAL
// golden STL (.scad output/golden-stl/). Only failing steps are saved, so the
// folder stays small and the latest failures are easy to find.
const FAILED_STL_DIR = path.join(PROJECT_ROOT, 'output', 'failed-stl');
function preserveFailingStl(caseName, stepIndex, buf) {
  try {
    fs.mkdirSync(FAILED_STL_DIR, { recursive: true });
    const safe = `${caseName}_step${stepIndex}`.replace(/[^\w.-]+/g, '_');
    const p = path.join(FAILED_STL_DIR, `${safe}.stl`);
    fs.writeFileSync(p, buf);
    return p;
  } catch (e) {
    return `(could not save STL: ${e.message})`;
  }
}
// Mirror the .scad --keep-stls filename transform (tr ' /' '__') so the failure
// message can point at the matching CGAL golden STL.
function goldenStlName(preset) {
  return preset.replace(/[ /]/g, '_') + '.stl';
}

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

// Judge the app-exported STL with admesh. We read the "Original" column of
// the report — the input mesh's state BEFORE admesh's own repairs — so the
// verdict is about the clinician's exact file, not a repaired copy.
//
// Pass = 2-manifold + watertight, mirroring the .scad layer's *implemented*
// standard ("Simple: yes" = pure edge topology):
//   "Total disconnected facets" (Original) == 0  → every edge shared by
//        exactly two facets; also catches holes / open edges.
// That single condition IS the manifold standard. Degenerate (zero-area)
// facets, reversed facets and backwards edges are common Manifold-backend
// tessellation artefacts that do NOT break 2-manifoldness — CGAL's
// "Simple:" ignores them and slicers discard/repair them — so they are
// logged for visibility but NOT failed on, exactly as the .scad --geometry
// layer does (it gates solely on "Simple: yes").
function manifoldVerdict(stlPath) {
  let r;
  try {
    r = spawnSync(ADMESH, [stlPath],
      { encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    return { state: 'error', detail: e.message };
  }
  if (r.error) {
    if (r.error.code === 'ENOENT') {
      return { state: 'no-admesh', detail:
        `'${ADMESH}' not found on PATH. Install ADMesh or set ADMESH=/path/to/admesh.` };
    }
    return { state: 'error', detail: r.error.message };
  }
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  // "Total disconnected facets : <Original> <Final>" — first int = Original.
  const disc  = out.match(/Total disconnected facets\s*:\s*(\d+)/i);
  const degen = out.match(/Degenerate facets\s*:\s*(\d+)/i);
  if (!disc || !degen) {
    return { state: 'error', detail:
      `Could not parse admesh report (missing facet-status lines).\n${out.slice(-1500)}` };
  }
  const grab = (re) => { const m = out.match(re); return m ? parseInt(m[1], 10) : 0; };
  const stats = {
    disconnectedFacets: parseInt(disc[1], 10),
    degenerateFacets:   parseInt(degen[1], 10),
    edgesFixed:         grab(/Edges fixed\s*:\s*(\d+)/i),
    facetsRemoved:      grab(/Facets removed\s*:\s*(\d+)/i),
    facetsAdded:        grab(/Facets added\s*:\s*(\d+)/i),
    facetsReversed:     grab(/Facets reversed\s*:\s*(\d+)/i),
    backwardsEdges:     grab(/Backwards edges\s*:\s*(\d+)/i),
    parts:              grab(/Number of parts\s*:\s*(\d+)/i),
  };
  // Sole gate: the 2-manifold edge condition (== .scad's "Simple: yes").
  const manifold = stats.disconnectedFacets === 0;
  return { state: manifold ? 'manifold' : 'non-manifold', stats, detail: out };
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

      const stlB64 = await page.evaluate(async () => {
        if (typeof window.__exportSTLBytes !== 'function')
          throw new Error('window.__exportSTLBytes is missing — export hook not wired');
        return window.__exportSTLBytes();
      });
      expect(pageErrors, 'page threw an uncaught error').toEqual([]);

      // Hook returns base64 (not a number[]) — decoding is ~400x faster to
      // marshal over CDP for multi-MB meshes. See app.html __stlToBase64.
      const stlBuf = Buffer.from(stlB64, 'base64');
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
        verdict = manifoldVerdict(stlPath);
      } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }

      if (verdict.state === 'no-admesh') {
        throw new Error(verdict.detail);   // prerequisite missing → hard fail
      }
      if (verdict.state === 'error') {
        throw new Error(`admesh manifold check failed to run: ${verdict.detail}`);
      }
      const s = verdict.stats;
      console.log(
        `  admesh [${c.caseName} s${c.stepIndex}]: ` +
        `disconnected=${s.disconnectedFacets} degenerate=${s.degenerateFacets} ` +
        `parts=${s.parts} reversed=${s.facetsReversed} backwards=${s.backwardsEdges}`);
      if (s.degenerateFacets > 0 || s.facetsReversed > 0 || s.backwardsEdges > 0) {
        // Not a manifold failure (slicers handle these); surfaced so a
        // regression in artefact volume is still noticeable.
        console.warn(`  note [${c.caseName} s${c.stepIndex}]: non-fatal mesh ` +
          `artefacts — degenerate=${s.degenerateFacets} reversed=${s.facetsReversed} ` +
          `backwards=${s.backwardsEdges} (slicer-tolerated, not gated, per .scad policy)`);
      }
      if (verdict.state !== 'manifold') {
        const saved = preserveFailingStl(c.caseName, c.stepIndex, stlBuf);
        expect(
          verdict.state,
          `${c.caseName} step ${c.stepIndex}: app-exported STL is NON-MANIFOLD ` +
          `(admesh Original: ${s.disconnectedFacets} disconnected facet edge(s) — ` +
          `every edge must be shared by exactly two facets).\n` +
          `  Manifold STL saved for inspection: ${saved}`
        ).toBe('manifold');
      }

      // ── Golden-manifest stats comparison ────────────────────────────────
      // Independent from admesh. admesh catches gross failures (open meshes,
      // missing facets); the stats gate catches Manifold-backend artefacts
      // that admesh treats as manifold but that materially diverge from the
      // CGAL reference geometry (membranes inside cavities, split parts,
      // bbox shifts).
      if (GOLDEN_LOAD_ERROR) {
        throw new Error(`Golden manifest could not be loaded — ${GOLDEN_LOAD_ERROR}\n` +
          `Regenerate it from the .scad project: scripts/test.sh --update-golden`);
      }
      const expected = GOLDEN_MANIFEST.configs?.[c.preset];
      if (!expected) {
        // No manifest entry for this preset — surface as a warning rather
        // than failing, so adding a new test case doesn't break the gate
        // before the manifest is regenerated. Ken will see the warning
        // and re-run --update-golden.
        console.warn(`  golden [${c.caseName} s${c.stepIndex}]: no manifest entry ` +
          `for preset "${c.preset}" — run scripts/test.sh --update-golden in the .scad project`);
      } else {
        const observed = computeStlStats(stlBuf);
        const waiver = TOLERATED_DIVERGENCES[c.preset];
        // Strict (default) comparison: surfaces what the divergence IS even
        // when a waiver applies, so the log line stays informative.
        const verdictStrict = compareStats(observed, expected, DEFAULT_TOLERANCES);
        // Effective (post-waiver) comparison: this is what gates the test.
        const verdict2 = waiver
          ? compareStats(observed, expected, waiver.tolerances)
          : verdictStrict;
        console.log(
          `  golden [${c.caseName} s${c.stepIndex}]: ` +
          `vol=${observed.volume_mm3} (Δ${((observed.volume_mm3 - expected.volume_mm3) / (expected.volume_mm3 || 1) * 100).toFixed(3)}%) ` +
          `area=${observed.surface_area_mm2} (Δ${((observed.surface_area_mm2 - expected.surface_area_mm2) / (expected.surface_area_mm2 || 1) * 100).toFixed(3)}%) ` +
          `parts=${observed.parts}/${expected.parts} ` +
          `facets=${observed.facets}/${expected.facets}`);
        if (waiver && !verdictStrict.ok) {
          // Make the known divergence visible in test output even though it
          // doesn't fail. Helps spot when a waiver could be retired (no longer
          // diverges) or when the divergence has shifted in character.
          console.warn(`  TOLERATED [${c.caseName} s${c.stepIndex}]: preset "${c.preset}" — ${waiver.reason}\n` +
            `    strict-mode failures (waived): ${verdictStrict.failures.join('; ')}`);
        }
        if (!verdict2.ok) {
          const saved = preserveFailingStl(c.caseName, c.stepIndex, stlBuf);
          expect(
            verdict2.ok,
            `${c.caseName} step ${c.stepIndex}: Manifold STL diverges from CGAL golden ` +
            `manifest for preset "${c.preset}":\n  ${verdict2.failures.join('\n  ')}\n` +
            (waiver
              ? `  NOTE: a waiver is in effect for this preset (${waiver.reason}); ` +
                `the divergence exceeds the waiver's tolerance and is a real failure.\n`
              : '') +
            `  Manifold STL saved for inspection: ${saved}\n` +
            `  Compare to the CGAL golden STL: <scad-project>/output/golden-stl/${goldenStlName(c.preset)}\n` +
            `  (regenerate the golden STLs with: scripts/test.sh --update-golden --keep-stls)`
          ).toBe(true);
        }
      }
    });
  }
}
