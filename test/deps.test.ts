import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "..", "src");
const pkgPath = resolve(here, "..", "package.json");

// Regression test for the day-9 packaging bug: `typescript` is imported at runtime
// by src/imports.ts (the AST parser) but lived only in devDependencies, which
// `npm i -g` never installs. `scripts/prepush.sh` caught this — a bin invocation
// through a throwaway global-prefix install crashed with ERR_MODULE_NOT_FOUND
// because devDependencies are excluded from a package install of blastradius
// itself. This test pins the class of bug, not just the one package: every
// non-relative, non-`node:` import anywhere in src/ must be listed in
// package.json's "dependencies" (not just "devDependencies").
function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function externalImportsIn(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const specs: string[] = [];
  // Only real ESM import/export declarations, one per source line, so a doc
  // comment's example code (e.g. `from "pkg"` inside a `/** ... */` block)
  // is never mistaken for an actual dependency.
  const re = /^\s*(?:import|export)\b[^;\n]*\bfrom\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    specs.push(m[1]);
  }
  return specs.filter((s) => !s.startsWith(".") && !s.startsWith("node:"));
}

describe("every runtime import is a declared runtime dependency", () => {
  it("has no src/ import missing from package.json dependencies", () => {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const deps = new Set(Object.keys(pkg.dependencies ?? {}));
    const files = collectTsFiles(srcDir);
    const missing: string[] = [];
    for (const file of files) {
      for (const spec of externalImportsIn(file)) {
        if (!deps.has(spec)) missing.push(`${spec} (imported in ${file})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
