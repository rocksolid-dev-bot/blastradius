import { describe, expect, it } from "vitest";
import { formatTable } from "../src/table.js";
import type { DependencyReport } from "../src/report.js";

function dep(overrides: Partial<DependencyReport> = {}): DependencyReport {
  return {
    name: "left-pad",
    declared: "^1.3.0",
    installed: "1.3.0",
    latest: "1.5.0",
    registryStatus: "ok",
    deprecated: false,
    jump: "minor",
    dev: false,
    files: ["src/index.ts"],
    symbols: ["pad"],
    namespaceImport: false,
    typeOnly: false,
    devOnly: false,
    unused: false,
    score: 20,
    band: "review",
    ...overrides,
  };
}

describe("formatTable", () => {
  it("prints a header and (no dependencies) message when empty", () => {
    const out = formatTable([]);
    expect(out).toContain("package");
    expect(out).toContain("(no dependencies declared)");
  });

  it("renders unknown latest as the literal word, never blank", () => {
    const out = formatTable([dep({ latest: null, jump: "unknown" })]);
    expect(out).toContain("unknown");
  });

  it("renders every declared column for a normal row", () => {
    const out = formatTable([dep()]);
    expect(out).toContain("left-pad");
    expect(out).toContain("^1.3.0");
    expect(out).toContain("1.3.0");
    expect(out).toContain("1.5.0");
    expect(out).toContain("minor");
    expect(out).toContain("review");
  });

  it("marks an unused dependency distinctly in the jump column", () => {
    const out = formatTable([dep({ unused: true, score: 0, band: "ok" })]);
    expect(out).toContain("unused");
  });

  it("names the detected lockfile manager above the header when given one", () => {
    const out = formatTable([dep()], undefined, "pnpm");
    expect(out.split("\n")[0]).toBe("lockfile: pnpm");
  });

  it("omits the manager line entirely when none is given", () => {
    const out = formatTable([dep()]);
    expect(out).not.toContain("lockfile:");
  });

  it("shrinks the package column rather than overflow a narrow terminal", () => {
    const longName = "@some-very-long-organization-scope/an-extremely-long-package-name";
    const out = formatTable([dep({ name: longName })], 60);
    const firstDataLine = out.split("\n")[1] ?? "";
    expect(firstDataLine.length).toBeLessThanOrEqual(70);
  });
});
