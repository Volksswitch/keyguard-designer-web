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
// from the upstream project (not the keyguard design/ folder bundled
// here). The bundled folder remains the default for clinicians using
// the app; visual tests bypass it so they always exercise the latest
// .scad code.
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
  const entries = fs.readdirSync(SCAD_TESTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'visual.snapshots')
    .map(e => e.name)
    .sort();
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
    for (let i = 0; i < testJson.steps.length; i++) {
      const step = testJson.steps[i];
      if (!step.label || !step.params) continue;
      const stepNum = i + 1;
      out.push({
        caseName:   name,
        stepIndex:  stepNum,
        stepLabel:  step.label,
        preset:     step.params,
        oaFile,
        // Optional camera frame from .scad's test.json.
        vpt: Array.isArray(step.vpt) ? step.vpt : null,
        vpr: Array.isArray(step.vpr) ? step.vpr : null,
        vpd: typeof step.vpd === 'number' ? step.vpd : null,
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
      });
      if (c.vpt && c.vpr && c.vpd != null) {
        params.set('vpt', c.vpt.join(','));
        params.set('vpr', c.vpr.join(','));
        params.set('vpd', String(c.vpd));
      }

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

      const viewport = page.locator('#viewport canvas');
      await expect(viewport, `screenshot diff for ${c.caseName} step ${c.stepIndex}`)
        .toHaveScreenshot(c.snapshotPath, {
          maxDiffPixelRatio: 0.01,
          threshold: 0.15,
        });

      expect(pageErrors, 'page threw an uncaught error').toEqual([]);
      expect(consoleErrors, 'console.error was called').toEqual([]);
    });
  }
}
