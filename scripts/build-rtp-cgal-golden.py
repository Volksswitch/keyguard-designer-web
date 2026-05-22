#!/usr/bin/env python3
# build-rtp-cgal-golden.py — render each ready-to-print design with the CURRENT
# keyguard.scad via native OpenSCAD (CGAL backend) to produce a trustworthy,
# same-version reference for membrane detection.
#
# Why: the website golden STLs are 6+ months / several releases old, so they
# can't isolate Manifold defects from version drift. Rendering the SAME .scad
# the web app uses, but with the CGAL backend, gives an apples-to-apples
# reference. Comparing the app's Manifold export against this (surface-area up
# and/or a part-count split = the TC57 membrane signature) tells us whether the
# app's fudge=0.05 workaround holds across the whole corpus.
#
# Mirrors the export render exactly: -D fudge=0.05 -D ff=0.05
# -D include_screenshot="no", preset via -p/-P, OA swapped into the .scad's
# own openings_and_additions.txt (which it include<>s).
#
# Reads:  <RTP_ROOT>/keyguard.scad, keyguard.json, preset-to-golden-mapping.csv,
#         Cases and App Specifics/<resolved_OA>
# Writes: <RTP_ROOT>/golden-stl/golden-rtp-cgal-stats.json   (incremental)
#         <RTP_ROOT>/rtp-cgal-progress.log                    (tail -f)
#         <RTP_ROOT>/golden-stl/cgal/<safe-preset>.stl        (with --keep-stls)
#
# Usage:  python scripts/build-rtp-cgal-golden.py <RTP_ROOT> [--keep-stls] [--filter SUBSTR]
#   env:  KEYGUARD_RTP_TIMEOUT (per-render seconds, default 1800)

import os, sys, re, csv, json, time, shutil, tempfile, subprocess

RTP = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else \
      os.environ.get("KEYGUARD_RTP_ROOT", "")
KEEP = "--keep-stls" in sys.argv
FILT = ""
if "--filter" in sys.argv: FILT = sys.argv[sys.argv.index("--filter")+1]
PRESETS = None
if "--presets-file" in sys.argv:
    pf = sys.argv[sys.argv.index("--presets-file")+1]
    PRESETS = set(l.strip() for l in open(pf, encoding="utf-8") if l.strip())
TIMEOUT = int(os.environ.get("KEYGUARD_RTP_TIMEOUT", "1800"))

if not RTP or not os.path.isdir(RTP):
    sys.exit("usage: build-rtp-cgal-golden.py <RTP_ROOT> [--keep-stls] [--filter S]")

SCAD = os.path.join(RTP, "keyguard.scad")
JSON = os.path.join(RTP, "keyguard.json")
OA_LIVE = os.path.join(RTP, "openings_and_additions.txt")   # the file the .scad include<>s
CASES = os.path.join(RTP, "Cases and App Specifics")
MAP = os.path.join(RTP, "preset-to-golden-mapping.csv")
GDIR = os.path.join(RTP, "golden-stl")
STATS_OUT = os.path.join(GDIR, "golden-rtp-cgal-stats.json")
PROG = os.path.join(RTP, "rtp-cgal-progress.log")
KEEP_DIR = os.path.join(GDIR, "cgal")

# stats fn from the .scad project (same formula both sides)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                "..", "My SCAD files", "keyguard designer", "scripts"))
try:
    from compute_stl_stats import compute_stats
except Exception:
    # fallback: search a couple of known relative spots
    for cand in [r"C:/Users/ken/OneDrive/4 T-Z/Volksswitch/Keyguard/My SCAD files/keyguard designer/scripts"]:
        if os.path.isfile(os.path.join(cand, "compute_stl_stats.py")):
            sys.path.insert(0, cand); break
    from compute_stl_stats import compute_stats

def find_openscad():
    for p in [r"C:\Program Files\OpenSCAD\openscad.com",
              r"C:\Program Files\OpenSCAD\openscad.exe",
              "/c/Program Files/OpenSCAD/openscad.com",
              "/mnt/c/Program Files/OpenSCAD/openscad.com"]:
        if os.path.isfile(p): return p
    found = shutil.which("openscad")
    if found: return found
    sys.exit("OpenSCAD not found")
OPENSCAD = find_openscad()

designs = []
for r in csv.DictReader(open(MAP, encoding="utf-8")):
    if not r.get("preset"): continue
    if FILT and FILT not in r["preset"]: continue
    if PRESETS is not None and r["preset"] not in PRESETS: continue
    designs.append((r["preset"], r["resolved_OA"]))

if KEEP: os.makedirs(KEEP_DIR, exist_ok=True)
os.makedirs(GDIR, exist_ok=True)
safe = lambda s: re.sub(r'[^\w.,()+-]+', '_', s)

saved_oa = OA_LIVE + ".rtpsave"
if os.path.isfile(OA_LIVE): shutil.copy2(OA_LIVE, saved_oa)
open(PROG, "w").close()

results = {}
total = len(designs); ok = fail = nonman = 0
t0 = time.time()
print(f"OpenSCAD: {OPENSCAD}\nDesigns: {total}  timeout: {TIMEOUT}s  keep-stls: {KEEP}")
try:
    for i, (preset, oa_rel) in enumerate(designs, 1):
        oa_src = os.path.join(CASES, oa_rel.replace("\\", os.sep))
        if not os.path.isfile(oa_src):
            line = f"[{i:3}/{total}] {preset:55} OA MISSING: {oa_rel}"
            print(line); open(PROG,"a").write(line+"\n"); fail += 1; continue
        shutil.copy2(oa_src, OA_LIVE)
        out = os.path.join(tempfile.gettempdir(), f"rtpcgal_{safe(preset)}.stl")
        args = [OPENSCAD, "-p", JSON, "-P", preset,
                "-D", "fudge=0.05", "-D", "ff=0.05", "-D", 'include_screenshot="no"',
                "-o", out, SCAD]
        ts = time.time()
        try:
            cp = subprocess.run(args, capture_output=True, text=True, timeout=TIMEOUT)
            rc = cp.returncode; console = (cp.stdout or "") + "\n" + (cp.stderr or "")
        except subprocess.TimeoutExpired:
            rc = 124; console = ""
        dt = time.time() - ts
        if rc != 0 or not (os.path.isfile(out) and os.path.getsize(out) > 0):
            line = f"[{i:3}/{total}] {preset:55} RENDER FAILED ({dt:.0f}s, rc={rc})"
            print(line); open(PROG,"a").write(line+"\n"); fail += 1
            if os.path.isfile(out): os.remove(out)
            continue
        m = re.search(r'Simple:\s*(yes|no)', console)
        simple = m.group(1) if m else "unknown"
        try:
            st = compute_stats(out)
        except Exception as e:
            line = f"[{i:3}/{total}] {preset:55} STATS FAILED ({e})"
            print(line); open(PROG,"a").write(line+"\n"); fail += 1; os.remove(out); continue
        st["simple"] = simple; st["oa"] = oa_rel
        results[preset] = st
        if KEEP: shutil.copy2(out, os.path.join(KEEP_DIR, safe(preset) + ".stl"))
        os.remove(out)
        if simple == "no": nonman += 1
        ok += 1
        tag = "NON-MANIFOLD" if simple == "no" else "OK"
        line = (f"[{i:3}/{total}] {preset:55} {tag} ({dt:.0f}s)  "
                f"parts={st['parts']} area={st['surface_area_mm2']} vol={st['volume_mm3']}")
        print(line); open(PROG,"a").write(line+"\n")
        json.dump({"meta":{"source":"current keyguard.scad via native OpenSCAD/CGAL",
                           "openscad":OPENSCAD,"flags":"fudge=0.05 ff=0.05 include_screenshot=no"},
                   "configs":results}, open(STATS_OUT,"w",encoding="utf-8"), indent=1)
finally:
    if os.path.isfile(saved_oa): shutil.move(saved_oa, OA_LIVE)

el = time.time() - t0
print(f"\nDONE: {ok} ok ({nonman} non-manifold), {fail} failed, of {total} in {el/60:.1f} min")
print("->", STATS_OUT)
