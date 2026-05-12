#!/usr/bin/env node
/**
 * Schema-Drift Linter
 *
 * Walks every TS/TSX file under src/ and validates that columns referenced in
 *   supabase.from('<table>').select('<cols>')
 * exist in the generated types in src/integrations/supabase/types.ts.
 *
 * Handles:
 *   - String literals, no-substitution template literals, and string concatenation
 *     (e.g. `.select('a, b, ' + 'c')`).
 *   - Postgrest relation/embed syntax:
 *       creator:profiles(display_name)
 *       trips!inner(id, name)
 *       trip_members!fk_trip_id(role, profiles(display_name))
 *   - Postgrest aliases (`alias:column`), JSON traversal (`col->path`,
 *     `col->>'key'`), and type casts (`col::text`).
 *   - Wildcards (`*`) and the bare `count` aggregate.
 *
 * Tables that do not appear in types.ts are reported as drift WARNINGS unless
 * listed in IGNORE_UNKNOWN_TABLES below. Missing columns on a known table are
 * ERRORS and fail the script.
 *
 * Usage:
 *   npx tsx scripts/check-schema-drift.ts
 *   npx tsx scripts/check-schema-drift.ts --warn-unknown-tables
 *
 * Exit codes:
 *   0 = no column drift on known tables
 *   1 = column drift detected (or unknown-table errors when --strict)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(process.cwd());
const SRC_DIR = path.join(ROOT, 'src');
const TYPES_FILE = path.join(SRC_DIR, 'integrations', 'supabase', 'types.ts');

// Tables knowingly referenced from code but not present in types.ts.
// Empty by default — every public table the app touches should be modelled.
// Add a name here only with a tracked migration follow-up.
const IGNORE_UNKNOWN_TABLES = new Set<string>([]);

// File globs to skip entirely.
const SKIP_FILE_PATTERNS = [/\.test\.(ts|tsx)$/, /__tests__\//, /\.stories\.tsx$/];

interface Issue {
  file: string;
  line: number;
  table: string;
  column?: string;
  severity: 'error' | 'warning';
  message: string;
}

// ---------------------------------------------------------------------------
// 1. Parse types.ts → Map<table, Set<column>>
// ---------------------------------------------------------------------------

function loadSchema(typesPath: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const source = ts.createSourceFile(
    typesPath,
    fs.readFileSync(typesPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );

  function memberName(member: ts.TypeElement): string | null {
    if (!ts.isPropertySignature(member) || !member.name) return null;
    if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
      return member.name.text;
    }
    return null;
  }

  function findMember(type: ts.TypeNode | undefined, name: string): ts.PropertySignature | null {
    if (!type || !ts.isTypeLiteralNode(type)) return null;
    for (const m of type.members) {
      if (ts.isPropertySignature(m) && memberName(m) === name) {
        return m;
      }
    }
    return null;
  }

  function extractColumnSet(rowType: ts.TypeNode | undefined): Set<string> {
    const cols = new Set<string>();
    if (!rowType || !ts.isTypeLiteralNode(rowType)) return cols;
    for (const colMember of rowType.members) {
      const name = memberName(colMember);
      if (name) cols.add(name);
    }
    return cols;
  }

  function walkSection(sectionNode: ts.PropertySignature) {
    if (!sectionNode.type || !ts.isTypeLiteralNode(sectionNode.type)) return;
    for (const tableMember of sectionNode.type.members) {
      const tableName = memberName(tableMember);
      if (!tableName) continue;
      if (!ts.isPropertySignature(tableMember)) continue;
      const rowSig = findMember(tableMember.type, 'Row');
      if (!rowSig) continue;
      const cols = extractColumnSet(rowSig.type);
      if (cols.size === 0) continue;
      tables.set(tableName, cols);
    }
  }

  function visit(node: ts.Node) {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === 'Database') {
      // Database = { public: { Tables: {...}, Views: {...}, ... }, ... }
      if (ts.isTypeLiteralNode(node.type)) {
        for (const schemaMember of node.type.members) {
          if (!ts.isPropertySignature(schemaMember)) continue;
          const tablesSig = findMember(schemaMember.type, 'Tables');
          const viewsSig = findMember(schemaMember.type, 'Views');
          if (tablesSig) walkSection(tablesSig);
          if (viewsSig) walkSection(viewsSig);
        }
      }
    }
    node.forEachChild(visit);
  }

  visit(source);
  return tables;
}

// ---------------------------------------------------------------------------
// 2. Parse a select() argument literal into a list of column references.
// ---------------------------------------------------------------------------

/** Returns null if the argument is dynamic (contains an expression we can't statically evaluate). */
function readSelectLiteral(arg: ts.Expression): string | null {
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return arg.text;
  }
  if (ts.isTemplateExpression(arg)) {
    // Templates with no ${...} parts shouldn't reach here; if they do, dynamic.
    return null;
  }
  if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = readSelectLiteral(arg.left);
    const right = readSelectLiteral(arg.right);
    if (left === null || right === null) return null;
    return left + right;
  }
  if (ts.isParenthesizedExpression(arg)) {
    return readSelectLiteral(arg.expression);
  }
  return null;
}

/** Split a select string by top-level commas, ignoring commas inside parens. */
function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      if (buf.trim().length > 0) parts.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim().length > 0) parts.push(buf.trim());
  return parts;
}

/** A parsed select token: either a column on the current table, or a relation embed. */
type Token =
  | { kind: 'column'; name: string }
  | { kind: 'wildcard' }
  | { kind: 'aggregate' } // bare `count`
  | { kind: 'relation'; relation: string; inner: string };

function parseToken(raw: string): Token | null {
  let s = raw.trim();
  if (s.length === 0) return null;

  // Strip alias prefix `alias:rest`, but only at the top level and only when
  // the next character is not `:` (Postgres `::` cast operator). When the
  // alias itself matches a table name (e.g. `profiles:added_by(display_name)`,
  // postgrest interprets this as "use FK `added_by` to embed table
  // `profiles`"), keep the alias around so the relation handler can prefer
  // it over the FK hint.
  let aliasHint: string | null = null;
  const aliasMatch = s.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:(?!:)\s*(.*)$/s);
  if (aliasMatch) {
    aliasHint = aliasMatch[1];
    s = aliasMatch[2];
  }

  // Relation form: `name(...)` possibly with `!hint` modifier.
  const parenIdx = s.indexOf('(');
  if (parenIdx >= 0 && s.endsWith(')')) {
    let head = s.slice(0, parenIdx).trim();
    const inner = s.slice(parenIdx + 1, -1);
    // Strip `!hint`/`!inner`/fk constraint name from head.
    const bang = head.indexOf('!');
    if (bang >= 0) head = head.slice(0, bang).trim();
    if (!head) return null;
    // Pack the alias into the relation field as `alias|head` so the resolver
    // downstream can pick whichever is a known table. We can't decide here
    // without the schema map.
    if (aliasHint && aliasHint !== head) {
      return { kind: 'relation', relation: `${aliasHint}|${head}`, inner };
    }
    return { kind: 'relation', relation: head, inner };
  }

  if (s === '*') return { kind: 'wildcard' };
  if (s === 'count') return { kind: 'aggregate' };

  // Strip JSON traversal (`col->path`, `col->>'key'`) and casts (`col::text`).
  s = s.split('->')[0];
  s = s.split('::')[0];
  s = s.trim();
  if (!s) return null;

  // Modifiers like `.column.asc` aren't valid in select(); ignore anything
  // after a dot (relation-qualified columns aren't a select-list feature).
  const colName = s.split(/[\s.]/)[0];
  if (!colName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(colName)) return null;
  return { kind: 'column', name: colName };
}

// ---------------------------------------------------------------------------
// 3. Validate a select string against a table.
// ---------------------------------------------------------------------------

function validateSelect(
  selectStr: string,
  tableName: string,
  schema: Map<string, Set<string>>,
  file: string,
  line: number,
  issues: Issue[],
  unknownTablesSeen: Set<string>,
) {
  const cols = schema.get(tableName);
  if (!cols) {
    if (!IGNORE_UNKNOWN_TABLES.has(tableName)) {
      unknownTablesSeen.add(tableName);
      issues.push({
        file,
        line,
        table: tableName,
        severity: 'warning',
        message: `Unknown table '${tableName}' — not present in types.ts`,
      });
    }
    return;
  }

  for (const part of splitTopLevel(selectStr)) {
    const tok = parseToken(part);
    if (!tok) continue;
    if (tok.kind === 'wildcard' || tok.kind === 'aggregate') continue;

    if (tok.kind === 'column') {
      if (!cols.has(tok.name)) {
        issues.push({
          file,
          line,
          table: tableName,
          column: tok.name,
          severity: 'error',
          message: `Column '${tok.name}' not found on table '${tableName}'`,
        });
      }
      continue;
    }

    // Relation embed.
    // The embed target may be (a) a related table name, or (b) a foreign-key
    // column / constraint hint with an alias that names the actual table.
    // parseToken packs both as `alias|head` when an alias is present;
    // resolve by preferring whichever side is a known table.
    const candidates = tok.relation.split('|');
    const resolved = candidates.find(c => schema.has(c));
    if (resolved) {
      validateSelect(tok.inner, resolved, schema, file, line, issues, unknownTablesSeen);
    }
    // (Unknown relation targets are silently skipped — too noisy and we
    //  have no reliable way to resolve hint → table from types alone.)
  }
}

// ---------------------------------------------------------------------------
// 4. Walk source files and collect every from('x').select(...) chain.
// ---------------------------------------------------------------------------

function findSourceFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...findSourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      if (SKIP_FILE_PATTERNS.some(re => re.test(full))) continue;
      out.push(full);
    }
  }
  return out;
}

/** Returns the immediate property-access receiver of an expression, or null. */
function leftOfPropertyAccess(expr: ts.Expression): ts.Expression | null {
  if (ts.isPropertyAccessExpression(expr)) return expr.expression;
  return null;
}

/** Extract the .from('table') anchor of a chain ending at the given call. */
function findFromAnchor(expr: ts.Expression): { table: string; isStorage: boolean } | null {
  // Walk back through PropertyAccess and CallExpression nodes.
  let cur: ts.Expression | undefined = expr;
  while (cur) {
    if (ts.isCallExpression(cur) && ts.isPropertyAccessExpression(cur.expression)) {
      const methodName = cur.expression.name.text;
      if (methodName === 'from' && cur.arguments.length >= 1) {
        const arg = cur.arguments[0];
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
          const receiver = cur.expression.expression;
          // Skip supabase.storage.from('bucket')
          const isStorage =
            ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'storage';
          return { table: arg.text, isStorage };
        }
        return null; // dynamic table — can't statically check
      }
      cur = cur.expression.expression;
      continue;
    }
    if (ts.isPropertyAccessExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    return null;
  }
  return null;
}

interface Hit {
  table: string;
  selectArg: ts.Expression;
  callNode: ts.CallExpression;
}

function collectSelectCalls(source: ts.SourceFile): Hit[] {
  const hits: Hit[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'select' &&
      node.arguments.length >= 1
    ) {
      const anchor = findFromAnchor(node.expression.expression);
      if (anchor && !anchor.isStorage) {
        hits.push({ table: anchor.table, selectArg: node.arguments[0], callNode: node });
      }
    }
    node.forEachChild(visit);
  }
  visit(source);
  return hits;
}

// ---------------------------------------------------------------------------
// 5. Main
// ---------------------------------------------------------------------------

function main() {
  const args = new Set(process.argv.slice(2));
  const strict = args.has('--strict');

  if (!fs.existsSync(TYPES_FILE)) {
    console.error(`[schema-drift] types.ts not found at ${TYPES_FILE}`);
    process.exit(2);
  }
  const schema = loadSchema(TYPES_FILE);
  if (schema.size === 0) {
    console.error('[schema-drift] Failed to parse any tables from types.ts');
    process.exit(2);
  }

  const issues: Issue[] = [];
  const unknownTablesSeen = new Set<string>();
  const files = findSourceFiles(SRC_DIR);

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes('.from(')) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

    for (const hit of collectSelectCalls(source)) {
      const literal = readSelectLiteral(hit.selectArg);
      if (literal === null) continue; // dynamic select — can't check
      const { line } = source.getLineAndCharacterOfPosition(hit.callNode.getStart());
      validateSelect(
        literal,
        hit.table,
        schema,
        path.relative(ROOT, file),
        line + 1,
        issues,
        unknownTablesSeen,
      );
    }
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  if (warnings.length) {
    console.warn(`\n[schema-drift] ${warnings.length} warning(s):`);
    // Deduplicate unknown-table warnings to one line per table.
    const byTable = new Map<string, Issue[]>();
    for (const w of warnings) {
      if (!byTable.has(w.table)) byTable.set(w.table, []);
      byTable.get(w.table)!.push(w);
    }
    for (const [table, ws] of byTable) {
      console.warn(
        `  • unknown table '${table}' (${ws.length} call site${ws.length === 1 ? '' : 's'})`,
      );
      for (const w of ws.slice(0, 3)) console.warn(`      ${w.file}:${w.line}`);
      if (ws.length > 3) console.warn(`      … and ${ws.length - 3} more`);
    }
  }

  if (errors.length) {
    console.error(`\n[schema-drift] ${errors.length} error(s):`);
    for (const e of errors) {
      console.error(`  ${e.file}:${e.line}  ${e.message}`);
    }
  }

  console.log(
    `\n[schema-drift] Scanned ${files.length} files, ${schema.size} known tables/views, ${unknownTablesSeen.size} unknown table(s), ${errors.length} error(s), ${warnings.length} warning(s).`,
  );

  if (errors.length > 0) process.exit(1);
  if (strict && warnings.length > 0) process.exit(1);
  process.exit(0);
}

main();
