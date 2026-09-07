#!/usr/bin/env bun
/**
 * map.ts — генерирует компактную карту проекта для AI-агента.
 *
 * Использование: bun run scripts/map.ts
 * Вывод: JSON в stdout (~4 KB)
 *
 * Всё добывается динамически — ни одного хардкод-лейбла или маппинга.
 */

import { Glob } from "bun";
import path from "path";

const ROOT = path.resolve(import.meta.dir ?? ".", "..");

// ═══════════════════════════════════════════════
//  Package.json — просто читаем и отдаём ключевые поля
// ═══════════════════════════════════════════════

async function readPkg() {
  let raw = "{}";
  try { raw = await Bun.file(path.join(ROOT, "package.json")).text(); } catch {}
  const pkg = JSON.parse(raw);
  return {
    name: pkg.name ?? null,
    packageManager: pkg.packageManager ?? null,
    scripts: pkg.scripts ? Object.keys(pkg.scripts) : [],
    deps: pkg.dependencies ? Object.keys(pkg.dependencies) : [],
    devDeps: pkg.devDependencies ? Object.keys(pkg.devDependencies) : [],
  };
}

// ═══════════════════════════════════════════════
//  DB schema — из db/schema.ts (idb + TS interfaces)
// ═══════════════════════════════════════════════

function parseDbSchema(code: string): string[] {
  // Парсим createObjectStore из upgrade(d) { ... }
  const stores: string[] = [];
  const storeRe = /createObjectStore\(['"](\w+)['"](?:,\s*\{[^}]*keyPath:\s*['"](\w+)['"][^}]*\})?\)/g;
  let m: RegExpExecArray | null;
  while ((m = storeRe.exec(code)) !== null) {
    stores.push(m[2] ? `${m[1]}(key: ${m[2]})` : m[1]);
  }
  return stores;
}

function parseDbTypes(code: string): string[] {
  const types: string[] = [];
  // interface с полями
  const ifaceRe = /export\s+interface\s+(\w+)\s*\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ifaceRe.exec(code)) !== null) {
    const name = m[1]!;
    const body = m[2]!;
    const fields = [...body.matchAll(/\b(\w+)\s*[?:]\s*([^\n]+)/g)]
      .map(f => `${f[1]}: ${f[2]!.trim()}`);
    if (fields.length > 0 && fields.length <= 15) {
      types.push(`${name} { ${fields.join('; ')} }`);
    } else if (fields.length > 15) {
      types.push(`${name} { ${fields.slice(0, 8).join('; ')}; ...+${fields.length - 8} }`);
    }
  }
  // Простые type alias
  const typeRe = /export\s+type\s+(\w+)\s*=\s*([^\n]+)/g;
  while ((m = typeRe.exec(code)) !== null) {
    types.push(`${m[1]} = ${m[2]!.trim()}`);
  }
  return types;
}

// ═══════════════════════════════════════════════
//  Module parsing — импорты/экспорты из любого файла
// ═══════════════════════════════════════════════

interface Module {
  path: string;
  exports?: string[];
  deps?: string[];
}

function parseImports(code: string): string[] {
  const deps = new Set<string>();
  const re = /import\s+(?:(?:\{[^}]*\}|[^;{]+)\s+from\s+)?["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const spec = m[1]!;
    if (spec.startsWith(".")) deps.add(spec);
  }
  return [...deps];
}

function parseExports(code: string): string[] {
  const exps = new Set<string>();

  const patterns = [
    /export\s+default\s+function\s+(\w+)/g,
    /export\s+default\s+(\w+)\s*(?=[;({])/g,
    /export\s+(?:async\s+)?function\s+(\w+)/g,
    /export\s+const\s+(\w+)/g,
    /export\s+(?:interface|type)\s+(\w+)/g,
    /export\s+class\s+(\w+)/g,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(code)) !== null) exps.add(m[1]!);
  }

  const namedRe = /export\s+\{\s*([^}]+)\s*\}/g;
  let namedM: RegExpExecArray | null;
  while ((namedM = namedRe.exec(code)) !== null) {
    for (const token of namedM[1]!.split(",")) {
      const name = token.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) exps.add(name);
    }
  }

  return [...exps];
}

function resolveRelative(rel: string, fromFile: string): string {
  const dir = path.dirname(fromFile);
  const abs = path.resolve(ROOT, dir, rel);
  let result = path.relative(ROOT, abs);
  result = result.replace(/\.(ts|tsx|js|jsx)$/, "");
  result = result.replace(/\/index$/, "");
  return result;
}

// ═══════════════════════════════════════════════
//  Prefix table — сжатие повторяющихся путей
// ═══════════════════════════════════════════════

function buildPrefixTable(paths: string[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join("/");
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
  }
  const table = new Map<string, string>();
  let next = 0;
  const candidates = [...counts.entries()]
    .filter(([_, c]) => c >= 4)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [prefix] of candidates) {
    table.set(prefix, String.fromCharCode(65 + next++));
  }
  return table;
}

function compressPath(p: string, table: Map<string, string>): string {
  for (const [prefix, code] of table) {
    if (p.startsWith(prefix + "/")) {
      return code + ":" + p.slice(prefix.length + 1);
    }
  }
  return p;
}

function filenameOf(p: string): string {
  const slash = p.lastIndexOf("/");
  return slash >= 0 ? p.slice(slash + 1) : p;
}

// ═══════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════

let dbCode = "";
try { dbCode = await Bun.file(path.join(ROOT, "src/db/schema.ts")).text(); } catch {}
const dbTables = parseDbSchema(dbCode);
const dbTypes = parseDbTypes(dbCode);
const db = dbTables.length > 0 ? `IndexedDB: ${dbTables.join(" | ")}` : undefined;

// Собираем все пути для построения prefix table
const allFiles: string[] = [];
const allDeps: string[] = [];

for await (const file of new Glob("src/**/*.{ts,tsx}").scan(".")) {
  if (file.endsWith(".d.ts")) continue;
  allFiles.push(file);
  const code = await Bun.file(file).text();
  for (const d of parseImports(code)) {
    allDeps.push(resolveRelative(d, file));
  }
}

const prefixTable = buildPrefixTable([...allFiles, ...allDeps]);

// Модули
const modules: Module[] = [];

for (const file of allFiles) {
  const code = await Bun.file(file).text();
  const rawDeps = parseImports(code);

  modules.push({
    path: file,
    exports: parseExports(code),
    deps: rawDeps.map((d) => resolveRelative(d, file)),
  });
}

modules.sort((a, b) => a.path.localeCompare(b.path));

for (const m of modules) {
  if (m.exports?.length === 0) delete m.exports;
  if (m.deps?.length === 0) delete m.deps;
}

// ── Вывод ─────────────────────────────────────

const output: Record<string, unknown> = {};

if (db) output.db = db;
if (dbTypes.length > 0) output.types = dbTypes;
if (prefixTable.size > 0) {
  const pt: Record<string, string> = {};
  for (const [k, v] of prefixTable) pt[v] = k;
  output.pt = pt;
}
output.mods = modules.map(({ path: p, exports, deps }) => {
  const m: Record<string, unknown> = { p: compressPath(p, prefixTable) };
  if (exports) m.e = exports;
  if (deps) m.d = deps.map((d) => filenameOf(d));
  return m;
});

console.log(JSON.stringify(output));
