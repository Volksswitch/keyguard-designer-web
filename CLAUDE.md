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

### Manifold workaround redundancy — informational only (do not pursue unless a field problem)
`app.html` injects `fudge=0.05`, `ff=0.05`, and `extend_through_cuts="yes"` as membrane-era
workarounds. The root cause was fixed in `keyguard.scad` (`hole_cutter` prism refactor). These
overrides may now be redundant for membranes, but removing them would require a geometry-gate run
to confirm no regressions, and the risk/reward is low. Do not pursue unless membranes re-appear
in the field or `extend_through_cuts` is retired for another reason.

### ~~WASM crash clusters~~ — **All resolved** (verified 2026-06-04)
- **Cluster 1** (TC19/23/28/29 — zero/negative `cell_corner_radius`): all pass. Fixed by
  `keyguard.scad` geometry changes since 2026-05-15.
- **Cluster 2** (TC18 — "No Mount" step 1, "Velcro" step 5): both pass. Fixed by the
  `mounting_method` rename to `"- none -"` (2026-06-03).
- **Cluster 3** (TC0/10/13/46 — non-STL steps): resolved by harness changes `d9cd710`,
  `6634299` (geometry:false / render:true steps correctly skipped).

### WASM OOM on heavy / no-recess designs — deferred to future WASM release
Intermittent `Render failed: memory access out of bounds` on dense grids and no-recess configs
(`sat == kt`). Root cause: wasm32 address-space fragmentation from per-render instance teardown.
`callMain` triggers `exitJS()`, which tears down the runtime — single-instance reuse is not
possible with the current build. Fixing it requires rebuilding openscad-wasm with
`-sIMPORTED_MEMORY` (so `app.html` can supply a pre-sized `WebAssembly.Memory` per instance) or
`-sINITIAL_MEMORY=<large>` with `-sALLOW_MEMORY_GROWTH=0`. Workaround for users: `Ctrl-Shift-R`
(fresh tab) clears fragmentation. **Deferred until a new openscad-wasm release provides the
necessary build flags.**

### Image parity — camera model confirmed (2026-05-31)

Both projects capture at 2048×1536. The camera model has been validated empirically via the
"compare visual references" parity audit (168 pairs):

**Camera parameters — confirmed correct, no tuning needed:**
- `fov=22.5°` (vertical) matches OpenSCAD's CLI default (`$vpf = 22.5`)
- Rotation order ZXY extrinsic matches OpenSCAD's `--camera=tx,ty,tz,rx,ry,rz,dist` convention
- Camera placed at distance `vpd` from target (`vpt`) matches OpenSCAD's `dist` interpretation
- Best-case evidence: TC40 step1 (`vpr=[30,0,0]`, `vpd=600`) achieves **0.86% parity** (excellent bucket)

**Baseline after merged-cell ridge work + TC59 add (2026-06-06):**
38 excellent / 89 good / 36 fair / 2 poor / 3 bad / 5 no-web / 3 skipped (render:true) (168 scored pairs).
New/changed cases (TC43 step1/2/3 ≈0.055–0.059, TC59 step1 ≈0.053) all land in the **fair** bucket — same parity range as TC43's siblings, no regression. The shift from the prior baseline (24 fair / 7 poor / 2 bad) is dominated by ridge-geometry recapture across the merged-cell suite, not a backend change.
Previous (2026-05-31, Mode 2 + White bg + Turquoise): 38 excellent / 89 good / 24 fair / 7 poor / 2 bad / 5 no-web / 3 skipped (160 scored pairs).
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

### Manifold↔CGAL geometry-gate divergences — all resolved or waivered (verified 2026-06-04)
TC5, TC46a/b, TC47a, TC54 are explicitly waivered in `TOLERATED_DIVERGENCES` in
`tests/geometry.spec.mjs` (parts-count and sub-mm bbox differences; same mesh content). TC53 is
excluded from the geometry gate via `"geometry": false` in its `test.json`.
**TC8** — previously showed parts 1≠2, bbox shifts, surface area up to 3.67%. Verified
2026-06-04: all 6 steps pass at Δ0.000% volume and area, parts match. No waiver needed.

### RTP gate — architecture is intentional; CGAL golden captured 2026-05-25
`tests/ready-to-print.spec.mjs` confirms all 292+ clinical designs *render* via Manifold (pass =
no crash). It compares against `golden-rtp-stats.json` (website snapshot) for informational
deltas only — large deltas are expected and are not pass/fail. This is intentional: the RTP spec
is a render-health check, not a geometry-accuracy gate.
The meaningful Manifold-vs-CGAL accuracy check is the separate **membrane comparison workflow**:
`compare-rtp-membranes.py` vs `golden-rtp-cgal-stats.json` (captured 2026-05-25, in
`tests/rtp/golden-stl/`). Run via trigger phrase "run the membrane comparison".

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
- **Progress logging (mandatory).** For ANY multi-step or long-running task, continuously
  append progress to a single human-readable `progress.log` at this project root (derive the
  path from `$env:OneDrive`, never hardcode a user path). It is the minimum bar — progress
  must be discoverable there even when also tracked in the task list, chat, or a per-job log.
  When work happens in a worktree, still write to the MAIN project root so Ken and the other
  machine can `tail -f` it regardless of which worktree is active. **Every record MUST begin
  with a wall-clock timestamp** in `[YYYY-MM-DD HH:MM:SS]` form (local time) — no exceptions;
  when mirroring a background job's output, prepend the timestamp as you write each line.
  Append timestamped lines as steps start/finish (what, status, key result — render stats,
  PASS/FAIL counts, commit SHA); do not overwrite. `progress.log` is gitignored — git is the
  code history, `progress.log` is the work history. Per-job logs (e.g.
  `visual-update-progress.log`) may coexist, but their progress must flow into `progress.log`
  LIVE (redirect/tee from the start, or a follower that mirrors new lines).

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

## Trigger phrase — apply skill config

When Ken says **"apply skill config"**, run from the web-app project root:
```
node scripts/apply-skill-config.js
```
This reads `skill-config.txt` and injects the updated `SKILL_LEVEL_DESCS` and `SKILL_CONFIG`
into `app.html` between the `@@…_START@@` / `@@…_END@@` markers. No OpenSCAD or build step
required. Takes under a second; run it in the foreground and report whether it succeeded.

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

---

## Trigger phrases — publish the version manifests (auto-update feature)

The web app checks two tiny JSON manifests to offer updates: `latest_scad_version.json`
(in the **.scad** repo) drives the in-app "Keyguard update available" modal at project open;
`latest_app_version.json` (in **this** repo) lets a stale app force-refresh itself through the
service worker (killing the Ctrl-Shift-R dance). Each has a regenerator script so the
per-release edit is one command.

When Ken says **"publish scad version"**, run in the foreground:
```
node scripts/publish-scad-version.mjs
```
Reads `keyguard_designer_version` from the .scad repo's `keyguard.scad` and rewrites
`latest_scad_version.json` (version, `keyguard_vNN.scad` filename, fixed raw URL). The `notes`
array — the **clinician-visible "What's new" list shown in the update dialog** — is sourced
VERBATIM from the .scad project's `CHANGELOG.md` `## Version N` section, so the dialog always
lists exactly the changelog's clinician-facing bullets for that version. **The script errors if
that section is missing**, so a version is never advertised without its clinician notes — keep
`CHANGELOG.md`'s `## Version N` bullets clinician-visible (dev-internal detail does not belong
there). Report the version it wrote. Ken still commits & pushes that file to
`Volksswitch/keyguard` (main) to go live — until pushed, the app's check 404s and silently
no-ops.

When Ken says **"publish app version"**, run in the foreground:
```
node scripts/publish-app-version.mjs
```
**RELEASE-TIME ONLY.** Reads `APP_RELEASE` from `app.html` and rewrites `latest_app_version.json`.
Because `APP_RELEASE` is pre-bumped on `dev`, this manifest must move ONLY at release (like
`CACHE_NAME`) — it belongs in the release merge to `main`, never on `dev`. The script prints the
value and the current `CACHE_NAME` as a sanity check. See `RELEASING.md`, which folds this into
the release ritual.
