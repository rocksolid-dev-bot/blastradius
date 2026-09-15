/**
 * A lockfile reader resolves the versions actually installed for a project
 * directory, regardless of which package manager wrote the lockfile.
 *
 * One implementation per ecosystem lives beside this file (npm today; pnpm
 * and yarn are additive later — same signature, new file, no rewrite of the
 * callers in `dry.ts`).
 */
export type LockfileReader = (dir: string) => Map<string, string>;
