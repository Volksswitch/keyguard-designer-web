// precision-export.spec.mjs — Smoke test for the "Export STL (precision)" path.
//
// Loads TC57 (the canonical Manifold-UB repro) via the fixture URL the
// geometry layer already uses, then drives the export through the CGAL
// backend by overriding __exportSTLBytes on the page. Verifies the resulting
// STL passes the strict admesh gate (disconnected=0 AND degenerate=0 AND
// reversed=0) — i.e. the precision path eliminates the artifacts that the
// fast Manifold path leaves in TC57.
//
// This is the focused regression test for the precision-export feature.
// The broader gold-STL geometry-layer comparison is tracked separately
// (see project memory: "Gold-STL stats manifest as geometry-layer regression gate").
//
// Skipped if `admesh` is not on PATH.

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
const SCAD_TESTS_DIR    = path.join(SCAD_PROJECT_ROOT, 'tests/cases');

const ADMESH = process.env.ADMESH || 'admesh';
const haveAdmesh = (() => {
  const r = spawnSync(ADMESH, ['--version'], { encoding: 'utf8' });
  return !r.error;
})();

test.skip(!haveAdmesh, 'admesh not on PATH — precision-export verification skipped');

test('TC57 precision export produces a verifiably-manifold STL', async ({ page }, testInfo) => {
  // CGAL on a ~21k-facet keyguard takes ~5 min in WASM.
  testInfo.setTimeout(900_000);

  // Same fixture routing the geometry layer uses, so the page boots with the
  // upstream .scad project's keyguard.scad + TC57 preset + openings.
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
        const ct = abs.endsWith('.json') ? 'application/json'
                 : abs.endsWith('.svg')  ? 'image/svg+xml'
                 :                         'text/plain; charset=utf-8';
        await route.fulfill({ status: 200, body: fs.readFileSync(abs), contentType: ct });
      } else {
        await route.fulfill({ status: 404 });
      }
    });
  }

  const params = new URLSearchParams({
    fixture: '/scad-source',
    scad:    'keyguard.scad',
    preset:  'Test Case 57',
    oa:      '/scad-cases/' + encodeURIComponent('Test Case 57') + '/openings_and_additions.txt',
  });
  await page.goto(`/app.html?${params.toString()}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__renderState === 'ready', null, { timeout: 180_000 });

  // __exportSTLBytesPrecision is the same call exportCurrent('STL-CGAL')
  // makes — both route through renderExportBytes('STL', 'CGAL'). So a clean
  // STL here proves the precision menu item produces a clean STL too.
  const stlArray = await page.evaluate(async () => {
    if (typeof window.__exportSTLBytesPrecision !== 'function')
      throw new Error('window.__exportSTLBytesPrecision is missing — precision hook not wired');
    return window.__exportSTLBytesPrecision();
  });
  expect(stlArray.length).toBeGreaterThan(200);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-precision-'));
  const stlPath = path.join(tmpDir, 'tc57-precision.stl');
  let report;
  try {
    fs.writeFileSync(stlPath, Buffer.from(stlArray));
    const r = spawnSync(ADMESH, [stlPath], { encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
    report = `${r.stdout || ''}\n${r.stderr || ''}`;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }

  const grab = (re) => { const m = report.match(re); return m ? parseInt(m[1], 10) : -1; };
  const stats = {
    disconnected: grab(/Total disconnected facets\s*:\s*(\d+)/i),
    degenerate:   grab(/Degenerate facets\s*:\s*(\d+)/i),
    reversed:     grab(/Facets reversed\s*:\s*(\d+)/i),
    backwards:    grab(/Backwards edges\s*:\s*(\d+)/i),
  };
  console.log(`  TC57 precision STL admesh: ${JSON.stringify(stats)}`);

  // The precision path's promise: a clean STL by every admesh measure that
  // matters for printing. If any of these regress, the CGAL retry is no
  // longer doing what it's advertised to do.
  expect(stats.disconnected, 'precision STL must have no open/non-manifold edges').toBe(0);
  expect(stats.degenerate,   'precision STL must have no zero-area facets').toBe(0);
  expect(stats.reversed,     'precision STL must have no reversed normals').toBe(0);
});
