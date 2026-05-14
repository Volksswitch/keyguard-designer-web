// playwright.config.mjs — minimal config for the smoke test layer.
//
// Spawns python's built-in HTTP server on port 8765 (well above the
// default 8000 used by serve.bat to avoid collisions), waits for it to
// respond, runs the tests, then kills the server.

import { defineConfig, devices } from '@playwright/test';

const PORT = 8765;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,         // one smoke test; no need to parallelise
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    // App requires File System Access API + IndexedDB — chromium is the only
    // engine that supports them.
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Python is already a project prerequisite (serve.bat uses it), so we
  // can rely on it being on PATH for the test web server too.
  webServer: {
    command: `python -m http.server ${PORT}`,
    url: `http://127.0.0.1:${PORT}/app.html`,
    timeout: 10_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
