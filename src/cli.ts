#!/usr/bin/env node
import { resolve } from "node:path";
import { buildDryReport, formatDryReport } from "./dry.js";
import { buildFullReport, type BuildFullReportOptions } from "./report.js";
import { formatTable } from "./table.js";

const HELP = `blastradius — rank outdated dependencies by blast radius, not alphabet

Usage:
  blastradius [dir]           Ranked table: registry + usage + score (npm only, for now)
  blastradius --json [dir]    Same report as machine-readable JSON on stdout
  blastradius --dry [dir]     Print declared vs. installed versions only, no registry call
  blastradius --help          Show this help and exit

[dir] defaults to the current directory. Registry lookups are cached for 24h
in $XDG_CACHE_HOME/blastradius (or ~/.cache/blastradius); a lookup that
fails for any reason (offline, timeout, 429/5xx, bad body) renders as
"unknown" rather than crashing the run.
`;

function firstNonFlag(args: string[]): string | undefined {
  return args.find((a) => !a.startsWith("-"));
}

/**
 * Runs the full report (registry + usage + score) and writes it as either
 * the ranked table or `--json`. Exported so tests can drive it directly
 * with an injected registry fetcher — the CLI never hits the network in
 * this suite.
 */
export async function runReport(
  dir: string,
  jsonMode: boolean,
  options: BuildFullReportOptions = {},
): Promise<number> {
  try {
    const report = await buildFullReport(dir, options);
    if (jsonMode) {
      // Machine mode: stdout carries nothing but the JSON document.
      process.stdout.write(`${JSON.stringify(report)}\n`);
    } else {
      process.stdout.write(`${formatTable(report.dependencies, process.stdout.columns)}\n`);
    }
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`blastradius failed: ${message}\n`);
    return 1;
  }
}

export async function run(argv: string[]): Promise<number> {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(HELP);
    return 0;
  }

  if (args[0] === "--dry") {
    const dir = resolve(args[1] ?? process.cwd());
    try {
      const rows = buildDryReport(dir);
      process.stdout.write(`${formatDryReport(rows)}\n`);
      return 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`blastradius --dry failed: ${message}\n`);
      return 1;
    }
  }

  const jsonMode = args.includes("--json");
  const dirArg = firstNonFlag(args);
  const dir = resolve(dirArg ?? process.cwd());
  return runReport(dir, jsonMode);
}

// Only run as a side effect when invoked directly (`node cli.js` / the
// installed bin) — not when imported, e.g. by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv).then((code) => process.exit(code));
}
