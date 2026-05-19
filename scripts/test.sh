#!/usr/bin/env bash
# test.sh — Multi-layer test runner for keyguard-designer-web
#
# Layers (run in order, or individually via flags):
#   --lint     Layer 1: Parse-check app.html's inline JS via Node (fast, no browser)
#   --smoke    Layer 2: Headless page-load via Playwright; fail on console errors
#   --visual   Layer 3: Render bundled fixture via Playwright; diff viewport
#                       screenshots against committed reference PNGs
#   --geometry Layer 4: Export an STL through the app's own export path for
#                       every shared test-case step with 3D geometry; assert
#                       each is 2-manifold (native OpenSCAD "Simple:" verdict).
#                       OPT-IN ONLY — slow (wasm STL export per case). Not part
#                       of the no-arg default or --all; run it deliberately.
#
# Usage:
#   ./scripts/test.sh                 # Default: lint + smoke + visual
#   ./scripts/test.sh --all           # Same as default (lint + smoke + visual)
#   ./scripts/test.sh --lint          # Single layer
#   ./scripts/test.sh --smoke
#   ./scripts/test.sh --visual
#   ./scripts/test.sh --visual --update    # Regenerate reference screenshots
#   ./scripts/test.sh --geometry      # Geometry layer only (opt-in, slow)
#   KEYGUARD_GEOMETRY_CASES="Test Case 17" ./scripts/test.sh --geometry
#
# Prerequisites (one-time setup, not done by this script):
#   - Node.js LTS on PATH                   (install from https://nodejs.org/)
#   - `npm install` from the project root   (installs Playwright)
#   - `npx playwright install chromium`     (~200 MB browser bundle)
#   - `admesh` on PATH                      (--geometry only; ADMESH=… to override)
# If any are missing, the affected layer fails with a clear pointer.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colour output (matches the keyguard designer's test.sh)
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

pass()   { echo -e "${GREEN}  ✓ PASS${RESET}  $*"; }
fail()   { echo -e "${RED}  ✗ FAIL${RESET}  $*"; FAILURES=$((FAILURES + 1)); }
warn()   { echo -e "${YELLOW}  ⚠ WARN${RESET}  $*"; }
info()   { echo -e "${BLUE}  ·${RESET} $*"; }
header() { echo -e "\n${BOLD}$*${RESET}"; }

# Argument parsing
RUN_LINT=0; RUN_SMOKE=0; RUN_VISUAL=0; RUN_GEOMETRY=0; UPDATE_SNAPSHOTS=0
if [[ $# -eq 0 ]]; then
    RUN_LINT=1; RUN_SMOKE=1; RUN_VISUAL=1
fi
while [[ $# -gt 0 ]]; do
    case "$1" in
        --lint)     RUN_LINT=1; shift ;;
        --smoke)    RUN_SMOKE=1; shift ;;
        --visual)   RUN_VISUAL=1; shift ;;
        --geometry) RUN_GEOMETRY=1; shift ;;
        --update|--update-snapshots) UPDATE_SNAPSHOTS=1; shift ;;
        # --all deliberately excludes --geometry: it is slow (wasm STL export
        # per case) and opt-in by design. Run it explicitly with --geometry.
        --all)      RUN_LINT=1; RUN_SMOKE=1; RUN_VISUAL=1; shift ;;
        -h|--help)
            sed -n '2,30p' "$0"  # echo the header comment
            exit 0 ;;
        *)
            echo "Unknown flag: $1" >&2
            echo "Try --help" >&2
            exit 2 ;;
    esac
done

FAILURES=0

# Always start with a fresh test-timings.ndjson so the file reflects only
# the current run. Mirrors the keyguard designer's "always delete
# test-timings.ndjson before starting a new test run" convention so the two
# projects can be tailed side-by-side without confusion.
: > "$PROJECT_ROOT/test-timings.ndjson"

# Layer 1 — JS lint / parse check
if [[ $RUN_LINT -eq 1 ]]; then
    header "Layer 1 — JS parse check (app.html inline script)"
    if ! command -v node >/dev/null 2>&1; then
        fail "node not on PATH — install Node.js LTS from https://nodejs.org/"
    else
        info "Running scripts/lint-app-html.mjs"
        if node "$SCRIPT_DIR/lint-app-html.mjs" "$PROJECT_ROOT/app.html"; then
            pass "JS parse check — clean"
        else
            fail "JS parse check — see errors above"
        fi
    fi
fi

# Layer 2 — Headless smoke test
if [[ $RUN_SMOKE -eq 1 ]]; then
    header "Layer 2 — Headless smoke test (Playwright)"
    if ! command -v node >/dev/null 2>&1; then
        fail "node not on PATH — install Node.js LTS from https://nodejs.org/"
    elif [[ ! -d "$PROJECT_ROOT/node_modules/@playwright" ]]; then
        fail "Playwright not installed — run 'npm install' from project root"
    else
        info "Running tests/smoke.spec.mjs"
        if (cd "$PROJECT_ROOT" && KEYGUARD_TEST_MODE=smoke npx playwright test --config=playwright.config.mjs tests/smoke.spec.mjs); then
            pass "Smoke test — page loaded, no console errors"
        else
            fail "Smoke test — see report above"
        fi
    fi
fi

# Layer 3 — Visual regression test
if [[ $RUN_VISUAL -eq 1 ]]; then
    header "Layer 3 — Visual regression test (Playwright + viewport screenshots)"
    if ! command -v node >/dev/null 2>&1; then
        fail "node not on PATH — install Node.js LTS from https://nodejs.org/"
    elif [[ ! -d "$PROJECT_ROOT/node_modules/@playwright" ]]; then
        fail "Playwright not installed — run 'npm install' from project root"
    else
        VISUAL_ARGS=(--config=playwright.config.mjs tests/visual.spec.mjs)
        if [[ $UPDATE_SNAPSHOTS -eq 1 ]]; then
            info "Regenerating reference screenshots (--update)"
            VISUAL_ARGS+=(--update-snapshots)
        else
            info "Running tests/visual.spec.mjs"
        fi
        if (cd "$PROJECT_ROOT" && KEYGUARD_TEST_MODE=visual npx playwright test "${VISUAL_ARGS[@]}"); then
            if [[ $UPDATE_SNAPSHOTS -eq 1 ]]; then
                pass "Visual references updated — review tests/visual.spec.mjs-snapshots/ and commit"
            else
                pass "Visual regression — all screenshots within tolerance"
            fi
        else
            fail "Visual regression — see report above"
        fi
    fi
fi

# Layer 4 — Geometry validation (opt-in; not in default or --all)
if [[ $RUN_GEOMETRY -eq 1 ]]; then
    header "Layer 4 — Geometry validation (app-exported STL, manifold check)"
    if ! command -v node >/dev/null 2>&1; then
        fail "node not on PATH — install Node.js LTS from https://nodejs.org/"
    elif [[ ! -d "$PROJECT_ROOT/node_modules/@playwright" ]]; then
        fail "Playwright not installed — run 'npm install' from project root"
    elif ! command -v "${ADMESH:-admesh}" >/dev/null 2>&1; then
        fail "ADMesh not found — install 'admesh' and put it on PATH (or set ADMESH=/path/to/admesh). Required only for --geometry."
    else
        info "Running tests/geometry.spec.mjs (every shared case with 3D geometry)"
        info "Filter with KEYGUARD_GEOMETRY_CASES='Test Case 17,Test Case 49'"
        if (cd "$PROJECT_ROOT" && KEYGUARD_TEST_MODE=geometry npx playwright test --config=playwright.config.mjs tests/geometry.spec.mjs); then
            pass "Geometry — every exported STL is manifold"
        else
            fail "Geometry — non-manifold or failed export (see report above)"
        fi
    fi
fi

echo
if [[ $FAILURES -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}All tests passed.${RESET}"
    exit 0
else
    echo -e "${RED}${BOLD}$FAILURES test layer(s) failed.${RESET}"
    exit 1
fi
