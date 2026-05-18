# Cross-project structural comparison

`scripts/compare-cross.sh` compares this project's visual references
(`tests/visual.spec.mjs-snapshots/<case>/stepN_expected.png`) against the
`.scad` project's references (`<scad>/tests/cases/visual.snapshots/<case>/stepN_expected.png`)
at matching relative paths.

Both projects render the same model at the same size (2048×1536) and the
same camera, so matching steps are pixel-registered. The tool ignores
colour, background, lighting and anti-aliasing and looks for **structural**
drift:

| Signal | Gated? | Meaning |
|---|---|---|
| **Silhouette IoU** | **Yes** (`IOU_MIN`, default **0.90**) | Otsu foreground-mask overlap. Colour/shading-blind. Catches missing/shifted/rotated/scaled geometry and wrong cutout layout. Tuned against a full 60-case run: IoU ≤ ~0.89 = genuine significant difference; ≥ ~0.93 = cross-renderer framing/shading variance only. |
| **Overlay placement** | No (informational) | Colour-keyed pink/`#` overlay bbox delta, printed with `[info]` (and `⚠large` past `SPLIT_*_MAX`). NOT gated: it false-positives when the web colours a solid feature pink while OpenSCAD's Tomorrow scheme colours it another hue (e.g. blue), or on small scattered `#` marks. Useful as a human hint, not a verdict. |
| **Edge-structure IoU** | No (informational) | Canny-edge overlap on normalised grayscale; a triage hint for the 0.90–0.95 band. |

It is a **structural drift detector, not an equivalence test**: the two
renderers genuinely differ, so a perfect-geometry pair never scores zero.
Flagged steps get a side-by-side composite in `output/cross-compare/` for
human review.

## How to invoke (the trigger phrase)

Say **“compare the web and .scad renders”** (or an obvious variant —
“cross-check the renders”, “run the cross comparison”, “compare the visual
captures”). That authorises a run of `scripts/compare-cross.sh`.

- Whole suite: just the phrase.
- One/few cases: add them, e.g. *“compare the web and .scad renders for Test Case 56”*.
- Stricter/looser “significant” bar: the gate is `IOU_MIN` (env-overridable);
  raise it to be pickier, lower it to only catch gross drift.

```bash
./scripts/compare-cross.sh                       # every parallel case
./scripts/compare-cross.sh "Test Case 56"        # one case
IOU_MIN=0.95 ./scripts/compare-cross.sh          # pickier than the 0.90 default
IOU_MIN=0.85 ./scripts/compare-cross.sh          # only gross drift
```

Exit 0 = nothing flagged; exit 1 = at least one structural flag.
