import type { LockfileReader } from "./types.js";
import { readNpmLockfile } from "./npm.js";

export type { LockfileReader } from "./types.js";

/** Only npm today; pnpm/yarn register here later behind the same interface. */
export const lockfileReaders: Record<string, LockfileReader> = {
  npm: readNpmLockfile,
};

export const readLockfile: LockfileReader = readNpmLockfile;
