import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readDeclaredDependencies } from "../src/packageJson.js";
import { buildUsageMap } from "../src/usageMap.js";

const fixtureDir = fileURLToPath(new URL("./fixtures/usage-mixed", import.meta.url));

describe("buildUsageMap", () => {
  it("produces the exact usage map for the mixed-shape fixture", () => {
    const declared = readDeclaredDependencies(fixtureDir);
    const map = buildUsageMap(fixtureDir, declared);

    expect(map.skipped).toEqual([]);
    expect(map.packages).toEqual({
      chalk: {
        files: ["src/cjs.js"],
        symbols: [],
        perFile: [{ file: "src/cjs.js", symbols: [] }],
        defaultImport: false,
        namespaceImport: false,
        typeOnly: false,
        devOnly: false,
      },
      "left-pad": {
        files: ["src/esm.ts"],
        symbols: ["pad", "trim"],
        perFile: [{ file: "src/esm.ts", symbols: ["default", "pad", "trim"] }],
        defaultImport: true,
        namespaceImport: false,
        typeOnly: false,
        devOnly: false,
      },
      "left-pad-types": {
        files: ["src/types.ts"],
        symbols: ["Config"],
        perFile: [{ file: "src/types.ts", symbols: ["Config"] }],
        defaultImport: false,
        namespaceImport: false,
        typeOnly: true,
        devOnly: true,
      },
      react: {
        files: ["src/component.tsx"],
        symbols: [],
        perFile: [{ file: "src/component.tsx", symbols: ["* (namespace)"] }],
        defaultImport: false,
        namespaceImport: true,
        typeOnly: false,
        devOnly: false,
      },
    });
  });

  it("excludes relative imports and node: builtins", () => {
    const declared = readDeclaredDependencies(fixtureDir);
    const map = buildUsageMap(fixtureDir, declared);

    expect(map.packages["./helper"]).toBeUndefined();
    expect(map.packages["node:path"]).toBeUndefined();
    expect(map.packages.path).toBeUndefined();
  });
});
