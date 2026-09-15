import { readDeclaredDependencies } from "./packageJson.js";
import { readLockfile } from "./lockfile/index.js";
import { buildUsageMap } from "./usageMap.js";
import type { SkippedImport } from "./imports.js";
import { classifyJump, type SemverJump } from "./semver.js";
import { scoreDependency, type Band } from "./scoring.js";
import { fetchFromNpmRegistry, queryRegistry, type RegistryFetch, type QueryRegistryOptions } from "./registry.js";

/** Schema marker for `--json` output — bump when the shape changes. */
export const SCHEMA_VERSION = 1;

export interface DependencyReport {
  name: string;
  declared: string;
  installed: string;
  latest: string | null;
  registryStatus: "ok" | "unknown";
  deprecated: boolean;
  jump: SemverJump;
  dev: boolean;
  files: string[];
  symbols: string[];
  namespaceImport: boolean;
  typeOnly: boolean;
  devOnly: boolean;
  unused: boolean;
  score: number;
  band: Band;
}

export interface FullReport {
  schemaVersion: number;
  dependencies: DependencyReport[];
  skipped: SkippedImport[];
}

export interface BuildFullReportOptions {
  fetcher?: RegistryFetch;
  registry?: QueryRegistryOptions;
}

const MISSING = "missing";

/**
 * Assembles the full ranked report for `dir`: declared deps, installed
 * versions, usage map, registry data, semver jump, and score — sorted by
 * score descending (the thing to look at first is on line one).
 */
export async function buildFullReport(dir: string, options: BuildFullReportOptions = {}): Promise<FullReport> {
  const declared = readDeclaredDependencies(dir);
  const installed = readLockfile(dir);
  const { packages: usage, skipped } = buildUsageMap(dir, declared);

  const fetcher = options.fetcher ?? fetchFromNpmRegistry;
  const registryInfo = await queryRegistry(
    declared.map((d) => d.name),
    fetcher,
    options.registry,
  );

  const dependencies: DependencyReport[] = declared.map((dep) => {
    const installedVersion = installed.get(dep.name) ?? MISSING;
    const info = registryInfo.get(dep.name);
    const latest = info?.latest ?? null;
    const deprecated = info?.deprecated ?? false;
    const registryStatus = info?.status ?? "unknown";
    const compareFrom = installedVersion !== MISSING ? installedVersion : dep.range;
    const jump = classifyJump(compareFrom, latest);
    const packageUsage = usage[dep.name];

    const { score, band, unused } = scoreDependency({
      jump,
      deprecated,
      declared: true,
      usage: packageUsage,
    });

    return {
      name: dep.name,
      declared: dep.range,
      installed: installedVersion,
      latest,
      registryStatus,
      deprecated,
      jump,
      dev: dep.dev,
      files: packageUsage?.files ?? [],
      symbols: packageUsage?.symbols ?? [],
      namespaceImport: packageUsage?.namespaceImport ?? false,
      typeOnly: packageUsage?.typeOnly ?? false,
      devOnly: packageUsage?.devOnly ?? false,
      unused,
      score,
      band,
    };
  });

  dependencies.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return { schemaVersion: SCHEMA_VERSION, dependencies, skipped };
}
