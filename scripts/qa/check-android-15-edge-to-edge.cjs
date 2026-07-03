#!/usr/bin/env node
/*
 * Android 15 edge-to-edge release guard.
 *
 * Google Play flags deprecated system bar/cutout APIs in Android 15 artifacts.
 * This guard scans a checked-in native Android project before an AAB is promoted.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const requireNative = args.has('--require-native');
const androidDir = path.join(root, 'android');

const deprecatedPatterns = [
  {
    name: 'Window.setStatusBarColor / statusBarColor writes',
    pattern:
      /(?:setStatusBarColor\s*\(|\.statusBarColor\s*=|StatusBar\.setBackgroundColor\s*\(|<StatusBar[^>]*backgroundColor=)/,
    fix: 'Use edge-to-edge layout plus safe-area/window-insets handling; keep only icon style changes.',
  },
  {
    name: 'Window.setNavigationBarColor / navigationBarColor writes',
    pattern: /(?:setNavigationBarColor\s*\(|\.navigationBarColor\s*=)/,
    fix: 'Stop painting the navigation bar directly on Android 15; draw behind it and pad interactive UI from insets.',
  },
  {
    name: 'Deprecated display cutout modes',
    pattern:
      /(?:LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES|LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT|windowLayoutInDisplayCutoutMode\s*=\s*["'](?:shortEdges|default)["'])/,
    fix: 'Use Android 15-compatible cutout handling and verify content with cutout simulation.',
  },
  {
    name: 'Legacy system UI layout flags',
    pattern:
      /(?:SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION|SYSTEM_UI_FLAG_LAYOUT_STABLE|ViewCompat\.setOnApplyWindowInsetsListener\s*\([^)]*null)/,
    fix: 'Use AndroidX WindowCompat/enableEdgeToEdge and explicit inset listeners instead of legacy flags.',
  },
];

const scanExtensions = new Set([
  '.kt',
  '.java',
  '.xml',
  '.gradle',
  '.kts',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
]);
const ignoredDirs = new Set(['.git', '.gradle', 'build', 'node_modules', 'dist']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (scanExtensions.has(path.extname(entry.name)) || entry.name === 'build.gradle') {
      files.push(fullPath);
    }
  }
  return files;
}

function lineNumberForOffset(contents, offset) {
  return contents.slice(0, offset).split('\n').length;
}

if (!fs.existsSync(androidDir)) {
  const message =
    'No checked-in android/ project found. Android 15 edge-to-edge cannot be verified from this repo.';
  if (requireNative) {
    console.error(`❌ ${message}`);
    console.error(
      '   Add/sync the Android native project used to build the Play Console AAB, then rerun this guard.',
    );
    process.exit(1);
  }
  console.warn(`⚠️ ${message}`);
  console.warn(
    '   Rerun with --require-native in Android release CI so missing native source blocks promotion.',
  );
  process.exit(0);
}

const findings = [];
for (const file of walk(androidDir)) {
  const contents = fs.readFileSync(file, 'utf8');
  for (const check of deprecatedPatterns) {
    const match = check.pattern.exec(contents);
    if (!match) continue;
    findings.push({
      file: path.relative(root, file),
      line: lineNumberForOffset(contents, match.index),
      name: check.name,
      fix: check.fix,
    });
  }
}

if (findings.length > 0) {
  console.error('❌ Android 15 edge-to-edge deprecated API guard failed.');
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} — ${finding.name}`);
    console.error(`  Fix: ${finding.fix}`);
  }
  process.exit(1);
}

console.log('✅ Android 15 edge-to-edge guard passed.');
