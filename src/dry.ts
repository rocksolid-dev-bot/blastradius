import { readDeclaredDependencies } from "./packageJson.js";
import { readLockfile } from "./lockfile/index.js";

export interface DryRow {
  name: string;
  range: string;
  installed: string;
  dev: boolean;
}

const MISSING = "missing";

/**
 * Cross-references declared dependencies (`package.json`) against what the
 * lockfile actually resolved, for one project directory.
 */
export function buildDryReport(dir: string): DryRow[] {
  const declared = readDeclaredDependencies(dir);
  const installed = readLockfile(dir);

  return declared.map((dep) => ({
    name: dep.name,
    range: dep.range,
    installed: installed.get(dep.name) ?? MISSING,
    dev: dep.dev,
  }));
}

/** Renders a `DryRow[]` as a fixed-width table for terminal output. */
export function formatDryReport(rows: DryRow[]): string {
  const header = ["package", "declared", "installed", "kind"];
  const lines = rows.map((r) => [r.name, r.range, r.installed, r.dev ? "dev" : "prod"]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...lines.map((line) => line[i]?.length ?? 0)),
  );
  const format = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");

  if (lines.length === 0) {
    return `${format(header)}\n(no dependencies declared)`;
  }
  return [format(header), ...lines.map(format)].join("\n");
}
