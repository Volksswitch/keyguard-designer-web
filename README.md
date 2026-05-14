# Keyguard Designer (web)

A browser-based version of the Volksswitch [keyguard designer](https://www.volksswitch.org), aimed at AAC clinicians whose workstations don't allow installing OpenSCAD. Runs entirely in Chrome or Edge via [openscad-wasm](https://github.com/DSchroer/openscad-wasm) + Three.js.

The clinician opens the app, picks a folder containing the keyguard designer files, and works in a Customizer pane with a live 3D viewport — no install, no command line, no OpenSCAD.

## Requirements

- **Chrome or Edge** on Windows or macOS. Firefox and Safari aren't supported (no File System Access API).
- A folder on your computer containing the keyguard designer's files (see below).
- Python on `PATH` if you're running the app locally with `serve.bat`.

## Project folder layout

The app loads its inputs from a folder you pick on your computer. The folder must contain:

| File | Required | Purpose |
|---|---|---|
| `keyguard.scad` | yes | The parametric designer itself. |
| `keyguard.json` | optional | Named Customizer presets. Without this, you can still tweak parameters but can't switch between saved configurations. |
| `openings_and_additions.txt` | optional | Custom screen/case openings and additions. Without this, the app uses an empty O&A. |
| `default.svg` | optional | Tablet screenshot used as a fit-test layer when `include_screenshot = "yes"`. |

You obtain these files from the upstream [keyguard designer .scad project](https://www.volksswitch.org) — they aren't bundled with this app. Drop them into a folder, point the app at it, and you're set.

## Running the app

1. Double-click `serve.bat` (or run `python -m http.server 8000` from this folder).
2. Open <http://localhost:8000/app.html> in Chrome or Edge.
3. Click **Open Project…** and pick your project folder. The app remembers your choice — next time you launch, one permission click reopens the same folder.
4. The viewport renders automatically. Change Customizer parameters or switch presets and the render auto-refreshes (Manifold backend, ~0.5 s per render).
5. **Export** writes a fresh render in the chosen format (STL or SVG) to your Downloads folder. The export is independent of the viewport, so highlight overlays never end up in the exported file.

## Features

- **Customizer pane** generated automatically from `keyguard.scad`'s top-of-file declarations. Dropdowns, range sliders, plain numbers, strings, vectors.
- **Preset management** — Save, Add (+), Delete (−). Matches OpenSCAD's on-disk JSON format. Settings → Preset list order = Alphabetical / Creation.
- **Auto-watch** `openings_and_additions.txt` — edit the file in your usual editor and the viewport re-renders within ~1.5 s.
- **O&A highlight overlays** — any row whose ID is `"#"` shows as a pink translucent ghost over the keyguard. Customizer-driven embossed/engraved text is also highlighted, so engraved text that landed inside a cell is easy to spot.
- **Persistent last-opened folder** stored in IndexedDB; one permission prompt and you're back in.
- **Render backend** selectable in Settings: Manifold (default, fast) or CGAL (slower but precise). Some bar-height + cell-grid combinations expose a Manifold precision bug that leaves a thin floor inside cell openings; switching to CGAL produces a clean cut at the cost of 10&ndash;60 s render time.

## Implementation notes

- The viewport does **two STL renders per refresh**: one for the keyguard, one for the highlight overlays (driven by the `only_oa_highlights="yes"` flag in `keyguard.scad`). 3MF with `color()` would let us do one render, but no off-the-shelf openscad-wasm has lib3mf compiled in — even the 2025.03.25 playground build returns "Export to 3MF format was not enabled".
- Each render needs a fresh wasm instance because the `createOpenSCAD` wrapper's `callMain` triggers `exitJS()` at the end, tearing down the runtime.
- WASM-only workaround: `doRender()` injects `-D fudge=0.05 -D ff=0.05` *after* the `-p/-P` preset switch. Manifold's precision floor treats sub-0.01 mm through-cuts as exact-coincident and leaves a thin floor on every cell. 0.05 mm is the largest value we can apply globally without breaking other geometry — the `.scad` uses `ff` with hardcoded multipliers (e.g. `50*ff`, `2*ff` inside `cut()`) that assume `ff ≈ 0.01`, so bumping higher misaligns the cell cutters with the screen-region recess. The "App layout in mm > ~5 mm leaves a cell floor" case still recurs at extreme offsets and needs a SCAD-side fix. Order matters — a preset that pins `fudge=0.01` would clobber a `-D` placed before `-p`.
- Single-threaded WASM. Manifold renders are usually < 1 s so this hasn't been a problem.

## History

- `results.md` — original 2026-05-12 feasibility-verdict snapshot. Kept as a historical record of the decision to proceed.

## License

Released to the public domain under [CC0 1.0](LICENSE), matching the upstream keyguard designer.
