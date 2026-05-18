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
| **Silhouette IoU** | Yes (`IOU_MIN`, default 0.95) | Otsu foreground-mask overlap. Colour/shading-blind. Catches missing/shifted/rotated/scaled geometry and wrong cutout layout. |
| **Overlay placement** | Yes (when keyed on **both** sides) | Colour-keyed pink/`#` overlay bbox centre + size delta. Flags a mis-placed split line / `#` highlight. "One side only" is **info**, never a flag (the two renderers' overlay colours differ too much for one-sided absence to be reliable). |
| **Edge-structure IoU** | No (informational) | Canny-edge overlap on normalised grayscale; a human-readable second opinion on internal structure. |

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
IOU_MIN=0.90 ./scripts/compare-cross.sh          # only gross drift
```

Exit 0 = nothing flagged; exit 1 = at least one structural flag.
