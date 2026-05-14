#!/usr/bin/env node
// lint-app-html.mjs — Parse-check the inline ES module in app.html.
//
// app.html is a single-file app with all logic inside a <script type="module">
// block. There's no separate .js file to lint, so this script extracts the
// inline source and runs it through Node's V8 parser to catch syntax errors
// without executing the code or needing a browser.
//
// Usage: node scripts/lint-app-html.mjs <path-to-html>
// Exits 0 on clean parse, 1 on parse error, 2 on usage error.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const [, , htmlPath] = process.argv;
if (!htmlPath) {
  console.error('usage: node lint-app-html.mjs <path-to-html>');
  process.exit(2);
}

let html;
try { html = readFileSync(htmlPath, 'utf8'); }
catch (e) {
  console.error(`Failed to read ${htmlPath}: ${e.message}`);
  process.exit(2);
}

// Find every <script type="module">...</script> block.
// Greedy match isn't safe here (multiple blocks); use non-greedy + global flag.
const blockRe = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>([\s\S]*?)<\/script>/gi;
const blocks = [...html.matchAll(blockRe)];
if (blocks.length === 0) {
  console.error('No <script type="module"> block found — nothing to lint.');
  process.exit(2);
}

// Compute the source-line offset of each block so V8 errors map back to
// the original HTML line numbers, not extracted-snippet line numbers.
let errors = 0;
const tmp = mkdtempSync(join(tmpdir(), 'kgweb-lint-'));
try {
  for (let i = 0; i < blocks.length; i++) {
    const [full, body] = blocks[i];
    const startIdx = blocks[i].index;
    const linesBefore = html.slice(0, startIdx).split('\n').length - 1;
    const openTagOffset = full.indexOf('>') + 1;
    const bodyStartLine = linesBefore + html.slice(startIdx, startIdx + openTagOffset).split('\n').length - 1;

    // Replace ES module imports with no-ops so Node doesn't try to resolve
    // them. `node --check` parses but doesn't execute, yet it still validates
    // import specifier syntax; bare specifiers like "three" would fail at the
    // resolver stage even with --check. Stripping them keeps the parse pure.
    const sanitized = body
      .replace(/^\s*import\s+[^;]+;/gm, '// import removed for parse-check')
      .replace(/^\s*import\s+["'][^"']+["'];?/gm, '// import removed for parse-check');

    // Write to a .mjs temp file so Node parses it as ESM.
    const tmpFile = join(tmp, `block-${i}.mjs`);
    writeFileSync(tmpFile, sanitized, 'utf8');
    const result = spawnSync(process.execPath, ['--check', tmpFile], {
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      errors++;
      // Re-map any "block-N.mjs:LINE" references in the error output back to
      // the original HTML path + line.
      const remapped = result.stderr.replace(
        new RegExp(`${tmpFile.replace(/[.\\/]/g, '\\$&')}:(\\d+)`, 'g'),
        (_, line) => `${htmlPath}:${Number(line) + bodyStartLine}`
      );
      console.error(`\nBlock ${i + 1}/${blocks.length} (starts at line ${bodyStartLine + 1}):`);
      console.error(remapped.trim());
    } else {
      console.log(`Block ${i + 1}/${blocks.length} (line ${bodyStartLine + 1}): OK`);
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

process.exit(errors === 0 ? 0 : 1);
