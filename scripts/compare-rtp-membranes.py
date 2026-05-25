#!/usr/bin/env python3
# compare-rtp-membranes.py - detect Manifold membranes across the ready-to-print
# corpus by diffing the web app's Manifold export stats against the same-version
# CGAL golden.
#
# The TC57 "membrane" defect: Manifold leaves a thin floor/wall inside a cavity
# that CGAL (the exact reference) does not. That ADDS surface area (the membrane's
# faces) and can change the part count (a membrane fuses parts, or seals a hole).
# So the signature is: app surface-area noticeably ABOVE the CGAL golden, and/or a
# part-count mismatch. A clean design matches the golden within tessellation noise
# (Manifold and CGAL triangulate differently, so small +/- deltas are normal).
#
# Inputs:
#   - CGAL golden:  <RTP>/golden-stl/golden-rtp-cgal-stats.json   (from build-rtp-cgal-golden.py --merge)
#   - app Manifold: <repo>/output/ready-to-print/results/*.json   (from tests/ready-to-print.spec.mjs)
# Output:
#   - console summary (crash list, membrane suspects, clean count)
#   - <repo>/output/ready-to-print/membrane-comparison.csv
#
# Usage:  python scripts/compare-rtp-membranes.py [--area-threshold 2.0]
#   env:  KEYGUARD_RTP_ROOT   RTP assets folder (holds golden-stl/)

import os, sys, json, glob, csv

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = os.path.join(REPO, "output", "ready-to-print", "results")
OUT_CSV = os.path.join(REPO, "output", "ready-to-print", "membrane-comparison.csv")

RTP = os.environ.get("KEYGUARD_RTP_ROOT", "")
if not RTP:
    # fall back to the .scad project's tests/rtp (sibling of this repo)
    RTP = os.path.normpath(os.path.join(REPO, "..", "My SCAD files", "keyguard designer", "tests", "rtp"))
GOLDEN = os.path.join(RTP, "golden-stl", "golden-rtp-cgal-stats.json")

AREA_THRESH = 2.0
if "--area-threshold" in sys.argv:
    AREA_THRESH = float(sys.argv[sys.argv.index("--area-threshold") + 1])

if not os.path.isfile(GOLDEN):
    sys.exit(f"CGAL golden not found: {GOLDEN}\nSet KEYGUARD_RTP_ROOT to the .scad project's tests/rtp folder.")
if not os.path.isdir(RESULTS):
    sys.exit(f"App Manifold results not found: {RESULTS}\nRun tests/ready-to-print.spec.mjs first.")

golden = json.load(open(GOLDEN, encoding="utf-8")).get("configs", {})

rows = []
app_presets = set()
for f in sorted(glob.glob(os.path.join(RESULTS, "*.json"))):
    try:
        r = json.load(open(f, encoding="utf-8"))
    except Exception:
        continue
    preset = r.get("preset")
    st = r.get("stats") or {}
    if not preset or "surface_area_mm2" not in st:
        continue
    app_presets.add(preset)
    g = golden.get(preset)
    if not g:
        rows.append({"preset": preset, "tablet": r.get("tablet", ""), "flag": "NO-GOLDEN",
                     "app_area": st.get("surface_area_mm2"), "cgal_area": None, "area_pct": None,
                     "app_vol": st.get("volume_mm3"), "cgal_vol": None, "vol_pct": None,
                     "app_parts": st.get("parts"), "cgal_parts": None})
        continue
    aa, ga = st["surface_area_mm2"], g["surface_area_mm2"]
    av, gv = st.get("volume_mm3"), g.get("volume_mm3")
    ap, gp = st.get("parts"), g.get("parts")
    area_pct = (aa - ga) / ga * 100 if ga else 0.0
    vol_pct = (av - gv) / gv * 100 if gv else 0.0
    flags = []
    if area_pct >= AREA_THRESH:
        flags.append("MEMBRANE?")
    if ap is not None and gp is not None and ap != gp:
        flags.append("PART-SPLIT")
    rows.append({"preset": preset, "tablet": r.get("tablet", ""), "flag": "+".join(flags),
                 "app_area": round(aa, 2), "cgal_area": round(ga, 2), "area_pct": round(area_pct, 2),
                 "app_vol": round(av, 2) if av else None, "cgal_vol": round(gv, 2) if gv else None,
                 "vol_pct": round(vol_pct, 2),
                 "app_parts": ap, "cgal_parts": gp})

# designs that are in the golden but produced no Manifold result = export crashes
crashed = sorted(set(golden.keys()) - app_presets)

# write CSV
os.makedirs(os.path.dirname(OUT_CSV), exist_ok=True)
cols = ["preset", "tablet", "flag", "area_pct", "app_area", "cgal_area",
        "vol_pct", "app_vol", "cgal_vol", "app_parts", "cgal_parts"]
with open(OUT_CSV, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=cols)
    w.writeheader()
    for r in sorted(rows, key=lambda x: (x["area_pct"] is None, -(x["area_pct"] or 0))):
        w.writerow({k: r.get(k) for k in cols})

suspects = [r for r in rows if r["flag"] and r["flag"] != "NO-GOLDEN"]
no_golden = [r for r in rows if r["flag"] == "NO-GOLDEN"]
clean = [r for r in rows if not r["flag"]]

print(f"RTP Manifold-vs-CGAL membrane comparison")
print(f"  golden : {GOLDEN}  ({len(golden)} configs)")
print(f"  results: {RESULTS}  ({len(rows)} designs)")
print(f"  area threshold for MEMBRANE? flag: +{AREA_THRESH}%\n")

print(f"EXPORT CRASHED (in golden, no Manifold result - clinician CANNOT export): {len(crashed)}")
for p in crashed:
    print(f"   - {p}")

print(f"\nMEMBRANE / PART-SPLIT SUSPECTS: {len(suspects)}")
print(f"   {'preset':52} {'area%':>7} {'vol%':>7}  parts(app/cgal)  flag")
for r in sorted(suspects, key=lambda x: -(x["area_pct"] or 0)):
    print(f"   {r['preset']:52} {r['area_pct']:>7} {r['vol_pct']:>7}  {str(r['app_parts'])+'/'+str(r['cgal_parts']):>14}  {r['flag']}")

if no_golden:
    print(f"\nNO MATCHING GOLDEN (unexpected): {len(no_golden)}")
    for r in no_golden: print(f"   - {r['preset']}")

print(f"\nCLEAN (within tolerance): {len(clean)}")
print(f"\n-> {OUT_CSV}")
