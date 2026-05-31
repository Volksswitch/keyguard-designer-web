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

### Manifold workaround redundancy (after the hole_cutter prism fix)
The cell-floor "membrane" root cause turned out to be Manifold snapping the cell cutter's
degenerate thin-slab `hull()` (the flat all-90 body) at exact round `cell_edge_chamfer` /
`screen_area_thickness` values. `keyguard.scad`'s `hole_cutter` now builds that flat body as a
single `linear_extrude` prism (CGAL-identical solid, no thin-slab hull), eliminating the snap at
the source — same single-solid treatment already applied to the recess cutter (`hole_cutter2`).
Once that `.scad` fix is in the upstream `keyguard.scad`, re-evaluate whether the two
membrane-era workarounds in `app.html` are still doing anything:
  - the `fudge` / `ff` = 0.05 bump (vs the `.scad` native 0.01), and
  - `extend_through_cuts="yes"` (passed on both the preview and export paths).
Test: render the round-value sweep (cec 0.5/1.0/1.5, sat 3.5) with `extend_through_cuts="no"`
and `fudge=0.01`; if it stays clean (genus ~117, no membranes), those two are redundant for the
membrane and can be simplified. This does NOT replace the CGAL "precision" export, which still
handles the separate Manifold-vs-CGAL parts/bbox/area divergences (TC53, TC8, TC54, …). Treat any
removal as its own change with its own geometry-gate run.

### WASM crash clusters (identified 2026-05-15 full-suite run)
- **Cluster 1 — zero/negative `cell_corner_radius` + all-90 slopes** (WASM frame
  `wasm-function[3256]:0x1d30f9`): TC19 step 2 (cr=−10), TC23 step 2 (cr=−5),
  TC28 step 1 (cr=0, sat>kt), TC29 step 2 (cr=0, sat>kt).
- **Cluster 2 — Mount-related (TC18)**: step 1 ("No Mount") and step 5 ("Velcro") still crash;
  step 2 (suction cups) and step 3 (screw-on straps) now pass.
- **Cluster 3 — Test-spec mismatches, not WASM crashes**: TC0 step 1 (near-blank),
  TC10 steps 3–4 (SVG generation), TC13 step 3 (`geometry: false`), TC46 step 4 (SVG).
  These need the visual harness to learn about non-STL output kinds.

### WASM OOM on heavy / no-recess (sat==kt) designs ("memory access out of bounds") — intermittent
Heavy designs (dense grids — e.g. "…Grid Super Core 30 max rails" renders at ≈2× the geometry
of the plain variant) and no-recess configs (`sat == kt` — note `sat = min(kt, sata)` clamps it
to ≤ kt, so a user reaches this by setting `screen_area_thickness ≥ kt`) can crash a *live* render with
`Render failed: memory access out of bounds` — an openscad-wasm OOM trap. The build has
`ALLOW_MEMORY_GROWTH`, so the trap is a memory-*growth failure*, not a fixed ceiling: wasm32
linear memory is a single contiguous ArrayBuffer, and because the app spins up a fresh wasm
instance per render, a long-lived tab fragments its address space until a large contiguous grow
can't be satisfied — even with free RAM. That's why it's intermittent: `Ctrl-Shift-R` (fresh
tab) clears the fragmentation and the same design renders. Confirmed it is NOT a geometry bug and
NOT membrane-related — the geometry/RTP gates, which get fresh memory per test, render these exact
designs cleanly (e.g. "Fintie - Grid Super Core 30 max rails" passed in the RTP gate). Leads:
reuse a single wasm instance instead of tearing down/recreating per render (less fragmentation);
verify torn-down instances' ArrayBuffers are actually released; and/or pre-size the heap so growth
never fires. NOTE pre-sizing needs a *rebuild* — it cannot be set from the web app with the
current bundle: `openscad.js` creates its own internal memory (`wasmMemory = wasmExports["Vb"]`,
exported, NOT imported) and has no `Module["INITIAL_MEMORY"]` / `wasmMemory` override hook, so
`INITIAL_MEMORY` and the growth ceiling are baked into the `.wasm` at build time. To change it,
rebuild openscad-wasm with `-sINITIAL_MEMORY=<large>` (optionally `-sALLOW_MEMORY_GROWTH=0` for a
fixed buffer), or with `-sIMPORTED_MEMORY` so `app.html` can supply a pre-sized
`WebAssembly.Memory({initial, maximum})` per instance at runtime. Caveat: wasm32 caps at 4 GB and
a big buffer is reserved per instance, so pre-sizing pairs best with single-instance reuse. Also
likely eased once the per-cell extender (`extend_through_cuts`) is retired (see "Manifold
workaround redundancy") — it inflates the heap most on dense "max rails" grids.

### Image parity — camera model confirmed (2026-05-31)

Both projects capture at 2048×1536. The camera model has been validated empirically via the
"compare visual references" parity audit (168 pairs):

**Camera parameters — confirmed correct, no tuning needed:**
- `fov=22.5°` (vertical) matches OpenSCAD's CLI default (`$vpf = 22.5`)
- Rotation order ZXY extrinsic matches OpenSCAD's `--camera=tx,ty,tz,rx,ry,rz,dist` convention
- Camera placed at distance `vpd` from target (`vpt`) matches OpenSCAD's `dist` interpretation
- Best-case evidence: TC40 step1 (`vpr=[30,0,0]`, `vpd=600`) achieves **0.86% parity** (excellent bucket)

**Baseline after Mode 2 lighting + White background + Turquoise colour (2026-05-31):**
38 excellent / 89 good / 24 fair / 7 poor / 2 bad / 5 no-web / 3 skipped (render:true) (160 scored pairs).
Previous (before Turquoise colour normalisation + cell insert fix + ghost keyguard fix): 27 excellent / 81 good / 24 fair / 25 poor / 5 bad.

**Sources of remaining parity difference — all considered structural/expected:**

- **TC5 steps 3/4 (~53%, bad bucket):** Back-view renders (vpr rx > 90°). The keyguard body is
  highly chamfered/sloped; at this angle MeshPhong and OpenSCAD's CGAL renderer diverge maximally
  on the shadowed faces. **Structural: same geometry, irreconcilable shading models on shadow-heavy
  back-views. No fix needed — documented as expected.**

- **TC36 step1 (~27%, poor):** `generate="keyguard frame"` with ghost keyguard overlay
  (`show_keyguard_with_frame="yes"`). The ghost keyguard renders as a saturated highlight colour in
  OpenSCAD's interactive preview and in the `.scad` CLI reference (via `show_oa_highlights="yes"`
  in `params_override`), but the web app renders it as 45%-transparent pink in the highlights pass.
  This colour/transparency difference is visible but accepted — the geometry aligns correctly.
  **Structural: no fix needed.**

- **TC37 all 5 steps (~19%, poor):** Has `cell_top_edge_slope=63` and `home_button_edge_slope=30`.
  Same sloped-geometry shading divergence as TC5 — MeshPhong vs CGAL on chamfered/sloped faces.
  **Structural: no fix needed.**

- **TC41 step1 (~19%, poor):** Same cause as TC36 — ghost keyguard colour/transparency difference
  between OpenSCAD and the web app's highlights pass. **Structural: no fix needed.**

- **TC44-2 (~19%), TC44-3 (~18%), TC15 step3 (~16%):** Heavy chamfering and/or complex slope
  geometry at camera angles that maximise shading divergence between MeshPhong and CGAL.
  **Structural: same root cause as TC5 above.**

- **TC48 step3:** `"render": true` step — skipped in both web capture and parity comparison.

**Expected parity ranges by case type:**
- Excellent (<1%): simple geometry, moderate vpd, no screenshots
- Good (1–5%): standard 3D keyguard, typical background fraction
- Fair (5–15%): complex chamfers/slopes, larger vpd, or portrait models
- Poor (15–30%): extreme back-views of chamfered/sloped geometry
- Bad (>30%): back-views where shadow discrepancy is maximum (TC5 steps 3/4)

### Pre-existing Manifold↔CGAL geometry-gate divergences (TC5/8/46/47/54) — KEN to investigate
The geometry gate (`tests/geometry.spec.mjs`, Manifold vs the `.scad` CGAL golden manifest) fails
13 steps across Test Cases 5, 8, 46, 47, 53, 54. Confirmed **identical on `.scad` main** (baseline
run 2026-05-24) → pre-existing Manifold-backend divergences, NOT caused by the v78 membrane fix.
Volume matches the golden in nearly all; the divergences are in:
- parts count — TC5 1≠3, TC47 16≠1 (embossed text @ depth +2), TC54 4≠1, TC8 1≠2;
- bbox ~1 mm shifts — TC8, TC46;
- surface area — TC8 up to 3.67%, TC53 3.8%.
This is the class the CGAL "precision" export exists for. TC53 is separately documented in the
`.scad` CLAUDE.md (non-manifold, 7 parts). Note the v78 fix *improved* several toward the golden
(TC46 s3 laser-cut vol Δ16%→0.03%; TC53 vol/parts), but TC5 s1 gained ~32k reversed facets
(non-gated / slicer-tolerated; TC5 already routes to CGAL precision).
**ACTION (Ken):** investigate why Manifold diverges from CGAL on TC5/8/46/47/54 and whether each
should auto-fall back to the CGAL precision export; report findings back.

### RTP gate "golden" is the downloaded-website snapshot, not a current CGAL golden — KEN to clarify
`tests/ready-to-print.spec.mjs` passed 292/292 (2026-05-24), but the deltas it prints are measured
against `golden-rtp-stats.json` = the **downloaded-website** reference (a different design/version
snapshot), so large deltas (e.g. `Δvol=+89.76%` on "Grid Super Core 30 max rails") are
informational, not pass/fail. An RTP "pass" therefore confirms the design *renders* via Manifold,
not that it *matches CGAL*. The meaningful Manifold-vs-CGAL RTP check is the separate "run the
membrane comparison" (`compare-rtp-membranes.py` vs `golden-rtp-cgal-stats.json`) and/or
regenerating the RTP CGAL golden.
**ACTION (Ken):** decide whether the RTP gate should compare against the CGAL golden (a meaningful
pass/fail) rather than/in addition to the website snapshot; report findings back.

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
- **Version numbering — `dev` is always one ahead of public.** `APP_RELEASE` (in `app.html`)
  is the app's integer version — the analog of `keyguard_designer_version` in `keyguard.scad`.
  The moment you start a new development cycle, **pre-increment `APP_RELEASE` on `dev` to (last
  public release + 1)**, exactly as you bump `keyguard_designer_version` at the start of new
  `.scad` work. So a dev build always reads one ahead of what's deployed, and the project-open
  console banner makes that visible. This is the ONE release constant that moves on `dev`:
  `APP_RELEASE` is a display label and is pre-bumped; `CACHE_NAME` is the service-worker cache
  key and is NOT — it still moves only during the release ritual, to match `APP_RELEASE`. See
  `RELEASING.md`.
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

## Trigger phrase — update web app visual references

When Ken says **"update visual references"**, run in the **background**:
```
KEYGUARD_VISUAL_CASES=* bash scripts/test.sh --visual --update
```
from the web-app project root. This re-captures ALL Playwright reference PNGs using the
pinned appearance settings in `tests/visual.spec.mjs` (`CAPTURE_ITEM_COLOR`, `CAPTURE_BG_COLOR`,
`CAPTURE_OS_LIGHTING`) — currently Turquoise `#40E0D0` (exact CSS "Turquoise" / OpenSCAD `color("Turquoise")`), White background `#F8F8F8`, Mode 2
(OpenSCAD-matched) lighting. When done, commit the updated PNGs under
`tests/visual.spec.mjs-snapshots/`.

- **Progress log** (tail -f while running): `visual-update-progress.log`

---

## Trigger phrase — cross-backend visual parity

When Ken says **"compare visual references"**, run `bash scripts/compare-visual-references.sh`
in the **background** and report when it finishes. It compares every web-app Playwright
viewport PNG against the matching .scad OpenSCAD CGAL reference PNG and produces a
worst-to-best parity report.

- **Progress log** (tail -f while running): `output/compare-visual-references-progress.log`  
  One line per pair as processed: bucket, ratio, case name, step filename.
- **Final sorted report**: `output/compare-visual-references.txt`  
  Tab-separated, sorted worst-to-best, with summary buckets at the bottom.

Requires Python 3 with `Pillow` and `numpy` on PATH. Derives the .scad project path as
a sibling of the web-app root via OneDrive, so it works unchanged on both machines.

---

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
designer path from `$env:OneDrive` (RTP root = `<designer>\tests\rtp`), and writes
`<designer>\tests\rtp\golden-stl\cgal-chunks\chunk-N-of-2.json` (resumable — rerunning continues).
Both machines share one OneDrive; the harness renders each design in a private temp dir and
writes distinct per-chunk files, so the two chunks never collide.

When Ken says **"merge the RTP golden"**, run `powershell -File scripts\rtp-chunk.ps1 merge`
→ combines the chunk files into `tests\rtp\golden-stl\golden-rtp-cgal-stats.json` (the membrane-detection
reference). Do this only after both chunks have finished.

When Ken says **"run the membrane comparison"**, run
`python scripts\compare-rtp-membranes.py` (defaults to `<designer>\tests\rtp`; override with
`KEYGUARD_RTP_ROOT`). It diffs the app's Manifold export stats
(`output\ready-to-print\results\*.json`) against the CGAL golden and flags membrane suspects
(surface area well above the golden, and/or a part-count split) plus designs that crashed the
export. Writes `output\ready-to-print\membrane-comparison.csv`. Then run
`python scripts\generate-membrane-review.py` for the human worklist
(`output\ready-to-print\MEMBRANE-REVIEW.md`): export crashes + membrane suspects tiered by
severity with STL paths, a pattern breakdown, and a few passed designs to spot-check.
NOTE: the results files come from the `ready-to-print.spec.mjs` Playwright run — if they're
stale, re-run that spec first so the comparison reflects the current app/.scad.
