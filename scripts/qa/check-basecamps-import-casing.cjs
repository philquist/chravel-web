#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const srcDir = path.join(root, 'src');

const forbiddenPatterns = [
  /BaseCampsPanel/, // wrong camel split
  /baseCampsPanel/, // wrong file casing
  /places\/baseCamps(\/|$)/, // wrong utils casing inside places path
  /utils\/basecamps(\/|$)/, // should be baseCamps
];

const importPattern = /from\s+['\"]([^'\"]+)['\"]/g;
const bad = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
    const content = fs.readFileSync(full, 'utf8');
    let m;
    while ((m = importPattern.exec(content)) !== null) {
      const spec = m[1];
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(spec)) {
          bad.push({ file: path.relative(root, full), spec });
          break;
        }
      }
    }
  }
}

(function walkAll(dir){
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAll(full);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      const content = fs.readFileSync(full, 'utf8');
      let m;
      while ((m = importPattern.exec(content)) !== null) {
        const spec = m[1];
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(spec)) {
            bad.push({ file: path.relative(root, full), spec });
            break;
          }
        }
      }
    }
  }
})(srcDir);

if (bad.length) {
  console.error('Found potentially case-sensitive Basecamps import issues:');
  bad.forEach(({ file, spec }) => console.error(`- ${file}: ${spec}`));
  process.exit(1);
}

console.log('Basecamps casing guard passed.');
