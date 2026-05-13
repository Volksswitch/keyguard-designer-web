# Keyguard Browser Spike

Feasibility test: does `keyguard.scad` render correctly and acceptably-fast in `openscad-wasm` v0.0.4 inside a browser?

## What's here

```
keyguard-browser-spike/
├── index.html            ← the spike UI
├── serve.bat             ← starts a local web server (needs Python on PATH)
├── openscad-wasm/        ← openscad-wasm v0.0.4 (WASM is embedded in openscad.js, 13 MB)
├── inputs/               ← copies of keyguard.scad, openings_and_additions.txt, default.svg
├── outputs/              ← (empty) reserved for renders saved out of the browser
└── results.md            ← timings and observations, updated as we test
```

## How to run

1. Double-click `serve.bat` (or run `python -m http.server 8000` in this folder).
2. Open <http://localhost:8000/> in **Chrome or Edge** (not Safari).
3. Click **"1. Load openscad-wasm + input files"** — takes a few seconds; openscad-wasm is 13 MB.
4. Click **"Run all configs sequentially"** (or run each individually).
5. Watch the table at the top and the console log at the bottom. STL/SVG outputs become downloadable links.

## What the four configs test

| Config | Why |
|---|---|
| default | Baseline — most common clinician render |
| laser-cut | 2D output path (SVG instead of STL) |
| screenshot | Exercises SVG **import** via WASM virtual filesystem |
| heavy | Larger CGAL workload (iPad Pro 12.9 with frame + snap-in tabs) |

## What we're looking for

- **Does each config complete with rc=0 and a non-empty output?** Pass/fail.
- **Render time vs native OpenSCAD.** Note timings in `results.md`. Tolerable ≈ ≤ 2× native for typical, ≤ 5× for heavy.
- **Console errors or warnings.** Anything mentioning CGAL, memory, or unresolved files is worth noting.
- **Output equivalence.** Optional: byte-compare downloaded STL against a native render of the same config.

## Known constraints

- WASM is single-threaded in this build; no Web Worker / pthread setup. A render that takes 60s native may take 90–120s here.
- WASM memory is capped at 4 GB by the WebAssembly spec. Very heavy configs may OOM.
- `default.svg` is loaded into the virtual FS at `/default.svg`, matching what the `.scad` expects.

## Cleanup

This whole folder is throwaway. `rm -rf C:\Users\ken\Projects\keyguard-browser-spike` when done.
