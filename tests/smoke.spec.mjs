// smoke.spec.mjs — Layer 2 smoke test.
//
// Goal: prove that app.html loads in a real headless browser without throwing
// a JavaScript error, without an unhandled rejection, and without any
// console.error() calls. Doesn't open a project or render — that's for a
// later test layer.

import { test, expect } from '@playwright/test';

test('app.html loads without console errors', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => { pageErrors.push(err.message); });

  // Path is relative to baseURL in playwright.config.mjs.
  const resp = await page.goto('/app.html', { waitUntil: 'load' });
  expect(resp, 'no HTTP response from /app.html').not.toBeNull();
  expect(resp.status(), `unexpected HTTP status: ${resp.status()}`).toBeLessThan(400);

  // The Open Project button is the first interactive element a user sees
  // after the bundled Three.js + module imports finish executing. If it
  // never appears, app initialisation failed for whatever reason.
  await expect(
    page.locator('#open-project-btn'),
    'Open Project button never became visible — app init likely failed'
  ).toBeVisible({ timeout: 10000 });

  // Give the module imports + IndexedDB lookup a moment to settle before
  // we assert "no errors". File-System-Access prompts only fire on user
  // gesture so this won't trigger a permissions dialog.
  await page.waitForTimeout(500);

  expect(pageErrors, 'page threw an uncaught error').toEqual([]);
  expect(consoleErrors, 'console.error was called during load').toEqual([]);
});
