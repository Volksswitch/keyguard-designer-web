#!/usr/bin/env bash
# compare-cross.sh — structural comparison of the web app's visual
# references against the .scad project's visual references.
#
# WHY: both projects render the SAME model at the SAME size (2048x1536)
# and SAME camera (vpt/vpr/vpd), so matching steps are pixel-registered.
# They differ only cosmetically: body hue (teal vs OpenSCAD turquoise),
# split-line hue (web #ff4d4d overlay vs .scad "#"-modifier magenta),
# background, and shading/AA model. A raw RMSE flags all of that. This
# tool looks ABOVE the pixel/colour level for STRUCTURAL drift:
#
#   1. Foreground-mask IoU   — colour/shading-blind silhouette overlap
#                              (catches missing/shifted/rotated/scaled
#                              geometry and wrong cutout layout)
#   2. Split-line placement  — colour-keyed red/pink mask; compares its
#                              bounding-box centre + size across projects
#                              independent of the two different pinks
#   3. DSSIM                  — perceptual/structural score on colour-
#                              normalised grayscale (holistic "did
#                              anything meaningful move")
#
# It is a STRUCTURAL DRIFT DETECTOR, not an equivalence test: the two
# renderers differ in lighting/AA and the "#" modifier is see-through
# while the web overlay is translucent-opaque, so a perfect-geometry
# pair never scores zero. Thresholds below are calibrated so only
# SIGNIFICANT divergence flags.
#
# Usage:
#   ./scripts/compare-cross.sh                       # every parallel case
#   ./scripts/compare-cross.sh "Test Case 56"        # one case
#   ./scripts/compare-cross.sh "Test Case 3" "Test Case 56"
#   KEYGUARD_DESIGNER_ROOT=/path ./scripts/compare-cross.sh
#
# Exit 0 = no case flagged; exit 1 = at least one structural flag.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_SNAP="$PROJECT_ROOT/tests/visual.spec.mjs-snapshots"
SCAD_ROOT="${KEYGUARD_DESIGNER_ROOT:-$PROJECT_ROOT/../My SCAD files/keyguard designer}"
SCAD_SNAP="$SCAD_ROOT/tests/cases/visual.snapshots"
OUT_DIR="$PROJECT_ROOT/output/cross-compare"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# NDJSON timings — same schema as tests/timings-reporter.mjs so this run's
# results sit alongside the smoke/visual layers and can be tailed together.
# Fresh per run (matches the project's "always reset test-timings.ndjson"
# convention; the other layers truncate it the same way).
TIMINGS_FILE="$PROJECT_ROOT/test-timings.ndjson"
RUN_LABEL="$(date '+%Y-%m-%d_%H-%M-%S')"
ndjson_ts(){ date '+%Y-%m-%d %I:%M:%S %p %Z'; }
json_str(){ printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
ndjson(){ printf '%s\n' "$1" >> "$TIMINGS_FILE"; }
: > "$TIMINGS_FILE"

# ── Thresholds (TUNED against a full 60-case run + visual inspection) ──
# Only the silhouette IoU GATES. Visual calibration showed:
#   IoU <= ~0.89  → genuine significant structural difference
#                   (e.g. TC12: web renders a near-solid slab, all cell
#                   cutouts missing; TC15: malformed/merged cells)
#   IoU >= ~0.93  → cross-renderer framing/shading/AA variance only
#                   (same geometry; e.g. TC6, TC9)
# 0.90 sits in that validated gap. The colour-keyed overlay check is
# INFORMATIONAL only (not gated): it false-positives badly when the web
# colours a solid feature pink while OpenSCAD's Tomorrow scheme colours
# it blue (TC38), or on small scattered "#" marks (TC54). edgeIoU is
# also informational — a useful triage hint for the 0.90–0.95 band.
IOU_MIN="${IOU_MIN:-0.90}"          # silhouette overlap below this = significant drift
SPLIT_CENTRE_MAX="${SPLIT_CENTRE_MAX:-0.03}"  # (info) overlay bbox-centre delta
SPLIT_SIZE_MAX="${SPLIT_SIZE_MAX:-0.35}"      # (info) overlay bbox-diagonal delta
RED_MIN_FRAC="0.0004"               # below this red coverage = "no overlay"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'
pass(){ echo -e "${GREEN}  ✓${RESET} $*"; }
flag(){ echo -e "${RED}  ✗ FLAG${RESET} $*"; }
info(){ echo -e "${BLUE}  ·${RESET} $*"; }

[[ -d "$WEB_SNAP" ]]  || { echo "web snapshots not found: $WEB_SNAP" >&2; exit 2; }
[[ -d "$SCAD_SNAP" ]] || { echo ".scad snapshots not found: $SCAD_SNAP
Set KEYGUARD_DESIGNER_ROOT if the keyguard designer is elsewhere." >&2; exit 2; }

# Selected cases: args, else every case present in BOTH trees.
declare -a CASES
if [[ $# -gt 0 ]]; then
    CASES=("$@")
else
    while IFS= read -r d; do
        b="$(basename "$d")"
        [[ -d "$SCAD_SNAP/$b" ]] && CASES+=("$b")
    done < <(find "$WEB_SNAP" -mindepth 1 -maxdepth 1 -type d | sort -V)
fi

mkdir -p "$OUT_DIR"
echo -e "${BOLD}Cross-project structural comparison${RESET}"
info "web : $WEB_SNAP"
info "scad: $SCAD_SNAP"
info "gate: silhouette IoU>=$IOU_MIN  (overlayΔ and edgeIoU are informational)"
echo

# Fraction (0..1) of white in a 1-channel image.
white_frac(){ magick "$1" -format "%[fx:mean]" info:; }

# Red/pink coverage + trimmed bbox "WxH+X+Y" of the split-line overlay,
# computed on a downscaled copy for speed. Echoes: "<frac> <WxH+X+Y|->".
red_mask(){
    local src="$1" m="$WORK/red.png"
    magick "$src" -resize 512x -colorspace sRGB \
        -fx "(r-g)>0.16 && (r-b)>0.04 ? 1 : 0" -threshold 50% "$m"
    local frac; frac="$(white_frac "$m")"
    local bbox="-"
    if awk "BEGIN{exit !($frac > $RED_MIN_FRAC)}"; then
        bbox="$(magick "$m" -trim -format "%wx%h+%X+%Y" info: 2>/dev/null || echo "-")"
    fi
    echo "$frac $bbox"
}

FLAGS=0; STEPS=0
RUN_START=$(date +%s)
CASES_RUN=0; CASES_PASSED=0; CASES_FAILED=0
ndjson "{\"event\":\"env\",\"session\":\"$RUN_LABEL\",\"tool\":\"compare-cross\",\"cases\":${#CASES[@]},\"ts\":\"$(ndjson_ts)\"}"
for c in "${CASES[@]}"; do
    wdir="$WEB_SNAP/$c"; sdir="$SCAD_SNAP/$c"
    [[ -d "$wdir" && -d "$sdir" ]] || { info "skip '$c' (not in both trees)"; continue; }
    echo -e "${BOLD}$c${RESET}"
    cjson="$(json_str "$c")"
    step_count=$(find "$wdir" -maxdepth 1 -name 'step*_expected.png' 2>/dev/null | wc -l | tr -d ' ')
    case_start=$(date +%s); case_pass=0; case_fail=0
    n=1
    while :; do
        wf="$wdir/step${n}_expected.png"; sf="$sdir/step${n}_expected.png"
        [[ -f "$wf" || -f "$sf" ]] || break
        step_start=$(date +%s)
        if [[ ! -f "$wf" || ! -f "$sf" ]]; then
            flag "step $n — reference missing on one side"; FLAGS=$((FLAGS+1))
            case_fail=$((case_fail+1))
            ndjson "{\"event\":\"step\",\"run\":\"$RUN_LABEL\",\"case\":\"$cjson\",\"step\":$n,\"step_count\":$step_count,\"label\":\"compare\",\"status\":\"fail\",\"reason\":\"reference missing\",\"duration_s\":0,\"ts\":\"$(ndjson_ts)\"}"
            n=$((n+1)); continue
        fi
        STEPS=$((STEPS+1))

        # 1. Foreground silhouette IoU (Otsu — adaptive to each bg/lighting)
        wm="$WORK/wm.png"; sm="$WORK/sm.png"
        magick "$wf" -resize 512x -colorspace Gray -auto-threshold OTSU -negate "$wm"
        magick "$sf" -resize 512x -colorspace Gray -auto-threshold OTSU -negate "$sm"
        inter="$(magick "$wm" "$sm" -compose Multiply -composite -format "%[fx:mean]" info:)"
        uni="$(magick "$wm" "$sm" -compose Lighten  -composite -format "%[fx:mean]" info:)"
        iou="$(awk "BEGIN{printf \"%.4f\", ($uni>0)?$inter/$uni:1}")"

        # 2. Edge-structure IoU (informational). Canny edges on colour-
        #    normalised grayscale, lightly dilated, then IoU of edge pixels.
        #    Fully colour/shading-blind and a true 0..1; sensitive to
        #    INTERNAL structure (cutout shapes/positions/feature edges) that
        #    the silhouette IoU can miss. Reported, not gated, because the
        #    two renderers' shading produces some genuine edge noise — it's
        #    a human-readable second opinion, not a pass/fail.
        edg(){ magick "$1" -resize 768x -colorspace Gray -normalize \
               -canny 0x1+10%+30% -morphology Dilate Disk:1.5 "$2"; }
        edg "$wf" "$WORK/we.png"; edg "$sf" "$WORK/se.png"
        eI="$(magick "$WORK/we.png" "$WORK/se.png" -compose Multiply -composite -format "%[fx:mean]" info:)"
        eU="$(magick "$WORK/we.png" "$WORK/se.png" -compose Lighten  -composite -format "%[fx:mean]" info:)"
        edge_iou="$(awk "BEGIN{printf \"%.3f\", ($eU>0)?$eI/$eU:1}")"

        # 3. Split-line placement (colour-keyed, projects' pinks differ)
        read -r wfrac wbb <<<"$(red_mask "$wf")"
        read -r sfrac sbb <<<"$(red_mask "$sf")"
        split_note="no overlay"
        if [[ "$wbb" != "-" && "$sbb" != "-" ]]; then
            parse(){ echo "$1" | sed -E 's/x|\+/ /g'; }
            read -r ww wh wx wy <<<"$(parse "$wbb")"
            read -r sw sh sx sy <<<"$(parse "$sbb")"
            # bbox centres + diagonals, normalised to the 512-wide working image
            read -r dC dS <<<"$(awk -v ww=$ww -v wh=$wh -v wx=$wx -v wy=$wy \
                -v sw=$sw -v sh=$sh -v sx=$sx -v sy=$sy 'BEGIN{
                wcx=wx+ww/2; wcy=wy+wh/2; scx=sx+sw/2; scy=sy+sh/2;
                diag=sqrt(512*512+(512*1536/2048)^2);
                dc=sqrt((wcx-scx)^2+(wcy-scy)^2)/diag;
                wd=sqrt(ww*ww+wh*wh); sd=sqrt(sw*sw+sh*sh);
                ds=(sd>0)?( (wd>sd)?(wd-sd)/sd:(sd-wd)/wd ):1;
                printf "%.4f %.4f", dc, ds }')"
            # Informational only — not gated. The colour-keyed overlay
            # comparison false-positives when a solid feature is pink in
            # the web app but a different hue in OpenSCAD's Tomorrow scheme.
            split_note="overlayΔcentre=$dC Δsize=$dS [info]"
            awk "BEGIN{exit !($dC > $SPLIT_CENTRE_MAX || $dS > $SPLIT_SIZE_MAX)}" \
                && split_note="$split_note ⚠large"
        elif [[ "$wbb" != "-" || "$sbb" != "-" ]]; then
            split_note="overlay keyed on one side only (web:$wbb scad:$sbb) [info]"
        fi

        bad=0
        awk "BEGIN{exit !($iou < $IOU_MIN)}" && bad=1

        msg="step $n  IoU=$iou  edgeIoU=$edge_iou  $split_note"
        step_dur=$(( $(date +%s) - step_start ))
        if [[ $bad -eq 1 ]]; then
            flag "$msg"
            FLAGS=$((FLAGS+1)); case_fail=$((case_fail+1))
            magick "$wf" "$sf" +append "$OUT_DIR/${c}_step${n}_sxs.png"
            info "  → side-by-side: output/cross-compare/${c}_step${n}_sxs.png"
        else
            pass "$msg"
            case_pass=$((case_pass+1))
        fi
        ndjson "{\"event\":\"step\",\"run\":\"$RUN_LABEL\",\"case\":\"$cjson\",\"step\":$n,\"step_count\":$step_count,\"label\":\"compare\",\"status\":\"$([[ $bad -eq 1 ]] && echo fail || echo pass)\",\"iou\":$iou,\"edge_iou\":$edge_iou,\"duration_s\":$step_dur,\"ts\":\"$(ndjson_ts)\"}"
        n=$((n+1))
    done
    ndjson "{\"event\":\"case\",\"run\":\"$RUN_LABEL\",\"case\":\"$cjson\",\"steps\":$((case_pass+case_fail)),\"passed\":$case_pass,\"failed\":$case_fail,\"captured\":0,\"duration_s\":$(( $(date +%s) - case_start )),\"ts\":\"$(ndjson_ts)\"}"
    CASES_RUN=$((CASES_RUN+1))
    if [[ $case_fail -eq 0 ]]; then CASES_PASSED=$((CASES_PASSED+1)); else CASES_FAILED=$((CASES_FAILED+1)); fi
done
ndjson "{\"event\":\"run\",\"run\":\"$RUN_LABEL\",\"mode\":\"cross-compare\",\"cases_run\":$CASES_RUN,\"cases_passed\":$CASES_PASSED,\"cases_failed\":$CASES_FAILED,\"duration_s\":$(( $(date +%s) - RUN_START )),\"ts\":\"$(ndjson_ts)\"}"

echo
if [[ $FLAGS -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}No structural drift — $STEPS step(s) compared, all within thresholds.${RESET}"
    exit 0
else
    echo -e "${RED}${BOLD}$FLAGS structural flag(s) across $STEPS step(s). See output/cross-compare/.${RESET}"
    exit 1
fi
