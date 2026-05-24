#!/usr/bin/env node
const { execSync } = require('node:child_process');

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function safe(cmd, fallback = '') {
  try {
    return sh(cmd);
  } catch {
    return fallback;
  }
}

function lines(cmd) {
  return safe(cmd).split('\n').filter(Boolean);
}

function fileLoc(file) {
  const count = safe(`wc -l < "${file}"`, '0').trim();
  return Number.parseInt(count, 10) || 0;
}

const tsFiles = lines('rg --files src | rg "\\.(ts|tsx)$"');
const hotspots = tsFiles
  .map(f => ({ file: f, loc: fileLoc(f) }))
  .filter(x => x.loc >= 500)
  .sort((a, b) => b.loc - a.loc);

const lintOutput = safe('npm run -s lint:check', '');
const lintSummary = lintOutput.match(
  /✖\s+(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/,
);
const lintErrors = lintSummary ? Number.parseInt(lintSummary[2], 10) : 0;
const lintWarnings = lintSummary ? Number.parseInt(lintSummary[3], 10) : 0;

const typecheckOk = safe('npm run -s typecheck >/dev/null 2>&1; echo $?', '1') === '0';

const deadFileCandidates = safe("rg -n 'patch_tripchat|resolver3\\.js' -g '*'", '')
  .split('\n')
  .filter(Boolean).length;

const health = {
  generatedAt: new Date().toISOString(),
  maintainability: {
    hotspotCount500Plus: hotspots.length,
    topHotspots: hotspots.slice(0, 8),
    lintWarnings,
    lintErrors,
  },
  architecture: {
    hasStoreDir: safe('test -d src/store && echo yes', '') === 'yes',
    hasStoresDir: safe('test -d src/stores && echo yes', '') === 'yes',
  },
  qualityGates: {
    typecheckPass: typecheckOk,
  },
  deadCode: {
    knownLegacyArtifactMatches: deadFileCandidates,
  },
};

console.log(JSON.stringify(health, null, 2));
