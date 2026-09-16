import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LockfileReader } from "./types.js";
import { UnsupportedLockfileError } from "./types.js";

const LOCKFILE_VERSION_RE = /^lockfileVersion:\s*['"]?([^'"\s#]+)['"]?/m;
// The two shapes in real use as of this writing: pnpm 7/8 (6.x) and pnpm 9
// (9.x). A future major bump gets refused rather than parsed on a guess.
const SUPPORTED_MAJORS = new Set(["6", "9"]);

/** A resolved version may carry a peer-dep suffix: `1.2.3(react@18.0.0)`. */
function stripPeerSuffix(version: string): string {
  const idx = version.indexOf("(");
  return idx === -1 ? version : version.slice(0, idx);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  return trimmed.replace(/^['"]|['"]$/g, "");
}

function indentOf(line: string): number {
  return /^ */.exec(line)?.[0].length ?? 0;
}

/**
 * Parses one `dependencies:`/`devDependencies:` block (the line at
 * `blockLineIndex` is the `dependencies:`/`devDependencies:` line itself,
 * indented at `blockIndent`) into name -> resolved version.
 *
 * Handles both the nested `specifier:` / `version:` shape (v6 and v9 both
 * use this for a normal entry) and, defensively, a flat `name: 1.2.3` shape
 * on the entry's own line, in case a future shape collapses it.
 */
function parseDependencyBlock(lines: string[], blockLineIndex: number, blockIndent: number): Map<string, string> {
  const versions = new Map<string, string>();
  const entryIndent = blockIndent + 2;
  let currentName: string | null = null;

  for (let i = blockLineIndex + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    const ind = indentOf(line);
    if (ind <= blockIndent) break; // block ended

    if (ind === entryIndent) {
      const m = /^\s*([^\s:][^:]*):\s*(.*)$/.exec(line);
      if (!m) continue;
      currentName = unquote(m[1]!);
      const inline = m[2] ?? "";
      if (inline.trim() !== "") {
        // Flat form on the entry's own line: `name: 1.2.3`.
        versions.set(currentName, stripPeerSuffix(unquote(inline)));
        currentName = null;
      }
    } else if (currentName) {
      const m = /^\s*version:\s*(.+)$/.exec(line);
      if (m) versions.set(currentName, stripPeerSuffix(unquote(m[1]!)));
    }
  }
  return versions;
}

interface RootBlocks {
  dependenciesLine: number | null;
  devDependenciesLine: number | null;
  blockIndent: number;
}

/**
 * Finds the root project's `dependencies:`/`devDependencies:` block lines.
 *
 * v9 (and workspace-aware v6) lockfiles nest these under
 * `importers: / '.': ` at 4-space indent; a single-project v6 lockfile has
 * them at the top level (0-space indent) instead. Both are handled here
 * without a general YAML parser — this file only ever needs one thing (the
 * resolved version of each direct dependency), never the full document.
 */
function findRootBlocks(lines: string[]): RootBlocks {
  const importersLine = lines.findIndex((l) => /^importers:\s*$/.test(l));

  let searchStart = 0;
  let blockIndent = 0;
  if (importersLine !== -1) {
    const rootLine = lines.findIndex((l, i) => i > importersLine && /^ {2}\.:\s*$/.test(l));
    if (rootLine === -1) return { dependenciesLine: null, devDependenciesLine: null, blockIndent: 0 };
    searchStart = rootLine + 1;
    blockIndent = 4;
  }

  let dependenciesLine: number | null = null;
  let devDependenciesLine: number | null = null;
  for (let i = searchStart; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "") continue;
    const ind = indentOf(line);
    if (ind < blockIndent) break; // left the root project's own block entirely
    if (ind !== blockIndent) continue;
    if (/^\s*dependencies:\s*$/.test(line)) dependenciesLine = i;
    else if (/^\s*devDependencies:\s*$/.test(line)) devDependenciesLine = i;
    else if (dependenciesLine !== null || devDependenciesLine !== null) break; // next sibling section
  }
  return { dependenciesLine, devDependenciesLine, blockIndent };
}

/**
 * Reads `pnpm-lock.yaml` and returns package name -> resolved version for
 * the root project's direct dependencies (production + dev). No YAML
 * dependency: the shape this needs is narrow and stable enough to read with
 * indentation-aware line parsing instead of a general parser.
 *
 * Refuses (throws `UnsupportedLockfileError`) any `lockfileVersion` outside
 * 6.x/9.x, naming the file and the version found — an unrecognised shape is
 * worse to half-parse than to refuse outright.
 */
export const readPnpmLockfile: LockfileReader = (dir) => {
  const lockPath = join(dir, "pnpm-lock.yaml");
  const raw = readFileSync(lockPath, "utf8");

  const versionMatch = LOCKFILE_VERSION_RE.exec(raw);
  const version = versionMatch?.[1] ?? "unknown";
  const major = version.split(".")[0] ?? version;
  if (!SUPPORTED_MAJORS.has(major)) {
    throw new UnsupportedLockfileError(
      `Unsupported pnpm lockfile version: ${version} (pnpm-lock.yaml). Only lockfileVersion 6.x and 9.x are supported today.`,
    );
  }

  const lines = raw.split("\n");
  const { dependenciesLine, devDependenciesLine, blockIndent } = findRootBlocks(lines);

  const installed = new Map<string, string>();
  if (dependenciesLine !== null) {
    for (const [name, ver] of parseDependencyBlock(lines, dependenciesLine, blockIndent)) installed.set(name, ver);
  }
  if (devDependenciesLine !== null) {
    for (const [name, ver] of parseDependencyBlock(lines, devDependenciesLine, blockIndent)) installed.set(name, ver);
  }
  return installed;
};
