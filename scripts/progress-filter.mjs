#!/usr/bin/env node
// progress-filter.mjs — Playwright output filter for the visual-update progress log.
//
// Usage: playwright-cmd 2>&1 | node scripts/progress-filter.mjs <progress-log-path>
//
// Passes every line from stdin to stdout unchanged, AND writes clean (ANSI-stripped)
// progress lines to <progress-log-path> so it can be tail -f'd while the run is in
// progress. A "progress line" is any Playwright test-result line matching:
//   "  ok  N [chromium] › ..."   or   "  N passed (Xm)"   etc.
//
// If <progress-log-path> is absent or empty, acts as a transparent passthrough.

import { createInterface } from 'readline';
import { createWriteStream } from 'fs';

const logPath = process.argv[2];
const writer  = logPath ? createWriteStream(logPath, { flags: 'w' }) : null;

// Matches Playwright's per-test result lines and the final summary line.
const PROGRESS_RE = /^\s+(ok|failed)\s+\d+\b|\b\d+\s+(passed|failed)\b/;
const ANSI_RE     = /\x1b\[[0-9;]*m/g;

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', line => {
    process.stdout.write(line + '\n');
    if (writer) {
        const clean = line.replace(ANSI_RE, '').replace(/\r/g, '');
        if (PROGRESS_RE.test(clean)) {
            writer.write(clean.trim() + '\n');
        }
    }
});

rl.on('close', () => {
    if (writer) writer.end();
});
