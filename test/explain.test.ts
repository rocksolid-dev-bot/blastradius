import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runReport, runExplain } from "../src/cli.js";
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

function captureStdout(): string[] {
  const chunks: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk!.toString());
    return true;
  });
  return chunks;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("--explain", () => {
  it("prints the score, band, every component, every multiplier, and the per-file symbol list", async () => {
    const chunks = captureStdout();

    const code = await runExplain(fixtureDir, "old-legacy", {
      fetcher,
      registry: { cacheDir: join(fixtureDir, ".cache-explain-old-legacy") },
    });

    expect(code).toBe(0);
    const output = chunks.join("");
    expect(output).toMatch(/old-legacy: score \d+ \(urgent\)/);
    expect(output).toContain("components:");
    expect(output).toContain("jump:");
    expect(output).toContain("deprecated:");
    expect(output).toContain("multipliers:");
    expect(output).toContain("type-only:");
    expect(output).toContain("dev-only:");
    expect(output).toContain("files:");
  });

  it("the printed total equals the score the table prints for the same package, same fixture", async () => {
    const explainChunks = captureStdout();
    await runExplain(fixtureDir, "old-legacy", {
      fetcher,
      registry: { cacheDir: join(fixtureDir, ".cache-explain-drift-explain") },
    });
    const explainOutput = explainChunks.join("");
    const explainScore = Number(explainOutput.match(/score (\d+)/)?.[1]);
    expect(Number.isFinite(explainScore)).toBe(true);

    vi.restoreAllMocks();
    const tableChunks = captureStdout();
    await runReport(fixtureDir, false, {
      fetcher,
      registry: { cacheDir: join(fixtureDir, ".cache-explain-drift-table") },
    });
    const tableOutput = tableChunks.join("");
    const row = tableOutput.split("\n").find((line) => line.startsWith("old-legacy"));
    expect(row).toBeDefined();
    // Table columns: package  declared  installed  latest  jump  files  score  band
    const cols = row!.trim().split(/\s{2,}/);
    const tableScore = Number(cols[cols.length - 2]);

    expect(explainScore).toBe(tableScore);
  });
});
