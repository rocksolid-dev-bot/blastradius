#!/usr/bin/env node
import { resolve } from "node:path";
import { buildDryReport, formatDryReport } from "./dry.js";

const HELP = `blastradius — rank outdated dependencies by blast radius, not alphabet

Usage:
  blastradius --help          Show this help and exit
  blastradius --dry [dir]     Print declared vs. installed versions (npm only, for now)

--dry reads package.json + package-lock.json (npm lockfileVersion 3) from
[dir], defaulting to the current directory.

v1 in progress: usage analysis (which files/symbols actually import each
dependency), npm registry lookups, and blast-radius scoring land in later
builds. Today's scaffold only reads declared vs. installed versions.
`;

export function run(argv: string[]): number {
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

  process.stderr.write(`Unknown arguments: ${args.join(" ")}\n\n${HELP}`);
  return 1;
}

// Only run as a side effect when invoked directly (`node cli.js` / the
// installed bin) — not when imported, e.g. by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(run(process.argv));
}
