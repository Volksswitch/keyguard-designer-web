// ready-to-print.spec.mjs — render the ~290 "ready-to-print" clinical designs
// (real published keyguards) through the app's Manifold export and capture, per
// design:
//   • a top-down PNG (for manual visual review of OA-assembly correctness)
//   • the exported STL bytes (gitignored)
//   • Tier 0-3 derived stats (render-ok, admesh manifold, vol/area/bbox/parts)
//   • a delta vs the downloaded golden STL stats (informational, not gated)
//
// This is a NEW corpus, separate from the .scad test cases. It is driven by the
// reconciliation CSV (preset → OA + golden stem) so the messy preset/OA/golden
// naming lives in one reviewable place, and the visuals are how that mapping is
// validated. Hard failures: render crash / empty STL only. Golden deltas and
// plausibility are recorded for review, not asserted, while the golden corpus
// is still being curated.
//
// Assets live in the .scad project's tests/rtp/ (RTP keyguard.json + OA tree +
// golden-stl). keyguard.scad is NOT duplicated there — it is sourced from the
// .scad project root so it always tracks the upstream model.
//   KEYGUARD_RTP_ROOT       (default: <designer>/tests/rtp)
//   KEYGUARD_DESIGNER_ROOT  (default: ../My SCAD files/keyguard designer)
// Filter:  KEYGUARD_RTP_FILTER="iPad 7,8,9 - Fintie" (substring match on preset)

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeStlStats } from './lib/stl-stats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const DESIGNER_ROOT = process.env.KEYGUARD_DESIGNER_ROOT
  ? path.resolve(process.env.KEYGUARD_DESIGNER_ROOT)
  : path.resolve(PROJECT_ROOT, '../My SCAD files/keyguard designer');

const RTP_ROOT = process.env.KEYGUARD_RTP_ROOT
  ? path.resolve(process.env.KEYGUARD_RTP_ROOT)
  : path.join(DESIGNER_ROOT, 'tests', 'rtp');

const CASES_DIR = path.join(RTP_ROOT, 'Cases and App Specifics');
const MAPPING_CSV = path.join(RTP_ROOT, 'preset-to-golden-mapping.csv');
const GOLDEN_STATS = path.join(RTP_ROOT, 'golden-stl', 'golden-rtp-stats.json');

const OUT = path.join(PROJECT_ROOT, 'output', 'ready-to-print');
const OUT_VISUAL = path.join(OUT, 'visual');
const OUT_STL = path.join(OUT, 'stl');
// One result file per design (parallel-safe + restart-safe: no shared appended
// file to race on, and a re-run just overwrites that design's result).
const OUT_RESULTS = path.join(OUT, 'results');

const ADMESH = process.env.ADMESH || 'admesh';
const haveAdmesh = (() => { try { return !spawnSync(ADMESH, ['--version']).error; } catch { return false; } })();

const FILTER = process.env.KEYGUARD_RTP_FILTER || '';

// Minimal CSV parser (handles quoted fields; our values may contain commas).
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter(r => r.length === header.length).map(r =>
    Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

function discover() {
  if (!fs.existsSync(MAPPING_CSV))
    return { error: `Mapping CSV not found: ${MAPPING_CSV}\nSet KEYGUARD_RTP_ROOT.`, designs: [] };
  if (!fs.existsSync(path.join(DESIGNER_ROOT, 'keyguard.scad')))
    return { error: `keyguard.scad not found under ${DESIGNER_ROOT}`, designs: [] };
  const rows = parseCsv(fs.readFileSync(MAPPING_CSV, 'utf8'));
  let designs = rows.map(r => ({
    preset: r.preset,
    oa: r.resolved_OA,                       // relative to "Cases and App Specifics"
    mounting: r.default_mounting_method,
    goldenStem: r.default_golden_stem || '',
  })).filter(d => d.preset);
  if (FILTER) designs = designs.filter(d => d.preset.includes(FILTER));
  return { designs };
}

const golden = fs.existsSync(GOLDEN_STATS)
  ? JSON.parse(fs.readFileSync(GOLDEN_STATS, 'utf8')).configs || {}
  : {};

// Tablet / case folder names for organizing outputs, parsed from the preset.
function tabletCase(preset) {
  const parts = preset.split(' - ').map(s => s.trim());
  return { tablet: (parts[0] || 'unknown'), caseName: (parts[1] || 'unknown') };
}
const safe = s => s.replace(/[^\w.,()+-]+/g, '_');

fs.mkdirSync(OUT_RESULTS, { recursive: true });

const { designs, error } = discover();

if (error || designs.length === 0) {
  test('ready-to-print discovery', () => {
    throw new Error(error || `No designs after filter "${FILTER}"`);
  });
} else {
  for (const d of designs) {
    test(`${d.preset} [rtp]`, async ({ page }, testInfo) => {
      testInfo.setTimeout(360_000);   // heavy real keyguards; generous for parallel contention

      // Route the app's fixture fetches to the RTP assets (<designer>/tests/rtp).
      await page.route('**/scad-source/**', async route => {
        const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^.*\/scad-source\//, ''));
        // keyguard.scad is sourced from the .scad project root (shared, not
        // duplicated into the RTP fixtures); keyguard.json + rest from RTP_ROOT.
        const abs = path.join(rel === 'keyguard.scad' ? DESIGNER_ROOT : RTP_ROOT, rel);
        if (fs.existsSync(abs)) await route.fulfill({ status: 200, body: fs.readFileSync(abs),
          contentType: abs.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8' });
        else await route.fulfill({ status: 404 });
      });
      await page.route('**/rtp-oa/**', async route => {
        const rel = decodeURIComponent(new URL(route.request().url()).pathname.replace(/^.*\/rtp-oa\//, ''));
        const abs = path.join(CASES_DIR, rel);
        if (fs.existsSync(abs)) await route.fulfill({ status: 200, body: fs.readFileSync(abs), contentType: 'text/plain; charset=utf-8' });
        else await route.fulfill({ status: 404 });
      });

      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(e.message));

      const oaUrl = '/rtp-oa/' + d.oa.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
      const params = new URLSearchParams({ fixture: '/scad-source', scad: 'keyguard.scad', preset: d.preset, oa: oaUrl });
      const resp = await page.goto(`/app.html?${params}`, { waitUntil: 'load' });
      expect(resp.status(), 'HTTP').toBeLessThan(400);
      await page.waitForFunction(() => window.__renderState === 'ready', null, { timeout: 150_000 });

      // Top-down view, then capture the viewport.
      await page.click('#view-top').catch(() => {});
      await page.waitForTimeout(500);
      const { tablet, caseName } = tabletCase(d.preset);
      const visDir = path.join(OUT_VISUAL, safe(tablet), safe(caseName));
      fs.mkdirSync(visDir, { recursive: true });
      const pngPath = path.join(visDir, safe(d.preset) + '.png');
      await page.locator('#viewport').screenshot({ path: pngPath });

      // Export the STL.
      const stlB64 = await page.evaluate(async () => {
        if (typeof window.__exportSTLBytes !== 'function') throw new Error('__exportSTLBytes missing');
        return window.__exportSTLBytes();
      });
      expect(pageErrors, 'page error').toEqual([]);
      // Hook returns base64 — far cheaper to marshal than a number[]. Decode
      // back to exact bytes. See app.html __stlToBase64.
      const stlBuf = Buffer.from(stlB64, 'base64');
      expect(stlBuf.length, 'STL empty/degenerate (no 3D solid)').toBeGreaterThan(200);

      const stlDir = path.join(OUT_STL, safe(tablet), safe(caseName));
      fs.mkdirSync(stlDir, { recursive: true });
      const stlPath = path.join(stlDir, safe(d.preset) + '.stl');
      fs.writeFileSync(stlPath, stlBuf);

      // Tier 2/3 stats from the exported bytes.
      const obs = computeStlStats(stlBuf);

      // Tier 1 admesh (informational).
      let admesh = null;
      if (haveAdmesh) {
        const r = spawnSync(ADMESH, [stlPath], { encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
        const out = `${r.stdout || ''}\n${r.stderr || ''}`;
        const g = re => { const m = out.match(re); return m ? parseInt(m[1], 10) : null; };
        admesh = { disconnected: g(/Total disconnected facets\s*:\s*(\d+)/i), parts: g(/Number of parts\s*:\s*(\d+)/i) };
      }

      // Golden delta (informational — golden corpus may differ by engine/version).
      let goldenDelta = null;
      const gs = d.goldenStem && golden[d.goldenStem];
      if (gs && gs.volume_mm3) {
        const rel = (a, b) => (b ? (a - b) / b * 100 : null);
        goldenDelta = {
          stem: d.goldenStem,
          volPct: +rel(obs.volume_mm3, gs.volume_mm3).toFixed(2),
          areaPct: +rel(obs.surface_area_mm2, gs.surface_area_mm2).toFixed(2),
          parts: `${obs.parts}/${gs.parts}`,
        };
      }

      const result = {
        preset: d.preset, tablet, caseName, mounting: d.mounting,
        oa: d.oa, goldenStem: d.goldenStem,
        png: path.relative(OUT, pngPath), stl: path.relative(OUT, stlPath),
        bytes: stlBuf.length, stats: obs, admesh, goldenDelta,
      };
      fs.writeFileSync(path.join(OUT_RESULTS, safe(d.preset) + '.json'), JSON.stringify(result, null, 1));

      console.log(`  rtp [${d.preset}] parts=${obs.parts} vol=${obs.volume_mm3}` +
        (goldenDelta ? ` | golden Δvol=${goldenDelta.volPct}% Δarea=${goldenDelta.areaPct}% parts=${goldenDelta.parts}` : ' | no golden'));
    });
  }
}
