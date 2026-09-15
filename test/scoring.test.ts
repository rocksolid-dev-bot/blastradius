import { describe, expect, it } from "vitest";
import { scoreDependency } from "../src/scoring.js";
import type { PackageUsage } from "../src/usageMap.js";

function usage(overrides: Partial<PackageUsage> = {}): PackageUsage {
  return {
    files: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"],
    symbols: ["x", "y", "z"],
    defaultImport: false,
    namespaceImport: false,
    typeOnly: false,
    devOnly: false,
    ...overrides,
  };
}

describe("scoreDependency", () => {
  it("lands urgent for a deprecated major with wide usage", () => {
    const result = scoreDependency({
      jump: "major",
      deprecated: true,
      declared: true,
      usage: usage({ files: Array.from({ length: 8 }, (_, i) => `file${i}.ts`), namespaceImport: true }),
    });

    expect(result.band).toBe("urgent");
    expect(result.unused).toBe(false);
  });

  it("lands ok for a type-only patch bump", () => {
    const result = scoreDependency({
      jump: "patch",
      deprecated: false,
      declared: true,
      usage: usage({ files: ["types.ts"], symbols: ["Config"], typeOnly: true }),
    });

    expect(result.band).toBe("ok");
  });

  it("flags an unused declared dependency as visibly distinct from a used one", () => {
    const unused = scoreDependency({ jump: "major", deprecated: false, declared: true, usage: undefined });
    const used = scoreDependency({ jump: "major", deprecated: false, declared: true, usage: usage() });

    expect(unused.unused).toBe(true);
    expect(unused.score).toBe(0);
    expect(used.unused).toBe(false);
    expect(used.score).toBeGreaterThan(0);
    expect(unused.score).not.toBe(used.score);
  });

  it("scores a default-import-only consumer strictly higher than zero usage — defaultImport is a real symbol", () => {
    const defaultOnly = scoreDependency({
      jump: "patch",
      deprecated: false,
      declared: true,
      usage: usage({ files: ["a.ts"], symbols: [], defaultImport: true }),
    });
    const noUsage = scoreDependency({
      jump: "patch",
      deprecated: false,
      declared: true,
      usage: usage({ files: ["a.ts"], symbols: [], defaultImport: false }),
    });

    expect(defaultOnly.score).toBeGreaterThan(noUsage.score);
    expect(defaultOnly.breakdown.symbols).toBe(2); // 1 (default) * SYMBOLS_WEIGHT_PER_SYMBOL
    expect(noUsage.breakdown.symbols).toBe(0);
  });

  it("namespaceImport's flat +10 is exactly what pushes a score across the review boundary", () => {
    // jump prerelease (10) + 1 file (3) + 3 symbols (6) = raw 19 -> "ok" (< 20).
    // The only variable below is namespaceImport; +10 lands exactly on 29,
    // crossing into "review" (>= 20). This pins the weight's contribution
    // to a real band boundary, not just "the score went up".
    const withoutNamespace = scoreDependency({
      jump: "prerelease",
      deprecated: false,
      declared: true,
      usage: usage({ files: ["a.ts"], symbols: ["x", "y", "z"], namespaceImport: false }),
    });
    const withNamespace = scoreDependency({
      jump: "prerelease",
      deprecated: false,
      declared: true,
      usage: usage({ files: ["a.ts"], symbols: ["x", "y", "z"], namespaceImport: true }),
    });

    expect(withoutNamespace.breakdown.namespace).toBe(0);
    expect(withoutNamespace.score).toBe(19);
    expect(withoutNamespace.band).toBe("ok");

    expect(withNamespace.breakdown.namespace).toBe(10);
    expect(withNamespace.score).toBe(29);
    expect(withNamespace.band).toBe("review");
  });

  it("also flags a declared dependency with zero usage files as unused", () => {
    const result = scoreDependency({
      jump: "minor",
      deprecated: false,
      declared: true,
      usage: usage({ files: [] }),
    });

    expect(result.unused).toBe(true);
  });

  it("handles unknown registry data without crashing, low score", () => {
    const result = scoreDependency({ jump: "unknown", deprecated: false, declared: true, usage: usage() });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(["ok", "review", "urgent"]).toContain(result.band);
  });

  it("dev-only usage lowers the score relative to an identical prod dependency", () => {
    const prod = scoreDependency({ jump: "major", deprecated: false, declared: true, usage: usage() });
    const dev = scoreDependency({ jump: "major", deprecated: false, declared: true, usage: usage({ devOnly: true }) });

    expect(dev.score).toBeLessThan(prod.score);
  });

  it("deprecated raises risk regardless of a small version distance", () => {
    const patch = scoreDependency({ jump: "patch", deprecated: false, declared: true, usage: usage({ files: ["a.ts"], symbols: [] }) });
    const deprecatedPatch = scoreDependency({
      jump: "patch",
      deprecated: true,
      declared: true,
      usage: usage({ files: ["a.ts"], symbols: [] }),
    });

    expect(deprecatedPatch.score).toBeGreaterThan(patch.score);
  });
});
