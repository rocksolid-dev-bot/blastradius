#!/usr/bin/env node
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildDryReport, formatDryReport } from "./dry.js";
import { buildFullReport, type BuildFullReportOptions } from "./report.js";
import { formatTable } from "./table.js";
import { detectMonorepoMarker } from "./monorepo.js";
import { detectLockfileManager, UnsupportedLockfileError } from "./lockfile/index.js";
import { buildExplainReport, formatExplain, PackageNotDeclaredError, type BuildExplainOptions } from "./explain.js";
import type { Band } from "./scoring.js";

const HELP = `blastradius — rank outdated dependencies by blast radius, not alphabet

Usage:
  blastradius [dir]                    Ranked table: registry + usage + score (npm, pnpm, or yarn classic)
  blastradius --json [dir]             Same report as machine-readable JSON on stdout
  blastradius --dry [dir]              Print declared vs. installed versions only, no registry call
  blastradius --fail-on <band> [dir]   Exit 1 if any dependency scores at or above <band> (review|urgent)
  blastradius --root-only [dir]        Monorepo escape hatch: analyze the root package.json only
  blastradius --explain <pkg> [dir]    Print the score breakdown and per-file usage for one package
  blastradius --help                   Show this help and exit

[dir] defaults to the current directory. Registry lookups are cached for 24h
in $XDG_CACHE_HOME/blastradius (or ~/.cache/blastradius); a lookup that
fails for any reason (offline, timeout, 429/5xx, bad body) renders as
"unknown" rather than crashing the run.

A workspace root (\`workspaces\` in package.json, pnpm-workspace.yaml, or
lerna.json) is refused by default — half-support produces a confidently
wrong answer. Pass --root-only to analyze the root package.json alone.

Exit codes:
  0  success — --fail-on's band was not reached (or --fail-on was not given)
  1  --fail-on's band was reached by at least one dependency
  2  usage error — unknown flag, invalid --fail-on value, or no package.json found
  3  monorepo detected and refused (see --root-only)
`;

const BAND_RANK: Record<Band, number> = { ok: 0, review: 1, urgent: 2 };
const KNOWN_FLAGS = new Set(["--json", "--dry", "--help", "-h", "--fail-on", "--root-only", "--explain"]);

function firstNonFlag(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--fail-on" || a === "--explain") {
      i++; // skip the value that belongs to this flag
      continue;
    }
    if (!a.startsWith("-")) return a;
  }
  return undefined;
}

/**
 * Runs `--explain <package>`: a text-only score-breakdown-and-usage report
 * for one named package. Exported (mirroring `runReport`) so tests can
 * drive it directly with an injected registry fetcher.
 */
export async function runExplain(
  dir: string,
  packageName: string,
  options: BuildExplainOptions = {},
): Promise<number> {
  try {
    const result = await buildExplainReport(dir, packageName, options);
    process.stdout.write(`${formatExplain(result)}\n`);
    return 0;
  } catch (err) {
    if (err instanceof PackageNotDeclaredError) {
      process.stderr.write(`blastradius: ${err.message}\n`);
      return 2;
    }
    if (err instanceof UnsupportedLockfileError) {
      process.stderr.write(`blastradius: ${err.message}\n`);
      return 2;
    }
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr?.code === "ENOENT") {
      process.stderr.write(
        `blastradius: no package.json (or lockfile) found in ${dir}${nodeErr.path ? ` (${nodeErr.path})` : ""}\n`,
      );
      return 2;
    }
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`blastradius --explain failed: ${message}\n`);
    return 1;
  }
}

/**
 * Runs the full report (registry + usage + score) and writes it as either
 * the ranked table or `--json`. Exported so tests can drive it directly
 * with an injected registry fetcher — the CLI never hits the network in
 * this suite.
 *
 * `failOn` composes with `jsonMode`: the JSON document is still the only
 * thing on stdout, and the exit code reflects whether `failOn`'s band was
 * reached, printing the offending package names to stderr so a red CI run
 * says why without anyone re-running it locally.
 */
export async function runReport(
  dir: string,
  jsonMode: boolean,
  options: BuildFullReportOptions & { failOn?: Band; rootOnly?: boolean } = {},
): Promise<number> {
  const { failOn, rootOnly, ...reportOptions } = options;

  if (!rootOnly) {
    const marker = detectMonorepoMarker(dir);
    if (marker) {
      process.stderr.write(
        `blastradius: refusing to run — monorepo marker found (${marker}).\n` +
          `Workspace packages are not analyzed yet; a workspace root's package.json\n` +
          `lists almost no real dependencies and would print a near-empty, misleading\n` +
          `table. Pass --root-only to analyze the root package.json alone.\n`,
      );
      return 3;
    }
  } else {
    process.stdout.write("note: --root-only — analyzing the root package.json only, not any workspace packages\n");
  }

  let report;
  try {
    report = await buildFullReport(dir, reportOptions);
  } catch (err) {
    if (err instanceof UnsupportedLockfileError) {
      // A recognised-but-unreadable lockfile (wrong version, berry, etc.) is
      // a usage error, not a crash: the message already names the file and
      // the version/shape found, so it is printed verbatim.
      process.stderr.write(`blastradius: ${err.message}\n`);
      return 2;
    }
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr?.code === "ENOENT") {
      process.stderr.write(
        `blastradius: no package.json (or lockfile) found in ${dir}${nodeErr.path ? ` (${nodeErr.path})` : ""}\n`,
      );
      return 2;
    }
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`blastradius failed: ${message}\n`);
    return 1;
  }

  if (jsonMode) {
    // Machine mode: stdout carries nothing but the JSON document. The
    // detected manager is presentation only (see table below) and stays
    // out of the JSON shape — schemaVersion is unchanged at 1.
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    const manager = detectLockfileManager(dir);
    process.stdout.write(`${formatTable(report.dependencies, process.stdout.columns, manager)}\n`);
  }

  if (failOn) {
    const threshold = BAND_RANK[failOn];
    const offenders = report.dependencies.filter((d) => !d.unused && BAND_RANK[d.band] >= threshold);
    if (offenders.length > 0) {
      process.stderr.write(
        `blastradius: --fail-on ${failOn} — ${offenders.length} dependency(ies) at or above "${failOn}": ` +
          `${offenders.map((d) => `${d.name} (${d.band})`).join(", ")}\n`,
      );
      return 1;
    }
  }

  return 0;
}

export async function run(argv: string[]): Promise<number> {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(HELP);
    return 0;
  }

  for (const a of args) {
    if (a.startsWith("-") && !KNOWN_FLAGS.has(a)) {
      process.stderr.write(`blastradius: unknown flag ${a}\n`);
      return 2;
    }
  }

  if (args[0] === "--dry") {
    const dir = resolve(args[1] ?? process.cwd());
    try {
      const rows = buildDryReport(dir);
      process.stdout.write(`${formatDryReport(rows)}\n`);
      return 0;
    } catch (err) {
      if (err instanceof UnsupportedLockfileError) {
        // Same refusal family as the default/`--json` path (see runReport):
        // a recognised-but-unreadable lockfile is a usage error, not a
        // crash, and the message already names the file and the
        // version/shape found.
        process.stderr.write(`blastradius: ${err.message}\n`);
        return 2;
      }
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`blastradius --dry failed: ${message}\n`);
      return 1;
    }
  }

  if (args[0] === "--explain") {
    const packageName = args[1];
    if (!packageName) {
      process.stderr.write(`blastradius: --explain requires a package name\n`);
      return 2;
    }
    const dir = resolve(args[2] ?? process.cwd());
    return runExplain(dir, packageName);
  }

  const jsonMode = args.includes("--json");
  const rootOnly = args.includes("--root-only");

  let failOn: Band | undefined;
  const failOnIndex = args.indexOf("--fail-on");
  if (failOnIndex !== -1) {
    const value = args[failOnIndex + 1];
    if (value !== "review" && value !== "urgent") {
      process.stderr.write(`blastradius: invalid --fail-on value ${value ?? "(missing)"} — expected "review" or "urgent"\n`);
      return 2;
    }
    failOn = value;
  }

  const dirArg = firstNonFlag(args);
  const dir = resolve(dirArg ?? process.cwd());
  return runReport(dir, jsonMode, failOn ? { failOn, rootOnly } : { rootOnly });
}

// Only run as a side effect when invoked directly (`node cli.js` / the
// installed bin) — not when imported, e.g. by tests.
function isEntryPoint(): boolean {
  const argvPath = process.argv[1];
  if (!argvPath) return false;
  try {
    return realpathSync(argvPath) === fileURLToPath(import.meta.url);
  } catch {
    // Unresolvable path (missing file, permissions, etc.) means "not the entry point",
    // not a crash — this guard must never throw.
    return false;
  }
}

if (isEntryPoint()) {
  run(process.argv).then((code) => process.exit(code));
}
