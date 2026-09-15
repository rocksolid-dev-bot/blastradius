import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface DeclaredDependency {
  name: string;
  range: string;
  dev: boolean;
}

interface RawPackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * Reads `package.json` in `dir` and returns every declared dependency
 * (production and dev) as a flat, name-sorted list.
 */
export function readDeclaredDependencies(dir: string): DeclaredDependency[] {
  const pkgPath = join(dir, "package.json");
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as RawPackageJson;

  const deps: DeclaredDependency[] = [];
  for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
    deps.push({ name, range, dev: false });
  }
  for (const [name, range] of Object.entries(pkg.devDependencies ?? {})) {
    deps.push({ name, range, dev: true });
  }
  deps.sort((a, b) => a.name.localeCompare(b.name));
  return deps;
}
