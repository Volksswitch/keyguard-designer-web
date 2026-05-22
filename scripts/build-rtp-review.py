#!/usr/bin/env python3
# build-rtp-review.py — assemble the ready-to-print render outputs into
# per-tablet review PDFs (one design per page: top-down PNG + caption) and a
# golden-comparison summary CSV.
#
# Reads:  output/ready-to-print/results/*.json   (one per design, from
#         tests/ready-to-print.spec.mjs) and the PNGs they reference.
# Writes: output/ready-to-print/<tablet>-review.pdf   (per tablet)
#         output/ready-to-print/golden-comparison.csv (all designs)
#
# Tolerant of partial results — safe to run mid-render to spot-check.
# Requires: pip install fpdf2
# Usage:  python scripts/build-rtp-review.py [output/ready-to-print]

import os, sys, re, json, glob, csv
from fpdf import FPDF

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "output", "ready-to-print")
RES = os.path.join(OUT, "results")

def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', s)]

results = []
for p in glob.glob(os.path.join(RES, "*.json")):
    try: results.append(json.load(open(p, encoding="utf-8")))
    except Exception as e: print(f"  skip {p}: {e}")
if not results:
    print(f"No results in {RES} yet."); sys.exit(0)

# group by tablet, order by (case, preset) natural
bytab = {}
for r in results: bytab.setdefault(r["tablet"], []).append(r)
for t in bytab: bytab[t].sort(key=lambda r: (natkey(r["caseName"]), natkey(r["preset"])))

def cap(v, n=70):
    s = str(v); return s if len(s) <= n else s[:n-1] + "..."

for tablet, designs in bytab.items():
    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(False)
    W, H = 297, 210
    for d in designs:
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_xy(10, 8); pdf.cell(W-20, 7, cap(d["preset"], 90))
        # image (top-down PNG), fit to ~250mm wide centered
        png = os.path.join(OUT, d["png"]) if "png" in d else None
        if png and os.path.isfile(png):
            iw = 250
            pdf.image(png, x=(W-iw)/2, y=18, w=iw)
        # caption block at bottom
        s = d.get("stats", {}); gd = d.get("goldenDelta"); am = d.get("admesh")
        bb = s.get("bbox", [0]*6)
        lines = [
            f"OA:      {cap(d.get('oa',''), 110)}",
            f"Mounting: {d.get('mounting','')}    Golden: {cap(d.get('goldenStem','(none)'),60)}",
            f"Stats:   parts={s.get('parts')}  facets={s.get('facets')}  vol={s.get('volume_mm3')}  "
            f"bbox=[{bb[0]:.1f},{bb[1]:.1f},{bb[2]:.1f} .. {bb[3]:.1f},{bb[4]:.1f},{bb[5]:.1f}]",
        ]
        if am: lines.append(f"admesh:  disconnected={am.get('disconnected')}  parts={am.get('parts')}")
        if gd: lines.append(f"vs golden: dVol={gd.get('volPct')}%  dArea={gd.get('areaPct')}%  parts={gd.get('parts')}")
        else:  lines.append("vs golden: (no golden match)")
        pdf.set_font("Courier", "", 9)
        pdf.set_xy(10, 165)
        for ln in lines:
            pdf.set_x(10); pdf.cell(W-20, 5, cap(ln, 150)); pdf.ln(5)
    dest = os.path.join(OUT, f"{tablet.replace(' ','_').replace(',','_')}-review.pdf")
    pdf.output(dest)
    print(f"  {tablet:16} {len(designs):3} pages -> {os.path.basename(dest)}")

# golden comparison CSV (flag notable deltas)
cmp_path = os.path.join(OUT, "golden-comparison.csv")
with open(cmp_path, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["preset","golden_stem","dVol%","dArea%","parts(web/golden)","admesh_disconnected","flag"])
    flagged = 0
    for r in sorted(results, key=lambda r:(natkey(r["tablet"]),natkey(r["caseName"]),natkey(r["preset"]))):
        gd = r.get("goldenDelta"); am = r.get("admesh") or {}
        if not gd:
            w.writerow([r["preset"], "(none)", "", "", r.get("stats",{}).get("parts"), am.get("disconnected"), "NO GOLDEN"]); continue
        # The website goldens were generated from a keyguard.scad that is 6+
        # months / several releases old, so moderate vol/area deltas are
        # EXPECTED version drift, not defects. Only flag signals that survive
        # that drift: a part-count change (topology), a non-manifold mesh, or a
        # gross (>50%) size divergence that points at a wrong assembly rather
        # than incremental .scad evolution.
        wp, gp = (gd.get("parts","/").split("/") + ["",""])[:2]
        flag = []
        if abs(gd.get("volPct") or 0) > 50: flag.append("vol>50%")
        if abs(gd.get("areaPct") or 0) > 50: flag.append("area>50%")
        if wp != gp: flag.append("parts")
        if am.get("disconnected"): flag.append("nonmanifold")
        if flag: flagged += 1
        w.writerow([r["preset"], gd.get("stem"), gd.get("volPct"), gd.get("areaPct"), gd.get("parts"),
                    am.get("disconnected"), ",".join(flag)])
print(f"\n{len(results)} designs processed; golden-comparison.csv written ({flagged} flagged).")
