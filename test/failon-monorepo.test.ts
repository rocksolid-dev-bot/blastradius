import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runReport, run } from "../src/cli.js";
import { detectMonorepoMarker } from "../src/monorepo.js";
import type { RegistryFetch } from "../src/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const reportBasicDir = join(here, "fixtures", "report-basic");
const workspacesDir = join(here, "fixtures", "monorepo-workspaces");
const pnpmDir = join(here, "fixtures", "monorepo-pnpm");
const lernaDir = join(here, "fixtures", "monorepo-lerna");

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

describe("detectMonorepoMarker", () => {
  it("finds the workspaces field in package.json", () => {
    expect(detectMonorepoMarker(workspacesDir)).toBe("package.json workspaces field");
  });

  it("finds pnpm-workspace.yaml", () => {
    expect(detectMonorepoMarker(pnpmDir)).toBe("pnpm-workspace.yaml");
  });

  it("finds lerna.json", () => {
    expect(detectMonorepoMarker(lernaDir)).toBe("lerna.json");
  });

  it("finds nothing in a plain repo", () => {
    expect(detectMonorepoMarker(reportBasicDir)).toBeNull();
  });
});

describe("runReport — monorepo refusal", () => {
  it("exits 3 and names the marker when a workspaces field is found", async () => {
    const { err } = captureStdio();
    const code = await runReport(workspacesDir, false, {
      fetcher,
      registry: { cacheDir: join(workspacesDir, ".cache-monorepo-refuse") },
    });

    expect(code).toBe(3);
    expect(err.join("")).toContain("package.json workspaces field");
  });

  it("exits 0 and analyzes the root package.json alone with --root-only", async () => {
    const { out } = captureStdio();
    const code = await runReport(workspacesDir, false, {
      fetcher,
      registry: { cacheDir: join(workspacesDir, ".cache-monorepo-rootonly") },
      rootOnly: true,
    });

    expect(code).toBe(0);
    expect(out.join("")).toContain("--root-only");
    expect(out.join("")).toContain("left-pad");
  });
});

describe("runReport — --fail-on", () => {
  it("exits 1 under --fail-on review and names the offending package (deprecated major)", async () => {
    const { err } = captureStdio();
    const code = await runReport(reportBasicDir, false, {
      fetcher,
      registry: { cacheDir: join(reportBasicDir, ".cache-failon-review") },
      failOn: "review",
    });

    expect(code).toBe(1);
    expect(err.join("")).toContain("old-legacy");
  });

  it("does not fail on review when --fail-on urgent and nothing reaches urgent", async () => {
    const { err } = captureStdio();
    const code = await runReport(reportBasicDir, false, {
      fetcher: async (name) => {
        // Nothing deprecated, only patch jumps: worst band should be well
        // under urgent (50) even with full usage credit.
        const patchOnly: Record<string, { latest: string; deprecated: boolean }> = {
          "left-pad": { latest: "1.3.1", deprecated: false },
          "old-legacy": { latest: "1.0.1", deprecated: false },
          "unused-dep": { latest: "2.0.1", deprecated: false },
        };
        const entry = patchOnly[name];
        if (!entry) throw new Error(`unexpected package ${name}`);
        return { ...entry, status: "ok" as const };
      },
      registry: { cacheDir: join(reportBasicDir, ".cache-failon-urgent-patch") },
      failOn: "urgent",
    });

    expect(code).toBe(0);
    expect(err.join("")).toBe("");
  });

  it("--json --fail-on review still emits exactly one JSON document on stdout, exit reflects failOn", async () => {
    const { out } = captureStdio();
    const code = await runReport(reportBasicDir, true, {
      fetcher,
      registry: { cacheDir: join(reportBasicDir, ".cache-failon-json") },
      failOn: "review",
    });

    expect(code).toBe(1);
    expect(out).toHaveLength(1);
    expect(() => JSON.parse(out[0]!.trim())).not.toThrow();
  });
});

describe("run — argument parsing usage errors", () => {
  it("exits 2 on an unknown flag", async () => {
    captureStdio();
    const code = await run(["node", "blastradius", "--bogus"]);
    expect(code).toBe(2);
  });

  it("exits 2 on an invalid --fail-on value", async () => {
    captureStdio();
    const code = await run(["node", "blastradius", "--fail-on", "bogus", reportBasicDir]);
    expect(code).toBe(2);
  });

  it("exits 2 when no package.json is found", async () => {
    captureStdio();
    const code = await run(["node", "blastradius", "/tmp"]);
    expect(code).toBe(2);
  });
});
