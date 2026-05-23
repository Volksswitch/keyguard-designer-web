#!/usr/bin/env python3
# generate-membrane-review.py - produce a human-facing manual-review report from
# the Manifold-vs-CGAL comparison: which ready-to-print designs need a manual STL
# check (export crashes + membrane suspects, tiered), a pattern breakdown, and a
# few "passed" designs to spot-check as controls.
#
# Reads:  <RTP>/golden-stl/golden-rtp-cgal-stats.json
#         <repo>/output/ready-to-print/results/*.json
# Writes: <repo>/output/ready-to-print/MEMBRANE-REVIEW.md

import os, sys, json, glob, re
from collections import Counter

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = os.path.join(REPO, "output", "ready-to-print", "results")
OUT = os.path.join(REPO, "output", "ready-to-print", "MEMBRANE-REVIEW.md")
RTP = os.environ.get("KEYGUARD_RTP_ROOT") or os.path.join(
    os.path.expanduser("~"), "OneDrive", "Desktop", "web app", "Web-App-Test")
GOLDEN = os.path.join(RTP, "golden-stl", "golden-rtp-cgal-stats.json")

AREA_THRESH = 2.0
golden = json.load(open(GOLDEN, encoding="utf-8")).get("configs", {})

results = {}
for f in sorted(glob.glob(os.path.join(RESULTS, "*.json"))):
    try: r = json.load(open(f, encoding="utf-8"))
    except Exception: continue
    if r.get("preset") and (r.get("stats") or {}).get("surface_area_mm2") is not None:
        results[r["preset"]] = r

def layout_of(preset, case):
    # preset = "iPad X - Case - Layout..."; strip "tablet - case - "
    parts = preset.split(" - ")
    return " - ".join(parts[2:]) if len(parts) >= 3 else preset
def family_of(layout):
    s = layout
    s = re.sub(r"\b(QC|WP|SC|MP)?\s*\d+(\s*x\s*\d+)?\b", "", s)        # drop sizes/counts
    s = re.sub(r"\b(lg wnd|merged|max rails)\b", "", s, flags=re.I)
    s = re.sub(r"[-_]VI\b", "", s)
    return re.sub(r"\s+", " ", s).strip(" -") or layout

rows = []
for preset, r in results.items():
    g = golden.get(preset)
    if not g: continue
    st = r["stats"]
    aa, ga = st["surface_area_mm2"], g["surface_area_mm2"]
    ap, gp = st.get("parts"), g.get("parts")
    area_pct = (aa - ga) / ga * 100 if ga else 0.0
    flags = []
    if area_pct >= AREA_THRESH: flags.append("area")
    if ap is not None and gp is not None and ap != gp: flags.append("parts")
    rows.append({"preset": preset, "tablet": r.get("tablet", ""), "case": r.get("caseName", ""),
                 "layout": layout_of(preset, r.get("caseName", "")),
                 "area_pct": area_pct, "app_parts": ap, "cgal_parts": gp,
                 "cgal_facets": g.get("facets", 0), "stl": r.get("stl", "").replace("\\", "/"), "flags": flags})

crashed = sorted(set(golden.keys()) - set(results.keys()))
suspects = [x for x in rows if x["flags"]]
clean = [x for x in rows if not x["flags"]]

def tier(a):
    if a >= 50: return "SEVERE"
    if a >= 10: return "MODERATE"
    return "MARGINAL"
for s in suspects:
    s["tier"] = "SEVERE" if ("parts" in s["flags"] and s["app_parts"] != s["cgal_parts"] and s["area_pct"] >= 50) else tier(s["area_pct"])

# spot-check controls: clean, near-zero area, matching parts, prefer complex + tablet spread
ctrl_pool = sorted([c for c in clean if abs(c["area_pct"]) < 1.5 and c["app_parts"] == c["cgal_parts"]],
                   key=lambda c: -c["cgal_facets"])
controls, seen_tab = [], set()
for c in ctrl_pool:
    if c["tablet"] not in seen_tab:
        controls.append(c); seen_tab.add(c["tablet"])
    if len(controls) >= 3: break
for c in ctrl_pool:
    if c not in controls: controls.append(c); break   # one extra, most complex overall

L = []
w = L.append
w("# Ready-to-Print — Manifold Membrane Review")
w("")
w("_Manual-review worklist generated from the web app's Manifold STL exports compared against the "
  "same-version native **CGAL** golden (`golden-rtp-cgal-stats.json`)._")
w("")
w("**How to read this:** a Manifold *membrane* is a thin internal wall/floor the browser export "
  "leaves that the exact CGAL render does not. Its signature is **surface area well above the CGAL "
  "golden with volume essentially unchanged**, often with a **part-count split**. To review a design, "
  "open its exported STL (path given) in a slicer and look for skins across cell openings / inside "
  "cavities.")
w("")
w(f"- Designs compared: **{len(rows)}**")
w(f"- Export crashed (no STL at all): **{len(crashed)}**")
w(f"- Membrane suspects to review: **{len(suspects)}**  "
  f"(SEVERE {sum(1 for s in suspects if s['tier']=='SEVERE')}, "
  f"MODERATE {sum(1 for s in suspects if s['tier']=='MODERATE')}, "
  f"MARGINAL {sum(1 for s in suspects if s['tier']=='MARGINAL')})")
w(f"- Passed (within tolerance): **{len(clean)}**")
w(f"- Area threshold for flagging: **+{AREA_THRESH}%**")
w("")
w("---")
w("## A. Cannot export — highest priority (clinician gets no file)")
w("")
w("These crash the browser export (`memory access out of bounds`). A clinician cannot produce an "
  "STL at all, so they need attention regardless of membranes.")
w("")
for p in crashed:
    w(f"- `{p}`")
w("")
w("---")
w("## B. Membrane suspects — manual STL review")
w("")
w("Sorted worst-first within each tier. `parts` = app / CGAL. Open the STL and confirm.")
for t in ("SEVERE", "MODERATE", "MARGINAL"):
    grp = sorted([s for s in suspects if s["tier"] == t], key=lambda s: -s["area_pct"])
    if not grp: continue
    w("")
    w(f"### {t} ({len(grp)})")
    w("")
    w("| Design | area Δ | parts (app/cgal) | STL to open |")
    w("|---|---:|:--:|---|")
    for s in grp:
        w(f"| {s['preset']} | +{s['area_pct']:.0f}% | {s['app_parts']}/{s['cgal_parts']} | "
          f"`output/ready-to-print/{s['stl']}` |")
w("")
w("---")
w("## C. Pattern breakdown (where the suspects cluster)")
w("")
def tally(key, label):
    c = Counter(s[key] for s in suspects)
    tot = Counter(r[key] for r in rows)
    w(f"**By {label}:**")
    w("")
    for k, n in c.most_common():
        w(f"- {k or '(none)'}: {n} of {tot[k]} flagged")
    w("")
tally("tablet", "tablet")
w("**By layout family:**")
w("")
fam = Counter(family_of(s["layout"]) for s in suspects)
famtot = Counter(family_of(r["layout"]) for r in rows)
for k, n in fam.most_common():
    w(f"- {k}: {n} of {famtot[k]} flagged")
w("")
w("---")
w("## D. Spot-check these *passed* designs too (controls)")
w("")
w("A few designs the comparison rated **clean** (area ≈ CGAL, parts match). Open these as well to "
  "confirm the check isn't reporting false-passes — they span tablets and include complex layouts.")
w("")
w("| Design | area Δ | parts | CGAL facets | STL to open |")
w("|---|---:|:--:|---:|---|")
for c in controls:
    w(f"| {c['preset']} | {c['area_pct']:+.1f}% | {c['app_parts']} | {c['cgal_facets']} | "
      f"`output/ready-to-print/{c['stl']}` |")
w("")
w("---")
w(f"_Full per-design data: `output/ready-to-print/membrane-comparison.csv`._")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w", encoding="utf-8").write("\n".join(L) + "\n")
print(f"wrote {OUT}")
print(f"  crashes={len(crashed)} suspects={len(suspects)} clean={len(clean)} controls={len(controls)}")
