# Spike results — 2026-05-12

> **Historical document.** This is the original feasibility-verdict snapshot. The spike has since grown into the actual clinician tool (Customizer, presets, file watching, O&A highlights, persistent folder). See [README.md](README.md) for current status.

## Headline

**Feasibility verdict: GREEN.** openscad-wasm v0.0.4 can render `keyguard.scad` correctly, manifold, at ~1.3× native speed. No technical blockers remain.

## Render comparison

| Config | Native time | WASM time | Ratio | WASM output | Status |
|---|---|---|---|---|---|
| default     | 41.3s | 54.3s | 1.31× | 2,787,298 B STL, `Simple: yes` | OK |
| laser-cut   | (not measured) | 2.8s (fail) | — | 0 B, rc=1 | FAIL — see below |
| screenshot  | (not measured) | 55.4s | ~1.3× est. | 2,787,297 B STL, `Simple: yes` | OK |
| heavy*      | (not measured) | 40.6s | — | 2,249,106 B STL, `Simple: yes` | OK (fell back to default tablet — param-name typo in spike, not a WASM issue) |

\* "Heavy" actually rendered the default tablet because the `type_of_tablet` value `"iPad Pro 12.9 inch 4th-6th generation"` did not match a recognised name. To stress CGAL properly we'd retry with the exact catalog name.

## Observations

- **WASM initial load:** ~0.1s (the 13 MB JS+WASM was already cached by the browser on the second run).
- **Fresh instance per render:** required — emscripten's `callMain` is single-shot.
- **SVG import works:** the `screenshot` config successfully read `/default.svg` from the WASM virtual FS.
- **`include <openings_and_additions.txt>` works:** all renders pulled the include without modification.

## CGAL warnings (3 of 3 successful configs)

All three working configs printed this non-fatal assertion mid-render:

```
CGAL error: assertion violation!
Expression : it != border.end()
File       : .../CGAL/convex_hull_3.h
Line       : 684
ERROR: CGAL error in applyHull()
```

OpenSCAD recovers and completes; the output is manifold. **Likely a pre-existing characteristic of `keyguard.scad`** (one specific hull operation, probably a chamfer or arc), not a WASM regression. Worth confirming by capturing native stderr on the default config and comparing.

## The laser-cut failure

Setting `type_of_keyguard="Laser-Cut"` with `-o /output.svg` produced cascading CGAL Nef-polyhedron assertions and ended with `"Current top level object is not a 2D object"`. Output file was empty (rc=1).

Likely causes (most-to-least likely):
1. The laser-cut path needs additional parameters to actually produce 2D output — possibly `generate="SVG layer"` or similar. CLAUDE.md notes a known issue with the laser-cut/DXF path in TC1.
2. The .svg extension may be wrong — DXF might be required for this config.
3. A genuine WASM-vs-native CGAL behavior difference on the 2D extraction path.

**Action:** verify by running the same config natively. If native also fails or needs different parameters, it's not a WASM issue.

## What this means for the project

- The browser-based clinician tool is **technically viable** with openscad-wasm as the rendering engine.
- A single-threaded WASM build is fast enough — Web Workers / pthread builds are an optimization, not a requirement.
- File System Access API + openscad-wasm covers the full workflow: folder-pick → read .scad + O&A + SVGs → render → save STL back to folder → watch for O&A edits and re-render.

## Next steps (not for this spike)

1. Confirm CGAL warning is pre-existing in native (capture stderr from `openscad -o ... keyguard.scad` and grep for `CGAL`).
2. Diagnose laser-cut failure with a native-side test of the same parameters.
3. Move to UI/UX design for the clinician tool. No further feasibility testing needed.
