import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LockfileReader } from "./types.js";
import { readNpmLockfile } from "./npm.js";
import { readPnpmLockfile } from "./pnpm.js";
import { readYarnLockfile } from "./yarn.js";

export type { LockfileReader } from "./types.js";
export { UnsupportedLockfileError } from "./types.js";

/** One reader per ecosystem, all behind the same `LockfileReader` shape. */
export const lockfileReaders: Record<string, LockfileReader> = {
  npm: readNpmLockfile,
  pnpm: readPnpmLockfile,
  yarn: readYarnLockfile,
};

// Deterministic priority when more than one lockfile is present in the same
// directory, npm first since it's the most common and the original
// implementation.
const LOCKFILE_FILES: Array<{ manager: string; file: string }> = [
  { manager: "npm", file: "package-lock.json" },
  { manager: "pnpm", file: "pnpm-lock.yaml" },
  { manager: "yarn", file: "yarn.lock" },
];

/**
 * Which package manager's lockfile is present in `dir`, by the priority
 * order above. `null` when none exists. Used to report which manager was
 * detected (table header, refusal messages) — this is presentation, not
 * part of the `--json` schema, which stays frozen at `1`.
 */
export function detectLockfileManager(dir: string): string | null {
  for (const { manager, file } of LOCKFILE_FILES) {
    if (existsSync(join(dir, file))) return manager;
  }
  return null;
}

/**
 * Picks the lockfile reader from whichever lockfile file exists in `dir`
 * and reads it. `dry.ts` and the rest of the callers are unchanged — they
 * still just call `readLockfile(dir)`; only the selector logic is new.
 *
 * No lockfile found at all: unchanged from the original npm-only
 * behaviour — an `ENOENT` naming `package-lock.json`, which `cli.ts`
 * already catches and reports as exit 2.
 */
export const readLockfile: LockfileReader = (dir) => {
  const manager = detectLockfileManager(dir);
  if (!manager) {
    const err = new Error(`ENOENT: no lockfile found in ${dir}`) as NodeJS.ErrnoException;
    err.code = "ENOENT";
    err.path = join(dir, "package-lock.json");
    throw err;
  }
  return lockfileReaders[manager]!(dir);
};
