// visual.spec.mjs — Layer 3 visual regression test.
//
// Loads the bundled `keyguard design/` fixture via the ?fixture= URL hook
// in app.html, switches through a small set of preset configurations, and
// screenshots the Three.js viewport for diff against committed reference
// images.
//
// First-time setup (or after intentional viewport changes): run
//   ./scripts/test.sh --visual --update
// to regenerate the references. Commit the resulting PNGs in
// tests/visual.spec.mjs-snapshots/ alongside this file.

import { test, expect } from '@playwright/test';

const FIXTURE_PATH = 'keyguard design';
const SCAD_FILE    = 'keyguard.scad';

// Per-case: the preset name (or undefined for design defaults), and the
// snapshot filename. Keep the list small — each case adds ~10 s to the
// suite. Pick presets that exercise distinct render paths.
const CASES = [
  { name: 'default-values',   preset: null,
    snapshot: 'default-values.png' },
  { name: 'fintie-coughdrop', preset: 'iPad 7,8,9 - Fintie - Cough Drop QC 60',
    snapshot: 'fintie-coughdrop.png' },
];

for (const c of CASES) {
  test(`viewport renders cleanly: ${c.name}`, async ({ page }) => {
    // Surface any page-level error or console.error during the test
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const params = new URLSearchParams({
      fixture: FIXTURE_PATH,
      scad:    SCAD_FILE,
    });
    if (c.preset) params.set('preset', c.preset);

    const resp = await page.goto(`/app.html?${params.toString()}`, { waitUntil: 'load' });
    expect(resp, 'no HTTP response').not.toBeNull();
    expect(resp.status()).toBeLessThan(400);

    // Wait for the fixture loader + render to finish. The render-state flag
    // is set inside doRender(): 'rendering' at start, 'ready' on success.
    // openscad-wasm cold-start + 2 STL renders typically take 5–15 s.
    await page.waitForFunction(
      () => window.__renderState === 'ready',
      null,
      { timeout: 60_000 }
    );

    // Small settle pause after 'ready' — orbit controls' damping can still
    // animate the camera briefly, and Three.js auto-frames in a follow-up
    // requestAnimationFrame after the STL mesh is added.
    await page.waitForTimeout(750);

    // Screenshot the viewport canvas only, not the full page. Diff against
    // tests/visual.spec.mjs-snapshots/<snapshot>. Playwright auto-creates
    // the reference on first run if --update-snapshots is passed; otherwise
    // a missing reference is a failure (same as a diff).
    const viewport = page.locator('#viewport canvas');
    await expect(viewport, `screenshot diff for case: ${c.name}`).toHaveScreenshot(
      c.snapshot,
      {
        // Allow small per-pixel anti-aliasing noise from WebGL. Without
        // this, headless Chromium's swiftshader rendering can produce
        // sub-percent diffs run-to-run on identical scenes.
        maxDiffPixelRatio: 0.01,
        threshold: 0.15,
      }
    );

    expect(pageErrors, 'page threw an uncaught error').toEqual([]);
    expect(consoleErrors, 'console.error was called').toEqual([]);
  });
}
