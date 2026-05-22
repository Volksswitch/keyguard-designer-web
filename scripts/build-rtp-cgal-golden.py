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
# -D include_screenshot="no", preset via -p/-P. NOTE: extend_through_cuts is
# NOT passed, so this renders gate-OFF (no through-cut extender). That is the
# intended clean geometry — the extender is a CGAL no-op (proven identical Nef
# output) and only matters for Manifold — and it renders ~2.5x faster.
#
# CONCURRENCY-SAFE: each design is rendered in its own private temp working
# directory (a copy of keyguard.scad + the design's OA as
# openings_and_additions.txt). The shared RTP folder is never mutated, so
# multiple machines may run different chunks against the SAME (even OneDrive-
# synced) RTP folder at the same time without clobbering each other.
#
# MULTI-MACHINE (capture is a WRITE job, so chunks write SEPARATE files that
# are merged afterwards):
#   # on machine k of N (each needs the web-app repo + a reachable RTP folder):
#   python scripts/build-rtp-cgal-golden.py --chunk k/N
#       -> writes <RTP>/golden-stl/cgal-chunks/chunk-k-of-N.json   (resumable)
#   # once every chunk is done, on any one machine:
#   python scripts/build-rtp-cgal-golden.py --merge
#       -> merges all chunk-*.json into <RTP>/golden-stl/golden-rtp-cgal-stats.json
#
# Reads:  <RTP_ROOT>/keyguard.scad, keyguard.json, preset-to-golden-mapping.csv,
#         Cases and App Specifics/<resolved_OA>
# Writes: <out>  (default <RTP>/golden-stl/golden-rtp-cgal-stats.json;
#                 with --chunk, <RTP>/golden-stl/cgal-chunks/chunk-k-of-N.json)
#         a sibling .progress.log next to <out>                     (tail -f)
#         <RTP>/golden-stl/cgal/<safe-preset>.stl                  (with --keep-stls)
#
# Usage:  python build-rtp-cgal-golden.py <RTP_ROOT> [options]
#   options:
#     --chunk k/N        render only the k-th of N contiguous slices (1-indexed)
#     --out PATH         write stats to PATH (overrides the default)
#     --merge            merge <RTP>/golden-stl/cgal-chunks/*.json -> golden manifest, then exit
#     --filter SUBSTR    only presets containing SUBSTR
#     --presets-file F   only presets listed in F (one per line)
#     --keep-stls        also keep each CGAL STL under golden-stl/cgal/
#     --force            ignore any existing output file (re-render from scratch)
#   env:
#     KEYGUARD_RTP_ROOT      RTP assets folder (if not given as arg1)
#     KEYGUARD_DESIGNER_ROOT .scad project root (to locate compute_stl_stats.py)
#     KEYGUARD_RTP_TIMEOUT   per-render seconds, default 1800

import os, sys, re, csv, json, time, shutil, tempfile, subprocess

args = sys.argv[1:]

def take_opt(name):
    """Pop '--name value' from args, return value or None."""
    if name in args:
        i = args.index(name)
        val = args[i+1] if i+1 < len(args) else None
        del args[i:i+2]
        return val
    return None

def take_flag(name):
    if name in args:
        args.remove(name)
        return True
    return False

KEEP    = take_flag("--keep-stls")
FORCE   = take_flag("--force")
MERGE   = take_flag("--merge")
CHUNK   = take_opt("--chunk")        # "k/N"
OUT     = take_opt("--out")
FILT    = take_opt("--filter") or ""
PFILE   = take_opt("--presets-file")
PRESETS = None
if PFILE:
    PRESETS = set(l.strip() for l in open(PFILE, encoding="utf-8") if l.strip())

# remaining positional arg = RTP root
pos = [a for a in args if not a.startswith("--")]
RTP = os.path.abspath(pos[0]) if pos else os.environ.get("KEYGUARD_RTP_ROOT", "")
if not RTP or not os.path.isdir(RTP):
    sys.exit("usage: build-rtp-cgal-golden.py <RTP_ROOT> [--chunk k/N] [--out P] "
             "[--merge] [--filter S] [--presets-file F] [--keep-stls] [--force]")

TIMEOUT = int(os.environ.get("KEYGUARD_RTP_TIMEOUT", "1800"))

SCAD     = os.path.join(RTP, "keyguard.scad")
JSON     = os.path.join(RTP, "keyguard.json")
CASES    = os.path.join(RTP, "Cases and App Specifics")
MAP      = os.path.join(RTP, "preset-to-golden-mapping.csv")
GDIR     = os.path.join(RTP, "golden-stl")
CHUNKDIR = os.path.join(GDIR, "cgal-chunks")
GOLDEN   = os.path.join(GDIR, "golden-rtp-cgal-stats.json")
KEEP_DIR = os.path.join(GDIR, "cgal")

# ── chunk parsing ─────────────────────────────────────────────────────────────
chunk_k = chunk_n = None
if CHUNK:
    m = re.match(r'^(\d+)/(\d+)$', CHUNK.strip())
    if not m:
        sys.exit(f"--chunk must look like k/N (got '{CHUNK}')")
    chunk_k, chunk_n = int(m.group(1)), int(m.group(2))
    if not (1 <= chunk_k <= chunk_n):
        sys.exit(f"--chunk k/N requires 1 <= k <= N (got {chunk_k}/{chunk_n})")

# Default output path: a per-chunk file when chunking, else the golden manifest.
if OUT:
    STATS_OUT = os.path.abspath(OUT)
elif chunk_k:
    STATS_OUT = os.path.join(CHUNKDIR, f"chunk-{chunk_k}-of-{chunk_n}.json")
else:
    STATS_OUT = GOLDEN
PROG = STATS_OUT + ".progress.log"

# ── merge mode: combine all chunk files into the golden manifest, then exit ────
def do_merge():
    if not os.path.isdir(CHUNKDIR):
        sys.exit(f"no chunk dir to merge: {CHUNKDIR}")
    files = sorted(f for f in os.listdir(CHUNKDIR) if f.endswith(".json"))
    if not files:
        sys.exit(f"no chunk-*.json files in {CHUNKDIR}")
    merged, sources = {}, []
    for f in files:
        try:
            d = json.load(open(os.path.join(CHUNKDIR, f), encoding="utf-8"))
        except Exception as e:
            print(f"  WARN: skipping unreadable {f}: {e}"); continue
        cfg = d.get("configs", {})
        merged.update(cfg)
        sources.append(f"{f} ({len(cfg)})")
        print(f"  + {f}: {len(cfg)} configs")
    os.makedirs(GDIR, exist_ok=True)
    json.dump({"meta": {"source": "current keyguard.scad via native OpenSCAD/CGAL (merged chunks)",
                        "flags": "fudge=0.05 ff=0.05 include_screenshot=no (gate-off)",
                        "merged_from": sources},
               "configs": merged},
              open(GOLDEN, "w", encoding="utf-8"), indent=1)
    print(f"\nMERGED {len(merged)} configs from {len(files)} chunk file(s) -> {GOLDEN}")

if MERGE:
    do_merge()
    sys.exit(0)

# ── stats fn from the .scad project (same formula both sides) ──────────────────
def add_stats_path():
    cand = []
    env = os.environ.get("KEYGUARD_DESIGNER_ROOT")
    if env:
        cand.append(os.path.join(env, "scripts"))
    cand.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             "..", "My SCAD files", "keyguard designer", "scripts"))
    cand.append(r"C:/Users/ken/OneDrive/4 T-Z/Volksswitch/Keyguard/My SCAD files/keyguard designer/scripts")
    for c in cand:
        if os.path.isfile(os.path.join(c, "compute_stl_stats.py")):
            sys.path.insert(0, c); return
    sys.exit("compute_stl_stats.py not found — set KEYGUARD_DESIGNER_ROOT to the .scad project root")
add_stats_path()
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

if not os.path.isfile(SCAD):
    sys.exit(f"keyguard.scad not found in RTP root: {SCAD}")

# ── design list (sorted for deterministic chunking across machines) ───────────
designs = []
for r in csv.DictReader(open(MAP, encoding="utf-8")):
    if not r.get("preset"): continue
    if FILT and FILT not in r["preset"]: continue
    if PRESETS is not None and r["preset"] not in PRESETS: continue
    designs.append((r["preset"], r["resolved_OA"]))
designs.sort(key=lambda d: d[0])

# slice into the requested chunk (contiguous, near-equal sizes)
if chunk_k:
    k = len(designs)
    base, rem = divmod(k, chunk_n)
    start = sum((base + 1) if j < rem else base for j in range(chunk_k - 1))
    size  = (base + 1) if (chunk_k - 1) < rem else base
    designs = designs[start:start + size]

os.makedirs(os.path.dirname(STATS_OUT) or ".", exist_ok=True)
if KEEP: os.makedirs(KEEP_DIR, exist_ok=True)
safe = lambda s: re.sub(r'[^\w.,()+-]+', '_', s)
open(PROG, "w").close()

# Resume: keep already-computed refs from THIS output file so a restart of the
# same chunk doesn't redo them.
results = {}
if os.path.isfile(STATS_OUT) and not FORCE:
    try: results = json.load(open(STATS_OUT, encoding="utf-8")).get("configs", {})
    except Exception: results = {}

label = f"chunk {chunk_k}/{chunk_n}" if chunk_k else "full"
total = len(designs); ok = fail = nonman = skipped = 0
t0 = time.time()
print(f"OpenSCAD: {OPENSCAD}")
print(f"RTP: {RTP}")
print(f"Designs ({label}): {total}  timeout: {TIMEOUT}s  keep-stls: {KEEP}")
print(f"Output: {STATS_OUT}")

def write_out():
    json.dump({"meta": {"source": "current keyguard.scad via native OpenSCAD/CGAL",
                        "openscad": OPENSCAD,
                        "flags": "fudge=0.05 ff=0.05 include_screenshot=no (gate-off)",
                        "chunk": (f"{chunk_k}/{chunk_n}" if chunk_k else None)},
               "configs": results},
              open(STATS_OUT, "w", encoding="utf-8"), indent=1)

for i, (preset, oa_rel) in enumerate(designs, 1):
    if preset in results and "error" not in results[preset] and "volume_mm3" in results[preset]:
        skipped += 1
        print(f"[{i:3}/{total}] {preset:55} SKIP (already done)")
        continue
    oa_src = os.path.join(CASES, oa_rel.replace("\\", os.sep))
    if not os.path.isfile(oa_src):
        line = f"[{i:3}/{total}] {preset:55} OA MISSING: {oa_rel}"
        print(line); open(PROG, "a").write(line + "\n"); fail += 1; continue

    # Private temp working dir so the shared RTP folder is never mutated:
    # keyguard.scad include<>s openings_and_additions.txt relative to its own
    # directory, so both live together here.
    work = tempfile.mkdtemp(prefix="rtpcgal_")
    try:
        shutil.copy2(SCAD, os.path.join(work, "keyguard.scad"))
        shutil.copy2(oa_src, os.path.join(work, "openings_and_additions.txt"))
        out = os.path.join(work, "out.stl")
        cmd = [OPENSCAD, "-p", JSON, "-P", preset,
               "-D", "fudge=0.05", "-D", "ff=0.05", "-D", 'include_screenshot="no"',
               "-o", out, os.path.join(work, "keyguard.scad")]
        ts = time.time()
        try:
            cp = subprocess.run(cmd, capture_output=True, text=True, timeout=TIMEOUT)
            rc = cp.returncode; console = (cp.stdout or "") + "\n" + (cp.stderr or "")
        except subprocess.TimeoutExpired:
            rc = 124; console = ""
        dt = time.time() - ts

        if rc != 0 or not (os.path.isfile(out) and os.path.getsize(out) > 0):
            line = f"[{i:3}/{total}] {preset:55} RENDER FAILED ({dt:.0f}s, rc={rc})"
            print(line); open(PROG, "a").write(line + "\n"); fail += 1; continue

        m = re.search(r'Simple:\s*(yes|no)', console)
        simple = m.group(1) if m else "unknown"
        try:
            st = compute_stats(out)
        except Exception as e:
            line = f"[{i:3}/{total}] {preset:55} STATS FAILED ({e})"
            print(line); open(PROG, "a").write(line + "\n"); fail += 1; continue
        st["simple"] = simple; st["oa"] = oa_rel
        results[preset] = st
        if KEEP: shutil.copy2(out, os.path.join(KEEP_DIR, safe(preset) + ".stl"))
    finally:
        shutil.rmtree(work, ignore_errors=True)

    if simple == "no": nonman += 1
    ok += 1
    tag = "NON-MANIFOLD" if simple == "no" else "OK"
    line = (f"[{i:3}/{total}] {preset:55} {tag} ({dt:.0f}s)  "
            f"parts={st['parts']} area={st['surface_area_mm2']} vol={st['volume_mm3']}")
    print(line); open(PROG, "a").write(line + "\n")
    write_out()

write_out()
el = time.time() - t0
print(f"\nDONE ({label}): {ok} ok ({nonman} non-manifold), {fail} failed, {skipped} skipped, "
      f"of {total} in {el/60:.1f} min")
print("->", STATS_OUT)
if chunk_k:
    print("When all chunks are done, merge with:  python scripts/build-rtp-cgal-golden.py --merge")
