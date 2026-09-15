import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDryReport } from "../src/dry.js";
import { readNpmLockfile } from "../src/lockfile/npm.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures", "npm-basic");

describe("readNpmLockfile", () => {
  it("resolves top-level installed versions from an npm lockfileVersion 3 file", () => {
    const installed = readNpmLockfile(fixtureDir);
    expect(installed.get("left-pad")).toBe("1.3.0");
    expect(installed.get("typescript")).toBe("5.4.5");
    expect(installed.size).toBe(2);
  });
});

describe("buildDryReport", () => {
  it("cross-references declared ranges with installed versions for a fixture project", () => {
    const rows = buildDryReport(fixtureDir);
    expect(rows).toEqual([
      { name: "left-pad", range: "^1.3.0", installed: "1.3.0", dev: false },
      { name: "typescript", range: "^5.4.0", installed: "5.4.5", dev: true },
    ]);
  });
});
