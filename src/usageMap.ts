import { relative } from "node:path";
import type { DeclaredDependency } from "./packageJson.js";
import { extractImports, type SkippedImport } from "./imports.js";
import { walkSourceFiles } from "./walk.js";

export interface FileUsage {
  file: string;
  /** Named symbols this file imports, plus "default" / "* (namespace)" markers when used. */
  symbols: string[];
}

export interface PackageUsage {
  files: string[];
  symbols: string[];
  /** Per-file breakdown of which symbols each importing file uses — `--explain`'s file list. */
  perFile: FileUsage[];
  defaultImport: boolean;
  namespaceImport: boolean;
  /** True only when every import of this package in the codebase is type-only. */
  typeOnly: boolean;
  /**
   * From the declared-dependency `dev` flag in `package.json` (day 1). A
   * package imported only from dev-only files (tests, config) but declared
   * as a runtime dependency is NOT inferred as dev-only here — that
   * file-level heuristic is a TODO for a later day.
   */
  devOnly: boolean;
}

export interface UsageMap {
  packages: Record<string, PackageUsage>;
  skipped: SkippedImport[];
}

interface MutableFileUsage {
  symbols: Set<string>;
  defaultImport: boolean;
  namespaceImport: boolean;
}

interface MutablePackageUsage {
  files: Set<string>;
  symbols: Set<string>;
  perFile: Map<string, MutableFileUsage>;
  defaultImport: boolean;
  namespaceImport: boolean;
  allTypeOnly: boolean;
}

/**
 * Walks `root` (respecting `.gitignore`, always skipping `node_modules`,
 * `dist`, `.git`), parses every source file, and builds the package → usage
 * map: which files import each package, which named symbols they pull in,
 * and whether the package is used only for types.
 */
export function buildUsageMap(root: string, declaredDeps: DeclaredDependency[]): UsageMap {
  const devByName = new Map(declaredDeps.map((dep) => [dep.name, dep.dev]));
  const acc = new Map<string, MutablePackageUsage>();
  const skipped: SkippedImport[] = [];

  for (const file of walkSourceFiles(root)) {
    const { imports, skipped: fileSkipped } = extractImports(file);
    skipped.push(...fileSkipped);

    for (const record of imports) {
      let entry = acc.get(record.package);
      if (!entry) {
        entry = { files: new Set(), symbols: new Set(), perFile: new Map(), defaultImport: false, namespaceImport: false, allTypeOnly: true };
        acc.set(record.package, entry);
      }
      const relFile = relative(root, record.file).split("\\").join("/");
      entry.files.add(relFile);
      for (const symbol of record.namedSymbols) entry.symbols.add(symbol);
      if (record.defaultImport) entry.defaultImport = true;
      if (record.namespaceImport) entry.namespaceImport = true;
      if (!record.typeOnly) entry.allTypeOnly = false;

      let fileEntry = entry.perFile.get(relFile);
      if (!fileEntry) {
        fileEntry = { symbols: new Set(), defaultImport: false, namespaceImport: false };
        entry.perFile.set(relFile, fileEntry);
      }
      for (const symbol of record.namedSymbols) fileEntry.symbols.add(symbol);
      if (record.defaultImport) fileEntry.defaultImport = true;
      if (record.namespaceImport) fileEntry.namespaceImport = true;
    }
  }

  const packages: Record<string, PackageUsage> = {};
  for (const [pkg, entry] of [...acc.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const perFile: FileUsage[] = [...entry.perFile.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, fileEntry]) => {
        const symbols = [...fileEntry.symbols].sort();
        if (fileEntry.defaultImport) symbols.unshift("default");
        if (fileEntry.namespaceImport) symbols.push("* (namespace)");
        return { file, symbols };
      });

    packages[pkg] = {
      files: [...entry.files].sort(),
      symbols: [...entry.symbols].sort(),
      perFile,
      defaultImport: entry.defaultImport,
      namespaceImport: entry.namespaceImport,
      typeOnly: entry.allTypeOnly,
      devOnly: devByName.get(pkg) ?? false,
    };
  }

  return { packages, skipped };
}
