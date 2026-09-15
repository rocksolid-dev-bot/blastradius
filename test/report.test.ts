import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFullReport, SCHEMA_VERSION } from "../src/report.js";
import type { RegistryFetch, RegistryInfo } from "../src/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures", "report-basic");

const REGISTRY_DATA: Record<string, RegistryInfo> = {
  "left-pad": { latest: "1.5.0", deprecated: false, status: "ok" },
  "old-legacy": { latest: "2.0.0", deprecated: true, status: "ok" },
  "unused-dep": { latest: "2.4.0", deprecated: false, status: "ok" },
};

function fakeFetcher(): RegistryFetch {
  return async (name) => {
    const entry = REGISTRY_DATA[name];
    if (!entry) throw new Error(`unexpected package ${name} — no test in this suite touches the network`);
    return entry;
  };
}

describe("buildFullReport", () => {
  it("ranks by score descending and never calls the network", async () => {
    const report = await buildFullReport(fixtureDir, {
      fetcher: fakeFetcher(),
      registry: { cacheDir: join(fixtureDir, ".cache-report-basic") },
    });

    expect(report.schemaVersion).toBe(SCHEMA_VERSION);
    expect(report.dependencies.map((d) => d.name)).toEqual(["old-legacy", "left-pad", "unused-dep"]);

    const legacy = report.dependencies.find((d) => d.name === "old-legacy")!;
    expect(legacy.band).toBe("urgent");
    expect(legacy.jump).toBe("major");
    expect(legacy.deprecated).toBe(true);
    expect(legacy.unused).toBe(false);
    expect(legacy.files).toEqual(["src/index.ts"]);

    const leftPad = report.dependencies.find((d) => d.name === "left-pad")!;
    expect(leftPad.jump).toBe("minor");
    expect(leftPad.unused).toBe(false);
    expect(leftPad.score).toBeGreaterThan(0);

    const unused = report.dependencies.find((d) => d.name === "unused-dep")!;
    expect(unused.unused).toBe(true);
    expect(unused.score).toBe(0);
    expect(unused.band).toBe("ok");
  });

  it("degrades every package to unknown when the registry is entirely unreachable, still renders", async () => {
    const alwaysThrows: RegistryFetch = async () => {
      throw new Error("offline");
    };

    const report = await buildFullReport(fixtureDir, {
      fetcher: alwaysThrows,
      registry: { cacheDir: join(fixtureDir, ".cache-report-basic-offline") },
    });

    expect(report.dependencies).toHaveLength(3);
    for (const dep of report.dependencies) {
      expect(dep.latest).toBeNull();
      expect(dep.registryStatus).toBe("unknown");
      expect(dep.jump === "unknown" || dep.unused).toBe(true);
    }
  });
});
