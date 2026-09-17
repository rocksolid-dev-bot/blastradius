import { readDeclaredDependencies } from "./packageJson.js";
import { readLockfile } from "./lockfile/index.js";
import { buildUsageMap, type FileUsage } from "./usageMap.js";
import { classifyJump } from "./semver.js";
import { scoreDependency, type Band, type ScoreBreakdown } from "./scoring.js";
import { fetchFromNpmRegistry, queryRegistry, type RegistryFetch, type QueryRegistryOptions } from "./registry.js";

const MISSING = "missing";

/** Thrown when `--explain <package>` names a package not in `package.json` at all. */
export class PackageNotDeclaredError extends Error {
  constructor(public readonly packageName: string) {
    super(`package "${packageName}" is not declared in package.json`);
    this.name = "PackageNotDeclaredError";
  }
}

export interface ExplainResult {
  name: string;
  score: number;
  band: Band;
  breakdown: ScoreBreakdown;
  perFile: FileUsage[];
}

export interface BuildExplainOptions {
  fetcher?: RegistryFetch;
  registry?: QueryRegistryOptions;
}

/**
 * The consumer `breakdown` (scoring.ts) and `perFile` (usageMap.ts) were
 * collected for: a single-package deep dive. Text renderer only — the
 * `--json` shape stays frozen at `schemaVersion: 1` and gains no
 * `breakdown` key from this (see docs/json-schema.md and test/cli.test.ts's
 * pinned-shape assertion).
 */
export async function buildExplainReport(
  dir: string,
  packageName: string,
  options: BuildExplainOptions = {},
): Promise<ExplainResult> {
  const declared = readDeclaredDependencies(dir);
  const dep = declared.find((d) => d.name === packageName);
  if (!dep) {
    // Fails before any registry fetch, same as report.ts's own
    // no-package.json case — a usage error, not a network round trip.
    throw new PackageNotDeclaredError(packageName);
  }

  const installed = readLockfile(dir);
  const { packages: usage } = buildUsageMap(dir, declared);

  const fetcher = options.fetcher ?? fetchFromNpmRegistry;
  const registryInfo = await queryRegistry([dep.name], fetcher, options.registry);

  const installedVersion = installed.get(dep.name) ?? MISSING;
  const info = registryInfo.get(dep.name);
  const latest = info?.latest ?? null;
  const deprecated = info?.deprecated ?? false;
  const compareFrom = installedVersion !== MISSING ? installedVersion : dep.range;
  const jump = classifyJump(compareFrom, latest);
  const packageUsage = usage[dep.name];

  const { score, band, breakdown } = scoreDependency({
    jump,
    deprecated,
    declared: true,
    usage: packageUsage,
  });

  return {
    name: dep.name,
    score,
    band,
    breakdown,
    perFile: packageUsage?.perFile ?? [],
  };
}

/**
 * Renders `--explain`'s text-only report: final score and band, then every
 * scoring component with its value, every multiplier with its factor, then
 * the file list from `perFile` with the symbols each file uses — in that
 * order, per TODAY.md.
 */
export function formatExplain(result: ExplainResult): string {
  const lines: string[] = [];
  lines.push(`${result.name}: score ${result.score} (${result.band})`);
  lines.push("");
  lines.push("components:");
  for (const c of result.breakdown.components) {
    lines.push(`  ${c.label}: ${c.value}`);
  }
  lines.push("multipliers:");
  for (const m of result.breakdown.multipliers) {
    lines.push(`  ${m.label}: x${m.value}`);
  }
  lines.push("");
  if (result.perFile.length === 0) {
    lines.push("files: (none — package is not imported anywhere)");
  } else {
    lines.push("files:");
    for (const f of result.perFile) {
      const symbols = f.symbols.length > 0 ? f.symbols.join(", ") : "(no named symbols)";
      lines.push(`  ${f.file}: ${symbols}`);
    }
  }
  return lines.join("\n");
}
