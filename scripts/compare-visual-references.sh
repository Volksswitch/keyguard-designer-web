#!/usr/bin/env bash
# compare-visual-references.sh — Cross-backend parity audit.
# Trigger phrase: "compare visual references"
#
# Compares web-app Playwright viewport PNGs against .scad OpenSCAD CGAL
# reference PNGs and writes a sorted worst-to-best parity report.
#
# Progress (tail -f while running):
#   output/compare-visual-references-progress.log
#
# Final sorted report:
#   output/compare-visual-references.txt

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Sibling path — works on both machines via OneDrive
SCAD_ROOT="$(cd "$PROJECT_ROOT/../My SCAD files/keyguard designer" && pwd)"

OUTPUT_DIR="$PROJECT_ROOT/output"
mkdir -p "$OUTPUT_DIR"

RESULTS="$OUTPUT_DIR/compare-visual-references.txt"
PROGRESS="$OUTPUT_DIR/compare-visual-references-progress.log"

find_python() {
    command -v python3 &>/dev/null && python3 -c "import sys; sys.exit(0)" 2>/dev/null && echo "python3" && return
    command -v python  &>/dev/null && python  -c "import sys; sys.exit(0)" 2>/dev/null && echo "python"  && return
    command -v py      &>/dev/null && echo "py" && return
    echo ""
}
PYTHON="$(find_python)"
if [[ -z "$PYTHON" ]]; then
    echo "ERROR: Python not found on PATH — install Python 3 with Pillow and numpy" >&2
    exit 1
fi

echo "Parity audit — web Playwright PNGs vs .scad CGAL references"
echo "Progress log: output/compare-visual-references-progress.log (tail -f)"
echo "Results file: output/compare-visual-references.txt"
echo ""

"$PYTHON" "$SCRIPT_DIR/compare-parity.py" \
    --web-root  "$PROJECT_ROOT" \
    --scad-root "$SCAD_ROOT" \
    --progress-log "$PROGRESS" \
    > "$RESULTS"

echo "Done."
cat "$RESULTS"
