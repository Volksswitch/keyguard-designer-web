# Keyguard Browser Spike

Browser-based clinician tool that wraps `keyguard.scad` so AAC clinicians on locked-down laptops (no install rights for OpenSCAD) can still design keyguards. Runs entirely in Chrome / Edge via [openscad-wasm](https://github.com/DSchroer/openscad-wasm) + Three.js.

## What's here

```
keyguard-browser-spike/
├── app.html                ← the spike UI (the only thing the user opens)
├── serve.bat               ← starts a local web server (needs Python on PATH)
├── openscad-wasm/          ← openscad-wasm v0.0.4 (monolithic; wasm embedded in openscad.js)
│   ├── openscad.js
│   └── openscad.fonts.js   ← Liberation Sans + fontconfig, written into the virtual FS
├── vendor/three/           ← Three.js r170 (module + STLLoader + OrbitControls)
├── keyguard design/        ← the .scad project loaded by the spike (.scad + .json + O&A txt)
└── outputs/                ← reserved for future "save into folder" feature
```

The old `index.html`, `mockup.html`, `backend-test.html`, and `inputs/` directory are early-prototype leftovers and not used by the current app.

## How to run

1. Double-click `serve.bat` (or run `python -m http.server 8000` in this folder).
2. Open <http://localhost:8000/app.html> in **Chrome or Edge** (the File System Access API isn't supported in Firefox/Safari).
3. Click **Open Project…** and pick the `keyguard design` folder. The next time you launch the spike, Open Project will offer to reopen the same folder with a single permission dialog (covers read + write).
4. The viewport renders automatically. Change Customizer parameters or switch presets and the render auto-refreshes (Manifold backend, ~0.5 s per render).
5. **Export** writes a fresh render in the chosen format (STL / SVG) to your Downloads folder — independent of the viewport render, so highlight overlays never end up in the exported file.

## What works today

- **Customizer pane** generated automatically from `keyguard.scad`'s top-of-file declarations. Dropdowns, range sliders, plain numbers, strings, vectors.
- **Preset management** — Save / Add (+) / Delete (−). Matches OpenSCAD's on-disk JSON format. Settings → Preset list order = Alphabetical / Creation.
- **Auto-watch** `openings_and_additions.txt` — edit the file in your usual editor and the viewport re-renders within ~1.5 s.
- **O&A highlight overlays** — any row whose ID is `"#"` shows as a pink translucent ghost over the keyguard. Also covers Customizer-driven embossed/engraved text — useful for spotting engraved text that landed inside a cell.
- **Persistent last-opened folder** stored in IndexedDB; one permission prompt and you're back in.

## Implementation notes for future work

- The viewport does **two STL renders per refresh**: one for the keyguard, one for the highlight overlays (driven by the `only_oa_highlights="yes"` flag in keyguard.scad). 3MF with `color()` would be one render, but no off-the-shelf openscad-wasm has lib3mf compiled in — even the 2025.03.25 playground build returns "Export to 3MF format was not enabled".
- Each render needs a fresh wasm instance because the `createOpenSCAD` wrapper's `callMain` triggers `exitJS()` at the end, tearing down the runtime.
- WASM-only workaround: doRender() injects `-D fudge=0.05 -D ff=0.05` AFTER the `-p/-P` preset switch. Manifold's precision floor treats 0.01 mm through-cuts as exact-coincident and leaves a thin floor on every cell. The order matters — a preset that pins `fudge=0.01` would clobber a `-D` placed before `-p`.
- Single-threaded WASM. Manifold renders are usually < 1 s so this hasn't been a problem.

## Out of scope for the spike

- PNG export (entry still in the dropdown but emits "not implemented yet").
- Rendering the `default.svg` screenshot under the keyguard in the viewport.
- Deployment / distribution to clinician laptops (hosted URL? PWA? single-file bundle?). Deferred until features are stable.
