#!/usr/bin/env node
/**
 * build-atlas.mjs — refreshes the COMPUTED (metrics) layer of the Codebase Atlas.
 *
 * Reads the CURATED (judgment) layer from codebase-atlas/curated.json, recomputes
 * deterministic metrics from the working tree, merges them, writes
 * codebase-atlas/architecture-data.json, and re-injects the data inline into
 * codebase-atlas/index.html (the render JS is never touched here).
 *
 * The judgment layer (scores, risks, roadmap, narratives) is refreshed separately,
 * on demand, by re-running the `codebase-atlas` skill and editing curated.json.
 *
 * Usage:  npm run atlas   (or: node scripts/build-atlas.mjs)
 * Safe to run without a prior build; bundle metrics are simply omitted if dist/ is absent.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const ROOT = process.cwd();
const ATLAS = path.join(ROOT, 'codebase-atlas');
const CURATED = path.join(ATLAS, 'curated.json');
const DATA = path.join(ATLAS, 'architecture-data.json');
const HTML = path.join(ATLAS, 'index.html');

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}
function count(cmd) {
  try {
    return parseInt(sh(cmd).trim(), 10) || 0;
  } catch {
    return 0;
  }
}

// ---- 1. stats (mirror the find commands used to author the atlas) ----
const stats = {
  'Source files (.ts/.tsx)': count("find src -name '*.tsx' -o -name '*.ts' | wc -l"),
  'React components': count("find src/components -name '*.tsx' | wc -l"),
  'Custom hooks': count("find src/hooks -name '*.ts*' | wc -l"),
  'Service modules': count("find src/services -name '*.ts*' | wc -l"),
  'Route pages': count("find src/pages -maxdepth 1 -name '*.tsx' | wc -l"),
  'Feature modules': count('ls -1 src/features | wc -l'),
  'Test files': count("find src \\( -path '*__tests__*' -o -name '*.test.*' \\) | sort -u | wc -l"),
  'Supabase edge functions': count(
    'find supabase/functions -maxdepth 1 -type d | tail -n +2 | wc -l',
  ),
  'DB migrations': count("find supabase/migrations -name '*.sql' | wc -l"),
};

// ---- 2. god files (largest src modules by LOC) ----
function largestFiles(n) {
  let out = [];
  try {
    out = sh("find src -name '*.ts' -o -name '*.tsx'")
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(p => {
        let loc = 0;
        try {
          loc = readFileSync(path.join(ROOT, p), 'utf8').split('\n').length;
        } catch {}
        return { path: p, loc };
      })
      .sort((a, b) => b.loc - a.loc)
      .slice(0, n);
  } catch {}
  return out;
}
function godWhy(p, loc, notes) {
  if (notes && notes[p]) return notes[p];
  if (/types\.ts$/.test(p))
    return `Generated types (${loc} LOC) — keep generated-only, do not hand-edit`;
  if (/mockData\/|\/data\/|Mock|eventsMockData|polls\.ts/.test(p))
    return `Mock/data file (${loc} LOC) — large but low logic; gate behind dev/demo`;
  return `Large module (${loc} LOC) — decomposition candidate`;
}

// ---- 3. knip dead-code counts ----
function knipMetrics() {
  let raw = '';
  try {
    raw = execSync('npx knip --no-progress', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    raw = (e && (e.stdout || '')) || ''; // knip exits non-zero when it finds issues
  }
  if (!raw) return null;
  const grab = label => {
    const m = raw.match(new RegExp(label + '\\s*\\((\\d+)\\)', 'i'));
    return m ? parseInt(m[1], 10) : 0;
  };
  return {
    files: grab('Unused files'),
    deps: grab('Unused dependencies'),
    devDeps: grab('Unused devDependencies'),
    exports: grab('Unused exports'),
    types: grab('Unused exported types'),
  };
}

// ---- 4. bundle chunks (from dist/, if a build exists) ----
function bundleMetrics() {
  const dist = path.join(ROOT, 'dist');
  if (!existsSync(dist)) return [];
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const fp = path.join(dir, e);
      const st = statSync(fp);
      if (st.isDirectory()) walk(fp);
      else if (e.endsWith('.js')) files.push({ fp, size: st.size });
    }
  })(dist);
  return files
    .sort((a, b) => b.size - a.size)
    .slice(0, 8)
    .map(({ fp, size }) => {
      let gz = 0;
      try {
        gz = gzipSync(readFileSync(fp)).length;
      } catch {}
      const base = path.basename(fp).replace(/-[A-Za-z0-9_]{6,}(-[A-Za-z0-9_]+)?\.js$/, '');
      return {
        name: base || path.basename(fp),
        kb: Math.round(size / 1024),
        gzipKb: gz ? Math.round(gz / 1024) : null,
      };
    });
}

// ---- 5. assemble ----
const curated = JSON.parse(readFileSync(CURATED, 'utf8'));
const commit = (() => {
  try {
    return sh('git rev-parse --short HEAD').trim();
  } catch {
    return null;
  }
})();
const repo = curated.meta.repo || 'chravel-inc/chravel-web';

curated.meta.stats = stats;
curated.meta.generated = new Date().toISOString().slice(0, 10);
if (commit) {
  curated.meta.commit = commit;
  curated.meta.commitUrl = `https://github.com/${repo}/commit/${commit}`;
}
curated.meta.metrics = {
  knip: knipMetrics(),
  bundle: bundleMetrics(),
  anyCount: count("grep -rEo '(: any|as any)' src --include='*.ts' --include='*.tsx' | wc -l"),
  todoCount: count("grep -rEo 'TODO|FIXME|HACK' src --include='*.ts' --include='*.tsx' | wc -l"),
};
const notes = (curated.dependencies && curated.dependencies.godFileNotes) || {};
curated.dependencies = curated.dependencies || {};
curated.dependencies.godFiles = largestFiles(10).map(g => ({
  path: g.path,
  loc: g.loc,
  why: godWhy(g.path, g.loc, notes),
}));

// ---- 6. write data + re-inject inline into index.html ----
const json = JSON.stringify(curated, null, 2);
writeFileSync(DATA, json + '\n');
// Escape HTML-significant chars before embedding so a literal "</script>"
// (or "<!--") inside any curated string can't break out of the inline JSON
// <script> block. JSON.stringify does NOT escape these; the \uXXXX forms
// decode back to the originals via JSON.parse, so the data is unchanged at
// read time. The standalone architecture-data.json above keeps raw JSON.
const htmlSafeJson = json
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026');
let html = readFileSync(HTML, 'utf8');
const re = /<script id="atlas-data" type="application\/json">[\s\S]*?<\/script>/;
if (!re.test(html)) {
  console.error('ERROR: could not find <script id="atlas-data"> block in index.html');
  process.exit(1);
}
html = html.replace(
  re,
  () => '<script id="atlas-data" type="application/json">' + htmlSafeJson + '</script>',
);
writeFileSync(HTML, html);

console.log('atlas refreshed:');
console.log('  commit     ', commit || '(no git)');
console.log('  stats      ', JSON.stringify(stats));
console.log('  knip       ', JSON.stringify(curated.meta.metrics.knip));
console.log(
  '  bundle top ',
  curated.meta.metrics.bundle.map(b => b.name + ':' + b.kb + 'kB').join(', ') || '(no dist/)',
);
console.log(
  '  any/todo   ',
  curated.meta.metrics.anyCount + ' / ' + curated.meta.metrics.todoCount,
);
