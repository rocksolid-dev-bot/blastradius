import { describe, expect, it } from "vitest";
import { classifyJump, isUnsupportedSpecifier, parseVersion } from "../src/semver.js";

describe("parseVersion", () => {
  it("parses a plain version", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
  });

  it("parses a prerelease tag", () => {
    expect(parseVersion("2.0.0-beta.1")).toEqual({ major: 2, minor: 0, patch: 0, prerelease: "beta.1" });
  });

  it("returns null for garbage", () => {
    expect(parseVersion("not-a-version")).toBeNull();
  });
});

describe("isUnsupportedSpecifier", () => {
  it.each([
    "git+https://github.com/user/repo.git",
    "github:user/repo",
    "file:../local-pkg",
    "link:../local-pkg",
    "workspace:*",
    "user/repo",
    "https://example.com/pkg.tgz",
  ])("flags %s as unsupported", (spec) => {
    expect(isUnsupportedSpecifier(spec)).toBe(true);
  });

  it.each(["^1.2.3", "~1.2", ">=1", "1.2.3", "*", "latest", "@scope/pkg"])(
    "does not flag %s as unsupported",
    (spec) => {
      expect(isUnsupportedSpecifier(spec)).toBe(false);
    },
  );
});

describe("classifyJump", () => {
  it("is unknown when latest is null", () => {
    expect(classifyJump("^1.0.0", null)).toBe("unknown");
  });

  it("classifies a major jump", () => {
    expect(classifyJump("^1.2.3", "2.0.0")).toBe("major");
  });

  it("classifies a minor jump", () => {
    expect(classifyJump("^1.2.3", "1.5.0")).toBe("minor");
  });

  it("classifies a patch jump", () => {
    expect(classifyJump("1.2.3", "1.2.9")).toBe("patch");
  });

  it("handles caret and tilde ranges", () => {
    expect(classifyJump("^1.2.3", "1.9.0")).toBe("minor");
    expect(classifyJump("~1.2.0", "1.2.5")).toBe("patch");
  });

  it("handles >= ranges", () => {
    expect(classifyJump(">=1.0.0", "3.0.0")).toBe("major");
  });

  it("is prerelease when either side carries a prerelease tag", () => {
    expect(classifyJump("1.0.0-beta.1", "1.0.0")).toBe("prerelease");
    expect(classifyJump("1.0.0", "2.0.0-rc.1")).toBe("prerelease");
  });

  it("is unsupported for git/file specifiers regardless of latest", () => {
    expect(classifyJump("git+https://github.com/user/repo.git", "1.0.0")).toBe("unsupported");
    expect(classifyJump("file:../local-pkg", "1.0.0")).toBe("unsupported");
  });

  it("is unknown for a wildcard range — no fixed base to diff from", () => {
    expect(classifyJump("*", "1.0.0")).toBe("unknown");
    expect(classifyJump("latest", "1.0.0")).toBe("unknown");
  });

  it("classifies equal versions as patch (no jump)", () => {
    expect(classifyJump("1.2.3", "1.2.3")).toBe("patch");
  });
});
