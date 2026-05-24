#!/usr/bin/env node
/**
 * Bundle-size gate — fails CI if the main JS chunk exceeds a threshold.
 *
 * Thresholds (raw, uncompressed):
 *   main JS chunk: 1,300 kB (baseline: ~1,010 kB, 30% headroom)
 *
 * Only the "index" chunk (the entry point / main bundle) is gated.
 * Lazy chunks (pdf, charts, vendor splits) each have their own reasonable
 * sizes and are not gated here — they load on demand.
 *
 * Run: node scripts/check-bundle-size.cjs [dist-dir]
 */

const fs = require('fs');
const path = require('path');

const DIST_DIR = process.argv[2] || path.join(__dirname, '..', 'dist', 'assets');
const MAIN_CHUNK_LIMIT_KB = 1300; // kB raw

if (!fs.existsSync(DIST_DIR)) {
  console.error(`[bundle-gate] dist/assets not found at ${DIST_DIR}. Run npm run build first.`);
  process.exit(1);
}

const files = fs.readdirSync(DIST_DIR);

// Find all JS files and their sizes
const jsFiles = files
  .filter(f => f.endsWith('.js'))
  .map(f => ({
    name: f,
    sizeKb: fs.statSync(path.join(DIST_DIR, f)).size / 1024,
  }))
  .sort((a, b) => b.sizeKb - a.sizeKb);

if (jsFiles.length === 0) {
  console.error('[bundle-gate] No JS files found in dist/assets.');
  process.exit(1);
}

console.log('[bundle-gate] Top 10 JS chunks by size:');
jsFiles.slice(0, 10).forEach(f => {
  console.log(`  ${f.sizeKb.toFixed(1).padStart(8)} kB  ${f.name}`);
});

// The main chunk is the largest JS file (Vite names it "index-<hash>.js")
const mainChunk = jsFiles.find(f => f.name.startsWith('index-')) || jsFiles[0];

console.log(`\n[bundle-gate] Main chunk: ${mainChunk.name} (${mainChunk.sizeKb.toFixed(1)} kB)`);
console.log(`[bundle-gate] Limit: ${MAIN_CHUNK_LIMIT_KB} kB`);

if (mainChunk.sizeKb > MAIN_CHUNK_LIMIT_KB) {
  console.error(
    `\n[bundle-gate] ❌ FAIL: Main chunk ${mainChunk.sizeKb.toFixed(1)} kB exceeds ` +
      `${MAIN_CHUNK_LIMIT_KB} kB limit. Investigate heavy imports.`,
  );
  process.exit(1);
}

console.log(
  `\n[bundle-gate] ✓ PASS: Main chunk ${mainChunk.sizeKb.toFixed(1)} kB ≤ ${MAIN_CHUNK_LIMIT_KB} kB`,
);
