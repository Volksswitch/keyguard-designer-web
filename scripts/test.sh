#!/usr/bin/env bash
# test.sh — Multi-layer test runner for keyguard-designer-web
#
# Layers (run in order, or individually via flags):
#   --lint    Layer 1: Parse-check app.html's inline JS via Node (fast, no browser)
#   --smoke   Layer 2: Headless page-load via Playwright; fail on console errors
#
# Usage:
#   ./scripts/test.sh                 # All layers (default)
#   ./scripts/test.sh --all           # All layers (explicit)
#   ./scripts/test.sh --lint          # Layer 1 only
#   ./scripts/test.sh --smoke         # Layer 2 only
#
# First-run setup happens automatically inside the script — npm install
# and `playwright install chromium` are invoked on demand the first time
# a layer that needs them runs. Node.js (any LTS) must already be on PATH;
# it can't auto-install itself.

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
setup()  { echo -e "${YELLOW}  ⚙ SETUP${RESET} $*"; }
header() { echo -e "\n${BOLD}$*${RESET}"; }

# Argument parsing
RUN_LINT=0; RUN_SMOKE=0
if [[ $# -eq 0 ]]; then
    RUN_LINT=1; RUN_SMOKE=1
fi
while [[ $# -gt 0 ]]; do
    case "$1" in
        --lint)   RUN_LINT=1; shift ;;
        --smoke)  RUN_SMOKE=1; shift ;;
        --all)    RUN_LINT=1; RUN_SMOKE=1; shift ;;
        -h|--help)
            sed -n '2,17p' "$0"  # echo the header comment
            exit 0 ;;
        *)
            echo "Unknown flag: $1" >&2
            echo "Try --help" >&2
            exit 2 ;;
    esac
done

FAILURES=0

# Verify node is on PATH. Returns 0 if available, 1 otherwise. Node is the
# only prerequisite that can't be auto-installed — everything else is
# handled below.
require_node() {
    if ! command -v node >/dev/null 2>&1; then
        fail "node not on PATH — install Node.js LTS from https://nodejs.org/"
        return 1
    fi
    return 0
}

# Ensure npm dependencies (Playwright) and the Chromium browser are present.
# Idempotent: subsequent runs see node_modules/@playwright exists and skip
# straight to the test. First run takes a few minutes to download Playwright
# (~50 MB) and Chromium (~200 MB).
ensure_playwright() {
    if [[ ! -d "$PROJECT_ROOT/node_modules/@playwright" ]]; then
        setup "First run — installing test dependencies (may take a minute)..."
        (cd "$PROJECT_ROOT" && npm install --silent) || {
            fail "npm install failed — see output above"
            return 1
        }
        setup "Installing Playwright Chromium (~200 MB download, one-time)..."
        (cd "$PROJECT_ROOT" && npx --yes playwright install chromium) || {
            fail "playwright install chromium failed — see output above"
            return 1
        }
    fi
    return 0
}

# Layer 1 — JS lint / parse check
if [[ $RUN_LINT -eq 1 ]]; then
    header "Layer 1 — JS parse check (app.html inline script)"
    if require_node; then
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
    if require_node && ensure_playwright; then
        info "Running tests/smoke.spec.mjs"
        if (cd "$PROJECT_ROOT" && npx playwright test --config=playwright.config.mjs); then
            pass "Smoke test — page loaded, no console errors"
        else
            fail "Smoke test — see report above"
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
