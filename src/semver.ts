/**
 * Minimal semver parsing and jump classification — no external dependency.
 * `semver` (MIT) was considered per TODAY.md but is not currently a
 * transitive dep we could declare cleanly, and this is a well-defined parse
 * of a small subset (range operators + a plain `major.minor.patch[-pre]`),
 * not a research problem.
 */

export type SemverJump = "patch" | "minor" | "major" | "prerelease" | "unsupported" | "unknown";

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;

/** Parses a plain `major.minor.patch[-prerelease]`, ignoring build metadata. */
export function parseVersion(input: string): ParsedVersion | null {
  const m = VERSION_RE.exec(input.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
  };
}

const UNSUPPORTED_PREFIXES = ["git+", "git:", "github:", "gitlab:", "bitbucket:", "file:", "link:", "workspace:"];

/** True for specifiers we do not classify a semver jump for — never guessed at. */
export function isUnsupportedSpecifier(range: string): boolean {
  const trimmed = range.trim();
  if (UNSUPPORTED_PREFIXES.some((p) => trimmed.startsWith(p))) return true;
  // A bare "user/repo" or full URL (not a registry range) — has a "/" or
  // "://" but isn't a scoped package name (`@scope/pkg` starts with "@").
  if (trimmed.includes("://")) return true;
  if (!trimmed.startsWith("@") && trimmed.includes("/") && !trimmed.startsWith("npm:")) return true;
  return false;
}

/** True for `*`, `latest`, `x`, or an empty range — no fixed base version to compare from. */
function isWildcard(range: string): boolean {
  const trimmed = range.trim().replace(/^[\^~]/, "");
  return trimmed === "" || trimmed === "*" || trimmed === "x" || trimmed === "latest";
}

/** Strips leading range operators (`^`, `~`, `>=`, `<=`, `>`, `<`, `=`) to reach a base version. */
function stripRangeOperators(range: string): string {
  return range.trim().replace(/^[\^~]/, "").replace(/^[<>]=?/, "").replace(/^=/, "").trim();
}

/**
 * Classifies the jump from a declared/installed version (or range) to
 * `latest`. `latest: null` (registry lookup failed or package unknown) is
 * always `"unknown"`. Git/file/workspace specifiers and bare URLs are
 * `"unsupported"` — never guessed at. A wildcard range (`*`, `latest`) has
 * no fixed base version to diff from, so it is also `"unknown"` rather than
 * assumed up to date.
 */
export function classifyJump(currentRangeOrVersion: string, latest: string | null): SemverJump {
  if (latest === null) return "unknown";
  if (isUnsupportedSpecifier(currentRangeOrVersion)) return "unsupported";
  if (isWildcard(currentRangeOrVersion)) return "unknown";

  const base = parseVersion(stripRangeOperators(currentRangeOrVersion));
  const target = parseVersion(latest);
  if (!base || !target) return "unknown";

  if (base.prerelease !== null || target.prerelease !== null) return "prerelease";

  if (target.major !== base.major) return "major";
  if (target.minor !== base.minor) return "minor";
  // Includes the "already at latest" case (patch diff 0) — there is no
  // larger jump to report, so it classifies as the smallest band.
  return "patch";
}
