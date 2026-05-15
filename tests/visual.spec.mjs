// visual.spec.mjs — Layer 3 visual regression test.
//
// Test cases are READ from the keyguard designer's tests/cases/ folder
// (one source of truth, shared with the .scad project). Each case folder
// contains a test.json describing one or more steps; each step pairs an
// openings_and_additions.txt with a preset from keyguard.json and an
// optional explicit camera frame (vpt/vpr/vpd, matching OpenSCAD's
// --camera CLI args). The web runner reads `description`, `openings`,
// `steps[].label`, `steps[].params`, and `steps[].vpt/vpr/vpd`. All
// other keys (geometry, console, expected, ...) are .scad-runner-
// specific and ignored here.
//
// Reference screenshots for the web project are committed in
// tests/visual.spec.mjs-snapshots/ alongside this file. They're
// completely separate from the .scad project's reference PNGs.
//
// First-time setup or after intentional visual changes:
//   ./scripts/test.sh --visual --update
//
// Filtering: set KEYGUARD_VISUAL_CASES to a comma-separated list of case
// folder names to run only those cases (e.g. `Test Case 0,Test Case 17`).
// Without the env var, the default curated set in DEFAULT_CASES below is
// used. Set to "*" to run every case that has a valid test.json.
//
// Locating the shared cases folder: KEYGUARD_DESIGNER_TESTS_DIR can point
// at a non-default location; otherwise the sibling-path layout
// `../My SCAD files/keyguard designer/tests/cases/` is assumed.

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const FIXTURE_PATH = 'keyguard design';
const SCAD_FILE    = 'keyguard.scad';

const SCAD_TESTS_DIR = process.env.KEYGUARD_DESIGNER_TESTS_DIR
  ? path.resolve(process.env.KEYGUARD_DESIGNER_TESTS_DIR)
  : path.resolve(PROJECT_ROOT, '../My SCAD files/keyguard designer/tests/cases');

// Default curated subset. Start tiny; expand by editing this list or by
// setting KEYGUARD_VISUAL_CASES. Avoid Test Case 0 by default — its step 1
// is a console-content test with vpd=1000, deliberately producing a near-
// blank PNG that's useless as a visual regression baseline.
const DEFAULT_CASES = ['Test Case 3', 'Test Case 5'];

const caseFilter = process.env.KEYGUARD_VISUAL_CASES;
const WANTED = caseFilter === '*'
  ? null   // null means "all"
  : new Set((caseFilter || DEFAULT_CASES.join(',')).split(',').map(s => s.trim()).filter(Boolean));

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function discoverCases() {
  if (!fs.existsSync(SCAD_TESTS_DIR)) {
    return { error: `Shared cases folder not found:\n  ${SCAD_TESTS_DIR}\n` +
             `Set KEYGUARD_DESIGNER_TESTS_DIR if the keyguard designer is at a different path.`, cases: [] };
  }
  const out = [];
  const entries = fs.readdirSync(SCAD_TESTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
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
    const oaPath = path.join(dir, oaFile);
    if (!fs.existsSync(oaPath)) {
      console.warn(`Skipping ${name}: openings file ${oaFile} not found`);
      continue;
    }
    for (let i = 0; i < testJson.steps.length; i++) {
      const step = testJson.steps[i];
      if (!step.label || !step.params) continue;
      out.push({
        caseName:   name,
        stepIndex:  i + 1,
        stepLabel:  step.label,
        preset:     step.params,
        oaPath,
        // Optional camera frame from .scad's test.json. If present, the
        // fixture loader will override Three.js's auto-framing with these
        // values — preserving the carefully-chosen viewports.
        vpt: Array.isArray(step.vpt) ? step.vpt : null,
        vpr: Array.isArray(step.vpr) ? step.vpr : null,
        vpd: typeof step.vpd === 'number' ? step.vpd : null,
        snapshot: `${slug(name)}--step${i + 1}--${slug(step.label)}.png`,
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
      // Serve the .scad project's tests/cases/ files via a synthetic
      // /scad-cases/* URL on the same Playwright origin. The fixture loader
      // in app.html fetches the openings file from this URL because the
      // case folder isn't reachable via the python web server (different
      // root). Routing is per-page so each test sees a clean handler.
      await page.route('**/scad-cases/**', async (route) => {
        const url = new URL(route.request().url());
        const rel = decodeURIComponent(url.pathname.replace(/^.*\/scad-cases\//, ''));
        const abs = path.join(SCAD_TESTS_DIR, rel);
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
          await route.fulfill({
            status: 200,
            body: fs.readFileSync(abs),
            contentType: 'text/plain; charset=utf-8',
          });
        } else {
          await route.fulfill({ status: 404 });
        }
      });

      const pageErrors = [];
      page.on('pageerror', err => pageErrors.push(err.message));
      const consoleErrors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      const params = new URLSearchParams({
        fixture: FIXTURE_PATH,
        scad:    SCAD_FILE,
        preset:  c.preset,
        // /scad-cases/<case-folder>/<openings-file>
        oa:      '/scad-cases/' + encodeURIComponent(c.caseName)
                  + '/' + encodeURIComponent(path.basename(c.oaPath)),
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
        .toHaveScreenshot(c.snapshot, {
          maxDiffPixelRatio: 0.01,
          threshold: 0.15,
        });

      expect(pageErrors, 'page threw an uncaught error').toEqual([]);
      expect(consoleErrors, 'console.error was called').toEqual([]);
    });
  }
}
