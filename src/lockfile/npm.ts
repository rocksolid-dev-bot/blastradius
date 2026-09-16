import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LockfileReader } from "./types.js";
import { UnsupportedLockfileError } from "./types.js";

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
 * Reads `package-lock.json` (npm lockfileVersion 2 or 3, what npm 7+
 * writes) and returns a map of package name -> installed version, for
 * top-level dependencies. Both versions carry the same `"packages"` map
 * this reader depends on.
 *
 * Throws `UnsupportedLockfileError` if the file is missing (ENOENT, left
 * to propagate) or the lockfile version is anything other than 2 or 3 —
 * version 1 (npm 6) has only the legacy `"dependencies"` tree, no
 * `"packages"` key, and is refused by name rather than guessed at.
 */
export const readNpmLockfile: LockfileReader = (dir) => {
  const lockPath = join(dir, "package-lock.json");
  const raw = readFileSync(lockPath, "utf8");
  const lock = JSON.parse(raw) as NpmLockfile;

  if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3) {
    throw new UnsupportedLockfileError(
      `Unsupported npm lockfile version: ${String(lock.lockfileVersion)} (package-lock.json). ` +
        "lockfileVersion 2 or 3 is supported (npm 7+); run `npm install` with npm 7 or newer to upgrade the lockfile.",
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
