import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { run, runReport } from "../src/cli.js";
import type { RegistryFetch } from "../src/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name: string) => join(here, "fixtures", name);

function captureStdio() {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    out.push(typeof chunk === "string" ? chunk : chunk!.toString());
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    err.push(typeof chunk === "string" ? chunk : chunk!.toString());
    return true;
  });
  return { out, err };
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Every documented exit code, driven through `run()` (the real argv
 * parser), one table per code. This is the behavioural acceptance for the
 * day-6 fix: a returned number, not a grep for a `catch` block — the bug
 * this suite exists to catch (`--dry` and npm both silently returning `1`)
 * would not have shown up in a grep.
 */

// All four fixtures throw `UnsupportedLockfileError` at the lockfile-read
// step, before any registry fetch happens — so this whole table never
// touches the network, and `run()` can be driven directly with no
// injected fetcher, exactly as report.test.ts documents for the refusal
// path.
const REFUSAL_FIXTURES = [
  "npm-v1-lockfile",
  "pnpm-unsupported-version",
  "yarn-berry",
  "yarn-unrecognized",
] as const;

const ENTRY_POINTS: Array<{ name: string; args: (dir: string) => string[] }> = [
  { name: "default", args: (dir) => [dir] },
  { name: "--json", args: (dir) => ["--json", dir] },
  { name: "--dry", args: (dir) => ["--dry", dir] },
];

describe("exit code 2 — lockfile refusal, every fixture x every entry point (12 cases)", () => {
  for (const fixture of REFUSAL_FIXTURES) {
    for (const entry of ENTRY_POINTS) {
      it(`${fixture} via ${entry.name} exits 2, not 1`, async () => {
        captureStdio();
        const code = await run(["node", "blastradius", ...entry.args(fx(fixture))]);
        expect(code).toBe(2);
      });
    }
  }
});

describe("exit code 2 — usage errors", () => {
  it("unknown flag", async () => {
    captureStdio();
    expect(await run(["node", "blastradius", "--bogus"])).toBe(2);
  });

  it("invalid --fail-on value", async () => {
    captureStdio();
    expect(await run(["node", "blastradius", "--fail-on", "bogus", fx("report-basic")])).toBe(2);
  });

  it("missing --fail-on value", async () => {
    captureStdio();
    expect(await run(["node", "blastradius", "--fail-on"])).toBe(2);
  });

  it("no package.json (or lockfile) found in the target directory", async () => {
    captureStdio();
    expect(await run(["node", "blastradius", "/tmp"])).toBe(2);
  });

  it("--explain <missing-package> names the package and exits 2, not a crash", async () => {
    const { err } = captureStdio();
    const code = await run(["node", "blastradius", "--explain", "not-a-real-dep", fx("report-basic")]);
    expect(code).toBe(2);
    expect(err.join("")).toContain("not-a-real-dep");
  });
});

describe("exit code 3 — monorepo refusal, and exit 0 with --root-only", () => {
  const workspacesDir = fx("monorepo-workspaces");

  // buildFullReport does hit the registry once a monorepo is analyzed
  // with --root-only, so this pair (unlike the refusal table above)
  // injects the fetcher and calls `runReport` directly — the same
  // pattern report.test.ts and failon-monorepo.test.ts already use to
  // keep this suite off the network.
  const fetcher: RegistryFetch = async (name) => {
    const data: Record<string, { latest: string; deprecated: boolean }> = {
      "left-pad": { latest: "1.5.0", deprecated: false },
      "old-legacy": { latest: "2.0.0", deprecated: true },
      "unused-dep": { latest: "2.4.0", deprecated: false },
    };
    const entry = data[name];
    if (!entry) throw new Error(`unexpected package ${name}`);
    return { ...entry, status: "ok" as const };
  };

  it("exits 3 by default (marker found, --root-only not passed)", async () => {
    captureStdio();
    const code = await runReport(workspacesDir, false, {
      fetcher,
      registry: { cacheDir: join(workspacesDir, ".cache-exit-codes-monorepo") },
    });
    expect(code).toBe(3);
  });

  it("exits 0 with --root-only on the same fixture", async () => {
    captureStdio();
    const code = await runReport(workspacesDir, false, {
      fetcher,
      registry: { cacheDir: join(workspacesDir, ".cache-exit-codes-rootonly") },
      rootOnly: true,
    });
    expect(code).toBe(0);
  });
});

describe("exit code 0 and 1 — --fail-on below and at threshold", () => {
  const reportBasicDir = fx("report-basic");

  const atThresholdFetcher: RegistryFetch = async (name) => {
    const data: Record<string, { latest: string; deprecated: boolean }> = {
      "left-pad": { latest: "1.5.0", deprecated: false },
      "old-legacy": { latest: "2.0.0", deprecated: true },
      "unused-dep": { latest: "2.4.0", deprecated: false },
    };
    const entry = data[name];
    if (!entry) throw new Error(`unexpected package ${name}`);
    return { ...entry, status: "ok" as const };
  };

  it("exits 0 when nothing reaches the --fail-on threshold", async () => {
    captureStdio();
    const code = await runReport(reportBasicDir, false, {
      fetcher: async (name) => {
        // Patch jumps only, nothing deprecated: worst band stays well
        // under "urgent" even with full usage credit.
        const patchOnly: Record<string, { latest: string; deprecated: boolean }> = {
          "left-pad": { latest: "1.3.1", deprecated: false },
          "old-legacy": { latest: "1.0.1", deprecated: false },
          "unused-dep": { latest: "2.0.1", deprecated: false },
        };
        const entry = patchOnly[name];
        if (!entry) throw new Error(`unexpected package ${name}`);
        return { ...entry, status: "ok" as const };
      },
      registry: { cacheDir: join(reportBasicDir, ".cache-exit-codes-failon-below") },
      failOn: "urgent",
    });
    expect(code).toBe(0);
  });

  it("exits 1 when a dependency is at or above the --fail-on threshold", async () => {
    captureStdio();
    const code = await runReport(reportBasicDir, false, {
      fetcher: atThresholdFetcher,
      registry: { cacheDir: join(reportBasicDir, ".cache-exit-codes-failon-at") },
      failOn: "review",
    });
    expect(code).toBe(1);
  });
});
