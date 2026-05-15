// timings-reporter.mjs — Playwright reporter that mirrors the keyguard
// designer's test-timings.ndjson format. Each line is a single JSON object;
// you can tail the file during a run or post-process it after.
//
// Event types emitted:
//   env   — once at start; build/tool versions
//   step  — once per test (per case-step pair); status + duration
//   case  — once per case after all its steps finish; aggregate
//   run   — once at the end; overall aggregate
//
// Filename: test-timings.ndjson in the project root (next to package.json),
// matching the .scad project's location. The file is overwritten on each
// test.sh invocation (per Ken's "always delete test-timings.ndjson" rule);
// scripts/test.sh handles the truncate before launching Playwright.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PROJECT_ROOT  = path.resolve(__dirname, '..');
const TIMINGS_FILE  = path.join(PROJECT_ROOT, 'test-timings.ndjson');

// Mimic the .scad runner's "YYYY-MM-DD HH:MM:SS AM/PM TZ" timestamp.
// Mountain time hardcoded (matches the .scad project), DST inferred from month.
function isoTs() {
  const d = new Date();
  const m = d.getUTCMonth() + 1;
  const dst = m >= 4 && m <= 10;
  const offsetH = dst ? -6 : -7;
  const tz = dst ? 'MDT' : 'MST';
  const local = new Date(d.getTime() + offsetH * 3600 * 1000);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  let h = local.getUTCHours();
  const min = String(local.getUTCMinutes()).padStart(2, '0');
  const sec = String(local.getUTCSeconds()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = ((h + 11) % 12) + 1;
  return `${yyyy}-${mm}-${dd} ${String(h).padStart(2, '0')}:${min}:${sec} ${ampm} ${tz}`;
}

function runLabelFromIso() {
  // 2026-05-14_19-22-49 style (matches .scad)
  const d = new Date();
  const m = d.getUTCMonth() + 1;
  const dst = m >= 4 && m <= 10;
  const offsetH = dst ? -6 : -7;
  const local = new Date(d.getTime() + offsetH * 3600 * 1000);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const HH = String(local.getUTCHours()).padStart(2, '0');
  const MM = String(local.getUTCMinutes()).padStart(2, '0');
  const SS = String(local.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${HH}-${MM}-${SS}`;
}

function appendEvent(obj) {
  try { fs.appendFileSync(TIMINGS_FILE, JSON.stringify(obj) + '\n'); }
  catch (e) { /* swallow; reporter must not crash the test run */ }
}

// Parses "Test Case 5 :: step 2 — front view - lower left" into
// { caseName, step, label }. Returns null on malformed titles.
function parseTitle(title) {
  const m = /^(.+?) :: step (\d+) — (.+)$/.exec(title);
  if (!m) return null;
  return { caseName: m[1], step: parseInt(m[2], 10), label: m[3] };
}

export default class TimingsReporter {
  constructor() {
    this.runLabel = runLabelFromIso();
    this.runStart = null;
    // Per-case aggregator: caseName -> { stepsExpected, stepsDone, passed, failed, startMs, lastEndMs }
    this.caseAgg = new Map();
    this.stepCountByCase = new Map();   // caseName -> total step count
    this.totalCasesRun    = 0;
    this.totalCasesPassed = 0;
    this.totalCasesFailed = 0;
  }

  onBegin(config, suite) {
    this.runStart = Date.now();

    // Count steps per case so the step events can record step_count.
    const allTests = suite.allTests();
    for (const t of allTests) {
      const parsed = parseTitle(t.title);
      if (!parsed) continue;
      this.stepCountByCase.set(parsed.caseName, (this.stepCountByCase.get(parsed.caseName) || 0) + 1);
    }

    appendEvent({
      event: 'env',
      session: this.runLabel,
      node: process.version,
      playwright: 'workers=' + (config.workers || 1),
      tests: allTests.length,
      ts: isoTs(),
    });
  }

  onTestEnd(test, result) {
    const parsed = parseTitle(test.title);
    if (!parsed) return;
    const { caseName, step, label } = parsed;
    const step_count = this.stepCountByCase.get(caseName) || 1;
    const status = result.status === 'passed' ? 'pass'
                 : result.status === 'failed' ? 'fail'
                 : result.status;       // 'timedOut', 'skipped', etc.

    appendEvent({
      event: 'step',
      run: this.runLabel,
      case: caseName,
      step,
      step_count,
      label,
      status,
      duration_s: Math.round(result.duration / 100) / 10,
      ts: isoTs(),
    });

    // Aggregate per case; flush a "case" event when its last step finishes.
    let agg = this.caseAgg.get(caseName);
    if (!agg) {
      agg = { stepsExpected: step_count, stepsDone: 0, passed: 0, failed: 0, startMs: Date.now() };
      this.caseAgg.set(caseName, agg);
    }
    agg.stepsDone += 1;
    if (status === 'pass') agg.passed += 1;
    else                   agg.failed += 1;

    if (agg.stepsDone >= agg.stepsExpected) {
      const dur = (Date.now() - agg.startMs) / 1000;
      appendEvent({
        event: 'case',
        run: this.runLabel,
        case: caseName,
        steps: agg.stepsExpected,
        passed: agg.passed,
        failed: agg.failed,
        captured: 0,
        duration_s: Math.round(dur),
        ts: isoTs(),
      });
      this.totalCasesRun++;
      if (agg.failed === 0) this.totalCasesPassed++;
      else                  this.totalCasesFailed++;
    }
  }

  onEnd() {
    const dur = (Date.now() - this.runStart) / 1000;
    appendEvent({
      event: 'run',
      run: this.runLabel,
      mode: 'visual',
      cases_run: this.totalCasesRun,
      cases_passed: this.totalCasesPassed,
      cases_failed: this.totalCasesFailed,
      duration_s: Math.round(dur),
      ts: isoTs(),
    });
  }

  // Required interface bits Playwright might call; no-ops for our purposes.
  onError() {}
  onStdOut() {}
  onStdErr() {}
}
