import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LockfileReader } from "./types.js";

interface NpmLockPackageEntry {
  version?: string;
}

interface NpmLockfile {
  lockfileVersion?: number;
  packages?: Record<string, NpmLockPackageEntry>;
}

// Matches the direct-dependency keys npm v3 lockfiles use under "packages":
// "node_modules/foo" or "node_modules/@scope/foo" — not nested transitive
// installs like "node_modules/foo/node_modules/bar", which this reader
// intentionally skips (top-level installed versions only, for day 1).
const TOP_LEVEL_PACKAGE_KEY = /^node_modules\/((?:@[^/]+\/)?[^/]+)$/;

/**
 * Reads `package-lock.json` (npm lockfileVersion 3, the format npm 7+
 * writes by default) and returns a map of package name -> installed
 * version, for top-level dependencies.
 *
 * Throws if the file is missing or the lockfile version isn't 3 — v1/v2
 * support is out of scope for day 1.
 */
export const readNpmLockfile: LockfileReader = (dir) => {
  const lockPath = join(dir, "package-lock.json");
  const raw = readFileSync(lockPath, "utf8");
  const lock = JSON.parse(raw) as NpmLockfile;

  if (lock.lockfileVersion !== 3) {
    throw new Error(
      `Unsupported npm lockfile version: ${String(lock.lockfileVersion)}. ` +
        "Only lockfileVersion 3 is supported today.",
    );
  }

  const installed = new Map<string, string>();
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (key === "") continue; // the root project entry, not a dependency
    const match = TOP_LEVEL_PACKAGE_KEY.exec(key);
    const name = match?.[1];
    if (!name) continue;
    if (entry.version) installed.set(name, entry.version);
  }
  return installed;
};
