import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDryReport } from "../src/dry.js";
import { readNpmLockfile } from "../src/lockfile/npm.js";
import { readPnpmLockfile } from "../src/lockfile/pnpm.js";
import { readYarnLockfile } from "../src/lockfile/yarn.js";
import { detectLockfileManager, readLockfile, UnsupportedLockfileError } from "../src/lockfile/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures", "npm-basic");
const pnpmFixtureDir = join(here, "fixtures", "pnpm-basic");
const yarnFixtureDir = join(here, "fixtures", "yarn-basic");

describe("readNpmLockfile", () => {
  it("resolves top-level installed versions from an npm lockfileVersion 3 file", () => {
    const installed = readNpmLockfile(fixtureDir);
    expect(installed.get("left-pad")).toBe("1.3.0");
    expect(installed.get("typescript")).toBe("5.4.5");
    expect(installed.size).toBe(2);
  });

  it("resolves the same name->version map shape from an npm lockfileVersion 2 file", () => {
    const installed = readNpmLockfile(join(here, "fixtures", "npm-v2-basic"));
    expect(installed.get("left-pad")).toBe("1.3.0");
    expect(installed.get("typescript")).toBe("5.4.5");
    expect(installed.size).toBe(2);
  });

  it("refuses an npm lockfileVersion 1 file by name, naming the file and the version", () => {
    let thrown: unknown;
    try {
      readNpmLockfile(join(here, "fixtures", "npm-v1-lockfile"));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UnsupportedLockfileError);
    const message = (thrown as Error).message;
    expect(message).toContain("package-lock.json");
    expect(message).toContain("1");
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

describe("readPnpmLockfile", () => {
  it("resolves top-level installed versions from a real pnpm v9 lockfile, same map shape as npm", () => {
    const installed = readPnpmLockfile(pnpmFixtureDir);
    expect(installed.get("left-pad")).toBe("1.3.0");
    expect(installed.get("typescript")).toBe("5.9.3");
    expect(installed.size).toBe(2);
  });

  it("strips the peer-dep suffix from a resolved version", () => {
    const installed = readPnpmLockfile(join(here, "fixtures", "pnpm-peer-suffix"));
    expect(installed.get("some-plugin")).toBe("2.0.0");
  });

  it("refuses an unsupported pnpm lockfile version, naming the file and the version", () => {
    let thrown: unknown;
    try {
      readPnpmLockfile(join(here, "fixtures", "pnpm-unsupported-version"));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UnsupportedLockfileError);
    const message = (thrown as Error).message;
    expect(message).toContain("pnpm-lock.yaml");
    expect(message).toContain("5.0");
  });
});

describe("readPnpmLockfile against a real pnpm-generated lockfile (not hand-shaped)", () => {
  // test/fixtures/pnpm-real/pnpm-lock.yaml was produced by a real `pnpm install`
  // (pnpm 8.15.9) against real npm-registry packages -- see the fixture's own
  // README.md for exactly how it was generated and how to regenerate it. Every
  // prior pnpm fixture in this suite was hand-written; this is the first one a
  // package manager actually emitted.
  const realPnpmDir = join(here, "fixtures", "pnpm-real");

  it("resolves all four real dependencies at the exact versions the lockfile declares", () => {
    const installed = readPnpmLockfile(realPnpmDir);
    expect(installed.get("@types/node")).toBe("20.14.0");
    expect(installed.get("left-pad")).toBe("1.3.0");
    expect(installed.get("react")).toBe("18.2.0");
    expect(installed.get("react-dom")).toBe("18.2.0");
    expect(installed.size).toBe(4);
  });
});

describe("readYarnLockfile", () => {
  it("resolves top-level installed versions from a real yarn classic v1 lockfile, same map shape as npm", () => {
    const installed = readYarnLockfile(yarnFixtureDir);
    expect(installed.get("left-pad")).toBe("1.3.0");
    expect(installed.get("typescript")).toBe("5.9.3");
    expect(installed.size).toBe(2);
  });

  it("refuses a yarn berry lockfile explicitly, naming the file", () => {
    let thrown: unknown;
    try {
      readYarnLockfile(join(here, "fixtures", "yarn-berry"));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UnsupportedLockfileError);
    const message = (thrown as Error).message;
    expect(message).toContain("yarn.lock");
    expect(message).toContain("berry");
  });

  it("refuses an unrecognised yarn.lock shape rather than guessing", () => {
    let thrown: unknown;
    try {
      readYarnLockfile(join(here, "fixtures", "yarn-unrecognized"));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(UnsupportedLockfileError);
    expect((thrown as Error).message).toContain("yarn.lock");
  });
});

describe("readYarnLockfile against a real yarn-generated lockfile (not hand-shaped)", () => {
  // test/fixtures/yarn-real/yarn.lock was produced by a real `yarn install`
  // (yarn classic 1.22.22) against the same three real packages as
  // test/fixtures/pnpm-real -- see the fixture's own README.md.
  const realYarnDir = join(here, "fixtures", "yarn-real");

  it("resolves all four real dependencies at the exact versions the lockfile declares", () => {
    const installed = readYarnLockfile(realYarnDir);
    expect(installed.get("@types/node")).toBe("20.14.0");
    expect(installed.get("left-pad")).toBe("1.3.0");
    expect(installed.get("react")).toBe("18.2.0");
    expect(installed.get("react-dom")).toBe("18.2.0");
    expect(installed.size).toBe(4);
  });
});

describe("detectLockfileManager", () => {
  it("detects npm, pnpm, and yarn by the lockfile file present", () => {
    expect(detectLockfileManager(fixtureDir)).toBe("npm");
    expect(detectLockfileManager(pnpmFixtureDir)).toBe("pnpm");
    expect(detectLockfileManager(yarnFixtureDir)).toBe("yarn");
  });

  it("returns null when no lockfile is present", () => {
    expect(detectLockfileManager(join(here, "fixtures"))).toBeNull();
  });
});

describe("readLockfile selector", () => {
  it("dispatches to the pnpm reader when only a pnpm lockfile is present", () => {
    const installed = readLockfile(pnpmFixtureDir);
    expect(installed.get("left-pad")).toBe("1.3.0");
  });

  it("dispatches to the yarn reader when only a yarn lockfile is present", () => {
    const installed = readLockfile(yarnFixtureDir);
    expect(installed.get("left-pad")).toBe("1.3.0");
  });
});
