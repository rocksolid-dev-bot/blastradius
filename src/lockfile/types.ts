/**
 * A lockfile reader resolves the versions actually installed for a project
 * directory, regardless of which package manager wrote the lockfile.
 *
 * One implementation per ecosystem lives beside this file (npm today; pnpm
 * and yarn are additive later — same signature, new file, no rewrite of the
 * callers in `dry.ts`).
 */
export type LockfileReader = (dir: string) => Map<string, string>;

/**
 * Thrown when a lockfile exists but its format/version is not one this
 * reader understands (an unrecognised `lockfileVersion`, or a yarn file
 * matching neither the classic nor the berry shape). A wrong version table
 * is worse than no table, so this is a loud refusal, not a best-effort
 * guess or a silent fallback to `package.json` ranges. Callers translate
 * this into exit code 2, the same family as other usage errors.
 */
export class UnsupportedLockfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedLockfileError";
  }
}
