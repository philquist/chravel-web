#!/usr/bin/env node
/*
 * Lightweight mobile performance budget check against built artifacts.
 * Run after `npm run build`.
 */
const fs = require('node:fs');
const path = require('node:path');

const DIST_ASSETS = path.join(process.cwd(), 'dist', 'assets');
const JS_BUDGET_BYTES = 1_100_000; // 1.1 MB total JS (gzip-independent guardrail)
const CSS_BUDGET_BYTES = 260_000; // 260 KB total CSS

function sumByExt(ext) {
  return fs
    .readdirSync(DIST_ASSETS)
    .filter(file => file.endsWith(ext))
    .map(file => fs.statSync(path.join(DIST_ASSETS, file)).size)
    .reduce((acc, size) => acc + size, 0);
}

if (!fs.existsSync(DIST_ASSETS)) {
  console.error('❌ Missing dist/assets. Run `npm run build` before budget checks.');
  process.exit(1);
}

const jsBytes = sumByExt('.js');
const cssBytes = sumByExt('.css');

const formatKb = value => `${(value / 1024).toFixed(1)}KB`;

console.log(`JS total: ${formatKb(jsBytes)} (budget ${formatKb(JS_BUDGET_BYTES)})`);
console.log(`CSS total: ${formatKb(cssBytes)} (budget ${formatKb(CSS_BUDGET_BYTES)})`);

if (jsBytes > JS_BUDGET_BYTES || cssBytes > CSS_BUDGET_BYTES) {
  console.error('❌ Mobile performance budget exceeded.');
  process.exit(1);
}

console.log('✅ Mobile performance budget check passed.');
