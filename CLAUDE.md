# Keyguard Designer (web) — Claude Code Context

## What this project is

A browser-based clinician tool that wraps `keyguard.scad` so AAC clinicians on locked-down
workstations (no OpenSCAD install allowed) can still design keyguards. Runs entirely in Chrome or
Edge via openscad-wasm + Three.js — no install, no command line.

**Author:** Volksswitch (www.volksswitch.org) — released to the public domain (CC0)

**Repo:** https://github.com/Volksswitch/keyguard-designer-web  
**Local path:** `C:\Users\ken\OneDrive\4 T-Z\Volksswitch\Keyguard\keyguard-designer-web\`  
**Companion .scad project:** `C:\Users\ken\OneDrive\4 T-Z\Volksswitch\keyguard\My SCAD files\keyguard designer\`

These are peer projects. The web tool consumes `keyguard.scad` as an artifact; it doesn't own it.
The .scad project is the source of truth for the designer itself.

---

## How the app works (user's perspective)

1. Clinician opens the hosted URL (or runs `serve.bat` locally) in Chrome or Edge.
2. Clicks **Open Project…**, picks a folder containing `keyguard.scad` (+ optionally
   `keyguard.json`, `openings_and_additions.txt`, `default.svg`).
3. A Customizer pane generates automatically from the `.scad` file's top-of-file declarations.
   Preset dropdown populates from `.json`. Changes trigger auto-renders (~0.5 s via Manifold).
4. **Export** writes STL, SVG, or PNG to Downloads. Independent render — no highlight overlays
   in the exported file.

The app does **not** bundle `keyguard.scad` — clinicians assemble their own project folder from
the upstream .scad repo. This removes the vendoring problem entirely.

---

## Feature status (as of 2026-05-15)

| Feature | Status |
|---|---|
| openscad-wasm + Three.js viewport | ✅ |
| File System Access folder picker | ✅ |
| Manifold backend (~0.5 s renders) | ✅ |
| Auto-watch `openings_and_additions.txt` (1.5 s poll) | ✅ |
| Customizer pane from `.scad` declarations | ✅ |
| Preset management (Save / Add / Delete) | ✅ Matches OpenSCAD on-disk JSON format |
| O&A highlight overlays (two-render STL approach) | ✅ |
| Engraved/embossed text highlighting | ✅ |
| Persistent last-opened folder (IndexedDB) | ✅ |
| Export STL / SVG / PNG | ✅ |
| Screenshot underlay (`default.svg` / jpg / png) | ✅ |
| Viewport camera presets (view buttons) | ✅ |
| Settings modal (preset order, etc.) | ✅ |

---

## Open bugs / improvements

### Numeric input debounce
Numeric Customizer parameters currently re-render on each keystroke / blur. Should re-render
only when Enter is pressed or focus leaves the field after a real change.

### App-layout-in-mm cell-cut bug
When the sum of any "App layout in mm" parameters exceeds 5 mm, cell openings stop cutting all
the way through. May be resolved by the Manifold thin-floor fix — re-test against current main
before digging in.

### WASM crash clusters (identified 2026-05-15 full-suite run)
- **Cluster 1 — zero/negative `cell_corner_radius` + all-90 slopes** (WASM frame
  `wasm-function[3256]:0x1d30f9`): TC19 step 2 (cr=−10), TC23 step 2 (cr=−5),
  TC28 step 1 (cr=0, sat>kt), TC29 step 2 (cr=0, sat>kt).
- **Cluster 2 — Mount-related (TC18)**: step 1 ("No Mount") and step 5 ("Velcro") still crash;
  step 2 (suction cups) and step 3 (screw-on straps) now pass.
- **Cluster 3 — Test-spec mismatches, not WASM crashes**: TC0 step 1 (near-blank),
  TC10 steps 3–4 (SVG generation), TC13 step 3 (`geometry: false`), TC46 step 4 (SVG).
  These need the visual harness to learn about non-STL output kinds.

### Image parity tuning
Both projects capture at 2048×1536. Web uses FOV 22.5° to approximate OpenSCAD's CLI default.
After Ken reviews side-by-side pairs, may need to nudge FOV or vpd interpretation.

---

## Implementation notes

- **Two STL renders per viewport refresh:** one for the keyguard (`show_oa_highlights="no"`),
  one for highlight overlays (`only_oa_highlights="yes"`). 3MF with `color()` would allow one
  render, but no off-the-shelf openscad-wasm build has lib3mf compiled in.
- **Fresh WASM instance per render:** `createOpenSCAD`'s `callMain` triggers `exitJS()`, tearing
  down the runtime. Each render must create a new instance.
- **Cell-floor workaround:** `doRender()` injects `-D fudge=0.05 -D ff=0.05` *after* `-p/-P`
  preset switch. Order matters — a preset pinning `fudge=0.01` would clobber an earlier `-D`.
- **Single-threaded WASM:** The openscad-wasm build (v0.0.4) has no `SharedArrayBuffer` usage
  and no pthreads. COOP/COEP response headers are **not required**.
- **FSA API:** File System Access API requires an HTTPS (or localhost) origin. `file://` URLs
  kill the folder picker, O&A auto-watch, save-preset-in-place, and IndexedDB persistence.
- **IndexedDB / localStorage keys** are `keyguard:settings` and `keyguard-db`. The old
  `keyguard-spike:*` names are read once as a fallback (`LEGACY_*` in `app.html`) and
  migrated forward, so returning clinicians keep their settings and remembered folder.
- **`__KG_DIMS__`** echo magic string in `keyguard.scad` ↔ parsed by `app.html` — working
  contract (renamed from the old `__SPIKE_DIMS__`); keep the two sides in lockstep.

---

## Deployment decision (decided 2026-05-13)

**Target:** hosted PWA at `volksswitch.org/keyguard/` — a path under the existing domain
(inherits domain reputation; less likely to trip enterprise URL category filters).

**Hosting:** Cloudflare Pages or Netlify (both support custom response headers, which is useful
if the WASM build ever upgrades to threaded/SharedArrayBuffer). Plain GitHub Pages is also viable
given the current single-threaded build — it cannot set COOP/COEP headers, but those aren't
currently needed.

**PWA from day one:** web app manifest + service worker so the hosted URL and the installable
PWA ship together. Degrades cleanly to a regular browser tab when managed-device policy blocks
install.

**Rejected approaches:**
- *Single-file HTML bundle (`file://`):* kills FSA API and SharedArrayBuffer. Degrades the
  tool from "open a project folder" to "shuffle files through Downloads." Not worth building.
- *Browser extension:* blocked on managed devices.

**Fallback for truly air-gapped clinicians:** print-partner workflow (clinician sends
measurements/screenshot to a colleague who runs the tool), not a degraded bundle.

**Pilot plan (do before deployment polish):**
1. Confirm whether COOP/COEP headers are required — **confirmed not required** (single-threaded
   WASM, no SharedArrayBuffer). Plain GitHub Pages is viable.
2. Stand up a temporary hosted URL, add minimal web app manifest + service worker, test
   install + an end-to-end keyguard render on a real managed Chrome/Edge laptop.

---

## Running the app locally

```bat
serve.bat          :: starts python -m http.server 8000
:: then open http://localhost:8000/app.html in Chrome or Edge
```

Or directly: `python -m http.server 8000` from the repo root.

---

## Test harness

```bash
./scripts/test.sh          # All layers (lint + smoke + visual)
./scripts/test.sh --lint   # Layer 1: JS parse check on app.html's inline ES module
./scripts/test.sh --smoke  # Layer 2: Playwright headless load; fails on console errors
./scripts/test.sh --visual # Layer 3: Viewport screenshot regression
./scripts/test.sh --visual --update  # Regenerate reference screenshots
```

Or via cmd.exe / PowerShell: `scripts\test.cmd [flags]`

**Layer 3 mechanics:**
- Test cases discovered from the upstream .scad project's `tests/cases/*/test.json`
  (sibling path `../My SCAD files/keyguard designer/` or `KEYGUARD_DESIGNER_ROOT` env var).
- `keyguard.scad` + `keyguard.json` fetched live from upstream; per-case openings file served
  via a Playwright route handler.
- Captures go through `window.__captureViewportPNG()` — same code path as Export → PNG.
- Reference layout: `tests/visual.spec.mjs-snapshots/Test Case N/stepM_expected.png`
  (mirrors .scad project's `tests/cases/visual.snapshots/Test Case N/stepM_expected.png`).
- Default cases: TC3, TC5. Override: `KEYGUARD_VISUAL_CASES=Test Case 3,Test Case 17` or `*`.
- Full 162-step run takes ~52 min.

---

## Project file structure

```
keyguard-designer-web/
├── CLAUDE.md                  ← This file
├── app.html                   ← The entire app (single HTML file with inline ES module)
├── serve.bat                  ← Local dev server launcher
├── package.json               ← Node devDependencies (Playwright); not needed to run the app
├── playwright.config.mjs
├── openscad-wasm/             ← Vendored openscad-wasm v0.0.4 (single-threaded)
├── vendor/                    ← Vendored Three.js and other JS deps
├── scripts/
│   ├── test.sh                ← Multi-layer test runner (bash)
│   └── test.cmd               ← cmd.exe / PowerShell wrapper
├── tests/
│   ├── visual.spec.mjs        ← Playwright visual regression spec
│   ├── timings-reporter.mjs   ← Custom reporter (writes test-timings.ndjson)
│   └── visual.spec.mjs-snapshots/  ← Reference PNGs (committed)
│       └── Test Case N/
│           └── stepM_expected.png
├── results.md                 ← Historical feasibility-verdict snapshot (2026-05-12); keep as-is
└── output/                    ← Not committed
```

**Vestigial files** (noted in README as dead, deletion deferred):
`index.html`, `mockup.html`, `backend-test.html`, `inputs/`

---

## Working conventions

- The app lives entirely in `app.html`. No build step, no bundler.
- Node / npm are only needed for the Playwright test harness.
- Do not add external library dependencies that require a build step — the app must remain
  servable by a plain `python -m http.server`.
- **Branch model — `dev` is the only branch you commit to.** All day-to-day work goes on
  `dev`. **`main` is release-only**: GitHub Pages serves `main`, and it moves *only* via the
  release ritual (merge `dev → main` + bump `CACHE_NAME` in the same merge commit). Never
  commit app changes directly to `main`. Never bump `CACHE_NAME` on `dev`. Pushing to `dev`
  must never reach clinicians — that invariant is the whole point of the split.
- **Releasing is a deliberate, infrequent act, not an automatic consequence of a push.** Do
  not merge `dev → main` after every change. See `RELEASING.md` for the full when/how —
  follow it exactly; it is the source of truth for the release process.
- Run `scripts/test.sh` (all layers) after any change. Scope visual tests to affected cases
  during iteration; run the full suite before declaring a feature complete.

## Working by trigger phrase (no manual shell commands)

Ken does not run PowerShell/Bash/Python commands by hand. For ANY repeatable
operation:
1. Create or reuse a script under `scripts/`.
2. Give it a trigger phrase of the form **"run &lt;name&gt;"** and document that
   phrase (and exactly what it runs) HERE in CLAUDE.md, in the same change.
3. When Ken says the phrase, Claude runs the script for him — in the background if
   it is long-running — and reports the result. Never hand Ken raw commands to type.

Scripts must run unchanged on either machine: derive paths from `$env:OneDrive`
(never hardcode `C:\Users\<name>`), and let Claude pick the interpreter so the
phrase is all Ken needs. Because CLAUDE.md is the only thing that syncs and is
auto-loaded on both machines, a new phrase only works after OneDrive syncs this
file AND the other machine's Claude session is restarted.

## Trigger phrases — RTP CGAL golden regen (2-machine split)

DISAMBIGUATION: "chunk N" alone is ambiguous — the .scad project's
`geometry-chunk.sh` (test-case `--geometry` validation, 9 chunks) also takes a
chunk number. The RTP golden job here has ONLY 2 chunks. If Ken says a bare
"chunk N" with N>2, he means the geometry validation, not this. For THIS job he
should say **"run RTP chunk N"**.

When Ken says **"run RTP chunk N"** (or "ready-to-print chunk N"), run the wrapper in
the **background** and report when it finishes — it is a multi-hour CGAL render:

```
powershell -File scripts\rtp-chunk.ps1 N
```

`N` is 1 (laptop) or 2 (desktop); the wrapper hardcodes the 2-machine split, derives the
RTP/designer paths from `$env:OneDrive`, and writes
`Web-App-Test\golden-stl\cgal-chunks\chunk-N-of-2.json` (resumable — rerunning continues).
Both machines share one OneDrive; the harness renders each design in a private temp dir and
writes distinct per-chunk files, so the two chunks never collide.

When Ken says **"merge the RTP golden"**, run `powershell -File scripts\rtp-chunk.ps1 merge`
→ combines the chunk files into `golden-stl\golden-rtp-cgal-stats.json` (the membrane-detection
reference). Do this only after both chunks have finished.

When Ken says **"run the membrane comparison"**, run
`python scripts\compare-rtp-membranes.py` (set `KEYGUARD_RTP_ROOT` to the Web-App-Test folder,
or rely on its OneDrive fallback). It diffs the app's Manifold export stats
(`output\ready-to-print\results\*.json`) against the CGAL golden and flags membrane suspects
(surface area well above the golden, and/or a part-count split) plus designs that crashed the
export. Writes `output\ready-to-print\membrane-comparison.csv`. Then run
`python scripts\generate-membrane-review.py` for the human worklist
(`output\ready-to-print\MEMBRANE-REVIEW.md`): export crashes + membrane suspects tiered by
severity with STL paths, a pattern breakdown, and a few passed designs to spot-check.
NOTE: the results files come from the `ready-to-print.spec.mjs` Playwright run — if they're
stale, re-run that spec first so the comparison reflects the current app/.scad.
