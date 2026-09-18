import { describe, expect, it } from "vitest";
import { scoreDependency, type ScoreResult } from "../src/scoring.js";
import type { PackageUsage } from "../src/usageMap.js";

function component(result: ScoreResult, label: string): number {
  return result.breakdown.components.find((c) => c.label === label)?.value ?? 0;
}

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
    expect(component(defaultOnly, "symbols")).toBe(2); // 1 (default) * SYMBOLS_WEIGHT_PER_SYMBOL
    expect(component(noUsage, "symbols")).toBe(0);
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

    expect(component(withoutNamespace, "namespace")).toBe(0);
    expect(withoutNamespace.score).toBe(19);
    expect(withoutNamespace.band).toBe("ok");

    expect(component(withNamespace, "namespace")).toBe(10);
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

  // --- urgent band reachability (day 10, item 1a) ---------------------------------
  // URGENT_THRESHOLD is 50. Weights: major 40 / minor 15 / patch 5 / prerelease 10,
  // files 3 each capped at 20, symbols 2 each capped at 15, namespace +10 flat,
  // deprecated +30 flat, type-only x0.3, dev-only x0.5. These pin the minimum input
  // on each distinct route that reaches 50, plus one case that lands just under it.

  it("deprecated route: deprecated(30) + files capped at 20 reaches urgent at exactly 50", () => {
    // jump "unknown" contributes 0; 7 files * 3 = 21, capped to 20; no symbols,
    // no namespace. 30 + 20 = 50, the minimum-file-count input that reaches the cap.
    const result = scoreDependency({
      jump: "unknown",
      deprecated: true,
      declared: true,
      usage: usage({ files: Array.from({ length: 7 }, (_, i) => `f${i}.ts`), symbols: [] }),
    });

    expect(component(result, "deprecated")).toBe(30);
    expect(component(result, "files")).toBe(20);
    expect(result.score).toBe(50);
    expect(result.band).toBe("urgent");
  });

  it("major-jump-plus-usage-breadth route: major(40) + files(3) + namespace(10) = 53 reaches urgent", () => {
    // The usage map's own `unused` check requires at least one file (a zero-length
    // files array is scored 0 and flagged unused, never reaching any band), so the
    // true minimum non-unused input on this route needs exactly 1 file — its 3-point
    // contribution is unavoidable, not padding. Namespace import ("import * as x",
    // whole-module usage) is the breadth signal that, combined with a bare major
    // jump, clears the threshold: 40 + 3 + 10 = 53.
    const result = scoreDependency({
      jump: "major",
      deprecated: false,
      declared: true,
      usage: usage({ files: ["a.ts"], symbols: [], namespaceImport: true }),
    });

    expect(component(result, "jump")).toBe(40);
    expect(component(result, "files")).toBe(3);
    expect(component(result, "namespace")).toBe(10);
    expect(result.score).toBe(53);
    expect(result.band).toBe("urgent");
  });

  it("just under the urgent boundary: major(40) + files(3) + 3 symbols(6) = 49 stays \"review\"", () => {
    // Same major jump and the same unavoidable 1-file minimum as the route above,
    // but the breadth signal is symbols instead of a namespace import — one point
    // short of 50: 40 + 3 + 6 = 49.
    const result = scoreDependency({
      jump: "major",
      deprecated: false,
      declared: true,
      usage: usage({ files: ["a.ts"], symbols: ["a", "b", "c"], namespaceImport: false }),
    });

    expect(component(result, "jump")).toBe(40);
    expect(component(result, "files")).toBe(3);
    expect(component(result, "symbols")).toBe(6);
    expect(result.score).toBe(49);
    expect(result.band).toBe("review");
  });

  it("the breakdown never drifts: components summed then multiplied equals the reported total, across fixtures", () => {
    const fixtures = [
      scoreDependency({
        jump: "major",
        deprecated: true,
        declared: true,
        usage: usage({ files: Array.from({ length: 8 }, (_, i) => `file${i}.ts`), namespaceImport: true }),
      }),
      scoreDependency({
        jump: "prerelease",
        deprecated: false,
        declared: true,
        usage: usage({ files: ["a.ts"], symbols: ["x", "y", "z"], namespaceImport: true }),
      }),
      scoreDependency({
        jump: "patch",
        deprecated: false,
        declared: true,
        usage: usage({ files: ["a.ts"], symbols: [], defaultImport: true }),
      }),
    ];

    expect(fixtures.length).toBeGreaterThanOrEqual(3);
    for (const result of fixtures) {
      const sum = result.breakdown.components.reduce((acc, c) => acc + c.value, 0);
      const product = result.breakdown.multipliers.reduce((acc, m) => acc * m.value, 1);
      expect(Math.round(sum * product)).toBe(result.breakdown.total);
      expect(result.breakdown.total).toBe(result.score);
    }
  });
});
