// visual.spec.mjs — Layer 3 visual regression test.
//
// SHARED CASE DEFINITIONS, SEPARATE REFERENCE IMAGES.
//
// Cases come from the keyguard designer project's tests/cases/ folder
// (one source of truth, used by both this project and the .scad project).
// Each case folder's test.json describes one or more steps; each step
// pairs an openings_and_additions.txt with a preset from keyguard.json
// and optionally an explicit camera frame (vpt/vpr/vpd, matching
// OpenSCAD's --camera CLI args).
//
// The .scad project's keyguard.scad and keyguard.json are sourced LIVE
// from the upstream project — this repo doesn't bundle copies. Clinicians
// using the app point it at a folder they maintain themselves; tests
// always exercise whatever's currently checked in upstream.
//
// Reference screenshots for the web project are committed in
//   tests/visual.spec.mjs-snapshots/Test Case N/stepM_expected.png
// matching the .scad project's
//   tests/cases/visual.snapshots/Test Case N/stepM_expected.png
// layout one-to-one. Side-by-side comparison between the two projects'
// references is then a same-relative-path diff.
//
// Filtering:
//   KEYGUARD_VISUAL_CASES=Test Case 3,Test Case 17  — run only these
//   KEYGUARD_VISUAL_CASES=*                         — run every case
// Without the env var, the curated DEFAULT_CASES list below is used.
//
// First-time capture or after intentional visual changes:
//   ./scripts/test.sh --visual --update
//
// Locating the upstream .scad project:
//   KEYGUARD_DESIGNER_ROOT=<path>  (defaults to ../My SCAD files/keyguard designer)

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
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

// Tests fetch the .scad / .json via this synthetic URL prefix; Playwright's
// page.route() handler serves them from SCAD_PROJECT_ROOT.
const SCAD_SOURCE_URL_PREFIX  = '/scad-source';
const SCAD_CASES_URL_PREFIX   = '/scad-cases';
const SCAD_FILE = 'keyguard.scad';

// Render dimensions and FOV for visual captures. Matched to the .scad
// project's CLI render (`--imgsize=2048,1536` in test.sh, 4:3 aspect) and
// OpenSCAD's GUI default vertical FOV (~22.5°). The fixture loader applies
// these via renderer.setSize + camera.fov override before the first render,
// so the canvas the export path captures has the same dimensions and same
// frame-fill ratio as the .scad reference at the same vpt/vpr/vpd.
const CAPTURE_WIDTH  = 2048;
const CAPTURE_HEIGHT = 1536;
const CAPTURE_FOV    = 22.5;

// Camera fallbacks matching the .scad project's scripts/test.sh:
//   DEFAULT_VPT="0,0,0", DEFAULT_VPR="55,0,25", DEFAULT_VPD="250".
// Used when neither the step nor an openings file specifies a camera.
const DEFAULT_VPT = [0, 0, 0];
const DEFAULT_VPR = [55, 0, 25];
const DEFAULT_VPD = 250;

// Parse $vpt = [x,y,z]; $vpr = [x,y,z]; $vpd = N; from an OpenSCAD openings
// file. Mirrors parse_camera_from_openings() in the .scad project's test.sh.
// Returns { vpt, vpr, vpd } with any missing fields set to null.
function parseCameraFromOpenings(filePath) {
  const out = { vpt: null, vpr: null, vpd: null };
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, 'utf8');
  const vec = (name) => {
    const m = text.match(new RegExp(`\\$${name}\\s*=\\s*\\[([^\\]]+)\\]`));
    if (!m) return null;
    const parts = m[1].split(',').map(s => parseFloat(s.trim()));
    return parts.length === 3 && parts.every(n => Number.isFinite(n)) ? parts : null;
  };
  const scalar = (name) => {
    const m = text.match(new RegExp(`\\$${name}\\s*=\\s*([0-9.]+)`));
    return m ? parseFloat(m[1]) : null;
  };
  out.vpt = vec('vpt');
  out.vpr = vec('vpr');
  out.vpd = scalar('vpd');
  return out;
}

// Default curated subset. Start small; expand via KEYGUARD_VISUAL_CASES=*
// to run everything that has a test.json.
const DEFAULT_CASES = ['Test Case 3', 'Test Case 5'];

const caseFilter = process.env.KEYGUARD_VISUAL_CASES;
const WANTED = caseFilter === '*'
  ? null   // null means "all"
  : new Set((caseFilter || DEFAULT_CASES.join(',')).split(',').map(s => s.trim()).filter(Boolean));

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
  // Sort numerically so "Test Case 5" runs after "Test Case 1" and before
  // "Test Case 10" — matches the .scad project's `sort -V` ordering.
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
    catch (e) {
      console.warn(`Skipping ${name}: invalid test.json — ${e.message}`);
      continue;
    }
    if (!Array.isArray(testJson.steps)) continue;
    const oaFile = testJson.openings || 'openings_and_additions.txt';
    if (!fs.existsSync(path.join(dir, oaFile))) {
      console.warn(`Skipping ${name}: openings file ${oaFile} not found`);
      continue;
    }

    // Case-level camera defaults: start from globals, override with anything
    // the case's openings file declares via $vpt/$vpr/$vpd. Matches the
    // .scad project's test.sh:774-782.
    const caseCam = { vpt: DEFAULT_VPT, vpr: DEFAULT_VPR, vpd: DEFAULT_VPD };
    {
      const cam = parseCameraFromOpenings(path.join(dir, oaFile));
      if (cam.vpt) caseCam.vpt = cam.vpt;
      if (cam.vpr) caseCam.vpr = cam.vpr;
      if (cam.vpd != null) caseCam.vpd = cam.vpd;
    }

    for (let i = 0; i < testJson.steps.length; i++) {
      const step = testJson.steps[i];
      if (!step.label || !step.params) continue;
      const stepNum = i + 1;

      // Per-step camera resolution (mirrors .scad test.sh:808-815):
      //   1. step.vpt/vpr/vpd in test.json (explicit) takes precedence
      //   2. otherwise, if a "${params}_openings_and_additions.txt" exists,
      //      its $vpt/$vpr/$vpd fill in any axis not made explicit in step
      //   3. otherwise, fall back to the case-level camera
      const vptExplicit = Array.isArray(step.vpt);
      const vprExplicit = Array.isArray(step.vpr);
      const vpdExplicit = typeof step.vpd === 'number';
      let vpt = vptExplicit ? step.vpt : caseCam.vpt;
      let vpr = vprExplicit ? step.vpr : caseCam.vpr;
      let vpd = vpdExplicit ? step.vpd : caseCam.vpd;
      if (!vptExplicit || !vprExplicit || !vpdExplicit) {
        const paramsOaPath = path.join(dir, `${step.params}_openings_and_additions.txt`);
        if (fs.existsSync(paramsOaPath)) {
          const cam = parseCameraFromOpenings(paramsOaPath);
          if (!vptExplicit && cam.vpt)        vpt = cam.vpt;
          if (!vprExplicit && cam.vpr)        vpr = cam.vpr;
          if (!vpdExplicit && cam.vpd != null) vpd = cam.vpd;
        }
      }

      out.push({
        caseName:   name,
        stepIndex:  stepNum,
        stepLabel:  step.label,
        preset:     step.params,
        oaFile,
        vpt, vpr, vpd,
        // Snapshot path segments — Playwright's toHaveScreenshot() accepts
        // an array of strings and joins them with the OS path separator,
        // preserving directory structure. (A single-string form sanitises
        // slashes into dashes, collapsing the layout to a flat file.)
        // End result with the configured snapshotPathTemplate:
        //   tests/visual.spec.mjs-snapshots/Test Case N/stepM_expected.png
        snapshotPath: [name, `step${stepNum}_expected.png`],
      });
    }
  }
  return { cases: out };
}

const { cases: CASES, error: discoveryError } = discoverCases();

if (discoveryError || CASES.length === 0) {
  test('case discovery', () => {
    throw new Error(discoveryError || `No cases matched.\n` +
      `Looked under: ${SCAD_TESTS_DIR}\n` +
      `Wanted: ${WANTED ? [...WANTED].join(', ') : 'all'}`);
  });
} else {
  for (const c of CASES) {
    test(`${c.caseName} :: step ${c.stepIndex} — ${c.stepLabel}`, async ({ page }) => {
      // Serve upstream .scad project files via synthetic URLs on the same
      // Playwright origin. Two routes:
      //
      //   /scad-source/<file>     → SCAD_PROJECT_ROOT/<file>
      //   /scad-cases/<path>      → SCAD_TESTS_DIR/<path>
      //
      // The python http.server only sees keyguard-designer-web/ as its
      // document root, so the upstream files aren't reachable directly.
      // page.route() intercepts those URL prefixes per-page and serves
      // from the host filesystem.
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
            await route.fulfill({
              status: 200,
              body: fs.readFileSync(abs),
              contentType: ct,
            });
          } else {
            await route.fulfill({ status: 404 });
          }
        });
      }

      const pageErrors = [];
      page.on('pageerror', err => pageErrors.push(err.message));
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      const params = new URLSearchParams({
        fixture: SCAD_SOURCE_URL_PREFIX,
        scad:    SCAD_FILE,
        preset:  c.preset,
        oa:      `${SCAD_CASES_URL_PREFIX}/${encodeURIComponent(c.caseName)}/${encodeURIComponent(c.oaFile)}`,
        width:   String(CAPTURE_WIDTH),
        height:  String(CAPTURE_HEIGHT),
        fov:     String(CAPTURE_FOV),
      });
      // Camera is always resolved during discovery (test.json → step-params
      // openings file → case openings file → DEFAULTs), so pass it always.
      params.set('vpt', c.vpt.join(','));
      params.set('vpr', c.vpr.join(','));
      params.set('vpd', String(c.vpd));

      const resp = await page.goto(`/app.html?${params.toString()}`, { waitUntil: 'load' });
      expect(resp, 'no HTTP response').not.toBeNull();
      expect(resp.status()).toBeLessThan(400);

      await page.waitForFunction(
        () => window.__renderState === 'ready',
        null,
        { timeout: 60_000 }
      );
      // Settle: OrbitControls damping + applyOpenscadCamera updates can
      // both still be animating one frame after 'ready'.
      await page.waitForTimeout(750);

      // Capture via the app's own PNG export path (window.__captureViewportPNG,
      // shared with the user-facing Export → PNG dropdown). The buffer below
      // is byte-for-byte what a user would download by clicking Export. That
      // makes the visual layer a regression test for the export feature too,
      // not just the underlying renderer.
      const pngBytes = await page.evaluate(async () => {
        const blob = await window.__captureViewportPNG();
        if (!blob) throw new Error('captureViewportPNG returned null');
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      });
      const pngBuffer = Buffer.from(pngBytes);
      expect(pngBuffer, 'captured PNG was empty').not.toHaveLength(0);
      await expect(pngBuffer, `screenshot diff for ${c.caseName} step ${c.stepIndex}`)
        .toMatchSnapshot(c.snapshotPath, {
          maxDiffPixelRatio: 0.01,
          threshold: 0.15,
        });

      expect(pageErrors, 'page threw an uncaught error').toEqual([]);
      expect(consoleErrors, 'console.error was called').toEqual([]);
    });
  }
}
