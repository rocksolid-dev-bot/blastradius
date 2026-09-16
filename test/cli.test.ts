import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runReport } from "../src/cli.js";
import type { RegistryFetch } from "../src/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures", "report-basic");

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runReport --json", () => {
  it("writes exactly one JSON document to stdout, nothing else", async () => {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk!.toString());
      return true;
    });

    const code = await runReport(fixtureDir, true, {
      fetcher,
      registry: { cacheDir: join(fixtureDir, ".cache-cli-json") },
    });

    expect(code).toBe(0);
    expect(chunks).toHaveLength(1);
    const parsed = JSON.parse(chunks[0]!.trim());
    expect(parsed.schemaVersion).toBe(1);
    expect(Array.isArray(parsed.dependencies)).toBe(true);
    expect(Array.isArray(parsed.skipped)).toBe(true);
    expect(parsed.dependencies[0]).toHaveProperty("name");
    expect(parsed.dependencies[0]).toHaveProperty("score");
    expect(parsed.dependencies[0]).toHaveProperty("band");
    expect(parsed.dependencies[0]).toHaveProperty("files");
    expect(parsed.dependencies[0]).toHaveProperty("symbols");
  });

  it("matches the documented JSON shape for the fixture exactly", async () => {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk!.toString());
      return true;
    });

    await runReport(fixtureDir, true, {
      fetcher,
      registry: { cacheDir: join(fixtureDir, ".cache-cli-json-shape") },
    });

    const parsed = JSON.parse(chunks[0]!.trim());
    const names = parsed.dependencies.map((d: { name: string }) => d.name);
    expect(names).toEqual(["old-legacy", "left-pad", "unused-dep"]);

    const legacy = parsed.dependencies[0];
    expect(legacy).toMatchObject({
      name: "old-legacy",
      declared: "^1.0.0",
      installed: "1.0.0",
      latest: "2.0.0",
      registryStatus: "ok",
      deprecated: true,
      jump: "major",
      dev: false,
      namespaceImport: false,
      typeOnly: false,
      devOnly: false,
      unused: false,
      band: "urgent",
    });
  });

  it("renders the plain table when jsonMode is false", async () => {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk!.toString());
      return true;
    });

    const code = await runReport(fixtureDir, false, {
      fetcher,
      registry: { cacheDir: join(fixtureDir, ".cache-cli-table") },
    });

    expect(code).toBe(0);
    expect(chunks.join("")).toContain("old-legacy");
    expect(() => JSON.parse(chunks[0]!)).toThrow();
  });

  it("names the detected lockfile manager in the table header", async () => {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk!.toString());
      return true;
    });

    await runReport(fixtureDir, false, {
      fetcher,
      registry: { cacheDir: join(fixtureDir, ".cache-cli-manager") },
    });

    expect(chunks.join("")).toContain("lockfile: npm");
  });
});

describe("runReport lockfile refusal", () => {
  it("exits 2 and names the file and version when the lockfile is recognised but unreadable", async () => {
    const stderrChunks: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk!.toString());
      return true;
    });
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const pnpmUnsupportedDir = join(here, "fixtures", "pnpm-unsupported-version");
    const code = await runReport(pnpmUnsupportedDir, false, { fetcher });

    expect(code).toBe(2);
    const stderr = stderrChunks.join("");
    expect(stderr).toContain("pnpm-lock.yaml");
    expect(stderr).toContain("5.0");
  });
});
