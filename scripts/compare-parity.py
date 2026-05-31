#!/usr/bin/env python3
"""Cross-backend parity audit.

Compares CURRENT web-app Manifold renders against committed .scad CGAL
references, one (case, step) pair at a time. For each pair:

  • prefer the just-rendered "*-actual.png" from test-results/ if present
    (that's the current Manifold output from the most recent sweep)
  • otherwise use the committed web reference PNG (a passing test means
    that ref == current render anyway, so it stands in fine)

Similarity metric: fraction of pixels whose max-channel delta vs the
.scad reference exceeds 30 (roughly Playwright's default 0.15 threshold
on 0-1 scale). Resizes the larger image to the smaller if dimensions
disagree, so a 2048x1536 vs 1024x768 pair is comparable.

Writes a tab-separated report to stdout, sorted worst-to-best.
Writes an incremental per-pair progress log (no sorting, no ANSI codes)
to --progress-log (default: <web-root>/output/compare-visual-references-progress.log).
"""

from __future__ import annotations
import argparse, sys, re
from pathlib import Path
from PIL import Image
import numpy as np


def find_current_render(case_name: str, step_file: str,
                        web_root: Path, test_results: Path) -> Path | None:
    """Locate the current Manifold render for (case, step).

    First check test-results for the just-rendered "*-actual.png" (most
    recent sweep). Failing that, fall back to the committed web ref —
    which is the current render IFF that test passed.
    """
    # Walk test-results dirs; filenames pattern is "step{N}_expected-actual.png"
    # under "test-results/visual-<...>chromium/<case>/<file>".
    if test_results.exists():
        actual_name = step_file.replace("_expected.png", "_expected-actual.png")
        for cand in test_results.rglob(actual_name):
            # Match the case folder so we pick the right one.
            if case_name in str(cand):
                return cand
    committed = web_root / "tests" / "visual.spec.mjs-snapshots" / case_name / step_file
    return committed if committed.exists() else None


def pixel_diff_ratio(a_path: Path, b_path: Path, threshold: int = 30) -> tuple[float, tuple[int, int], tuple[int, int]]:
    """Fraction of pixels with max-channel delta > threshold.

    Resizes the larger image to the smaller one's dims for comparison.
    """
    a = Image.open(a_path).convert("RGB")
    b = Image.open(b_path).convert("RGB")
    a_size = a.size
    b_size = b.size
    if a_size != b_size:
        # Resize larger -> smaller dims (LANCZOS for downsampling)
        if a_size[0] * a_size[1] > b_size[0] * b_size[1]:
            a = a.resize(b_size, Image.LANCZOS)
        else:
            b = b.resize(a_size, Image.LANCZOS)
    aa = np.asarray(a, dtype=np.int16)
    bb = np.asarray(b, dtype=np.int16)
    diff = np.abs(aa - bb).max(axis=-1)
    bad = (diff > threshold).sum()
    total = diff.size
    return (bad / total, a_size, b_size)


def _bucket(ratio: float) -> str:
    if ratio < 0.01: return "excellent"
    if ratio < 0.05: return "good"
    if ratio < 0.15: return "fair"
    if ratio < 0.30: return "poor"
    return "bad"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--web-root", required=True, type=Path)
    ap.add_argument("--scad-root", required=True, type=Path)
    ap.add_argument("--threshold", type=int, default=30,
                    help="Per-channel delta above which a pixel counts as different (default 30)")
    ap.add_argument("--progress-log", type=Path, default=None,
                    help="Path for incremental progress log; default: "
                         "<web-root>/output/compare-visual-references-progress.log")
    args = ap.parse_args()

    web_root  = args.web_root.resolve()
    scad_root = args.scad_root.resolve()
    test_results = web_root / "test-results"

    # Progress log — written incrementally, one line per pair, no sorting.
    # Default lives under output/ so it is gitignored.
    progress_log_path = args.progress_log or (
        web_root / "output" / "compare-visual-references-progress.log"
    )
    progress_log_path.parent.mkdir(parents=True, exist_ok=True)
    plog = open(progress_log_path, "w", encoding="utf-8", buffering=1)

    scad_snapshots = scad_root / "tests" / "cases" / "visual.snapshots"
    if not scad_snapshots.exists():
        print(f"ERROR: .scad snapshots dir not found: {scad_snapshots}", file=sys.stderr)
        plog.close()
        return 2

    rows: list[tuple[float, str, str, str, str]] = []   # (ratio, case, step, source, note)
    no_web = 0
    no_scad = 0
    pair_num = 0

    # Iterate .scad references — they're the authoritative naming
    for case_dir in sorted(scad_snapshots.iterdir(),
                           key=lambda p: tuple(int(x) for x in re.findall(r"\d+", p.name) or [0])):
        if not case_dir.is_dir():
            continue
        for scad_ref in sorted(case_dir.glob("step*_expected.png")):
            case_name = case_dir.name
            step_file = scad_ref.name
            pair_num += 1

            current = find_current_render(case_name, step_file, web_root, test_results)
            if current is None:
                no_web += 1
                rows.append((float("nan"), case_name, step_file, "(no web render)", "no-web"))
                plog.write(f"{'no-web':<10}  {'n/a':>6}  {case_name:<40}  {step_file}\n")
                continue
            try:
                ratio, scad_sz, web_sz = pixel_diff_ratio(scad_ref, current, args.threshold)
            except Exception as e:
                rows.append((float("nan"), case_name, step_file, str(current.relative_to(web_root)), f"ERROR: {e}"))
                plog.write(f"{'error':<10}  {'n/a':>6}  {case_name:<40}  {step_file}  {e}\n")
                continue
            src = "actual" if "test-results" in str(current) else "committed"
            note = f"web={web_sz[0]}x{web_sz[1]} scad={scad_sz[0]}x{scad_sz[1]}"
            rows.append((ratio, case_name, step_file, src, note))
            bucket = _bucket(ratio)
            plog.write(f"{bucket:<10}  {ratio:>6.4f}  {case_name:<40}  {step_file}\n")

    # Summary buckets
    valid     = [r for r in rows if r[0] == r[0]]
    excellent = sum(1 for r in valid if r[0] < 0.01)
    good      = sum(1 for r in valid if 0.01 <= r[0] < 0.05)
    fair      = sum(1 for r in valid if 0.05 <= r[0] < 0.15)
    poor      = sum(1 for r in valid if 0.15 <= r[0] < 0.30)
    bad       = sum(1 for r in valid if r[0] >= 0.30)

    plog.write(f"\n# {pair_num} pairs processed\n")
    plog.write(f"# excellent (<1%):  {excellent}\n")
    plog.write(f"# good      (1-5%): {good}\n")
    plog.write(f"# fair     (5-15%): {fair}\n")
    plog.write(f"# poor    (15-30%): {poor}\n")
    plog.write(f"# bad      (>=30%): {bad}\n")
    plog.write(f"# no web render:    {no_web}\n")
    plog.close()

    # Sorted report to stdout
    # Sort worst (highest ratio) first, NaN first for visibility
    def sortkey(r):
        return (0 if r[0] != r[0] else 1, -(r[0] if r[0] == r[0] else 0))
    rows.sort(key=sortkey)

    print(f"# parity report — {len(rows)} pairs total")
    print(f"# threshold per-channel delta: {args.threshold}")
    print(f"# source = actual    -> taken from latest test-results sweep")
    print(f"# source = committed -> committed web ref (= current render, since test passed)")
    print()
    print("ratio\tcase\tstep\tsource\tnote")
    for r in rows:
        ratio_str = "n/a" if r[0] != r[0] else f"{r[0]:.4f}"
        print(f"{ratio_str}\t{r[1]}\t{r[2]}\t{r[3]}\t{r[4]}")

    print()
    print(f"# Summary buckets (ratio of pixels exceeding threshold):")
    print(f"#   excellent (<1%):      {excellent}")
    print(f"#   good       (1-5%):    {good}")
    print(f"#   fair       (5-15%):   {fair}")
    print(f"#   poor       (15-30%):  {poor}")
    print(f"#   bad         (>=30%):  {bad}")
    print(f"#   no web render:        {no_web}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
