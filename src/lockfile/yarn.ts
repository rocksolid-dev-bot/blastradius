import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LockfileReader } from "./types.js";
import { UnsupportedLockfileError } from "./types.js";

/**
 * The set of package names declared directly in `package.json`'s
 * `dependencies` + `devDependencies` (not the lockfile) — used to filter a
 * flat yarn.lock's entries down to top-level packages only, since yarn v1's
 * `yarn.lock` has no structural distinction between a direct dependency and
 * a transitive one (unlike npm's `packages` map or pnpm's `importers:`
 * block, which both mark the root project's own dependencies explicitly).
 */
function declaredTopLevelNames(dir: string): Set<string> {
  const pkgPath = join(dir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
}

const CLASSIC_HEADER_RE = /^# yarn lockfile v1/m;
const BERRY_METADATA_RE = /^__metadata:/m;

function unquoteWhole(value: string): string {
  const t = value.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * The package name out of one specifier, e.g. `left-pad@^1.3.0` ->
 * `left-pad`, `@babel/core@^7.0.0` -> `@babel/core`. A scoped package's own
 * leading `@` is not the version separator, so for those the search starts
 * after it.
 */
function packageNameFromSpecifier(spec: string): string {
  const s = spec.trim();
  const searchFrom = s.startsWith("@") ? 1 : 0;
  const at = s.indexOf("@", searchFrom);
  return at === -1 ? s : s.slice(0, at);
}

/**
 * Reads a classic yarn v1 `yarn.lock` and returns package name -> resolved
 * version for the root project's direct dependencies (production + dev) —
 * the same contract `readNpmLockfile`/`readPnpmLockfile` promise. One entry
 * may declare several comma-separated specifiers for the same resolved
 * package — only the first is needed to recover the name.
 *
 * Found by day 9's real-fixture check (`test/fixtures/yarn-real`): without
 * the `package.json` cross-reference below, this used to return an entry
 * for *every* block in the file, direct or transitive alike — a five-line
 * project with `react-dom` came back with 8 "installed" packages instead
 * of 4, because yarn.lock's flat shape has no structural marker for "this
 * is a top-level dependency" the way npm's `packages` map or pnpm's
 * `importers:` block do.
 *
 * Refuses explicitly (throws `UnsupportedLockfileError`) rather than
 * guessing when the file carries a berry `__metadata:` block, or matches
 * neither the classic header nor berry's marker.
 */
export const readYarnLockfile: LockfileReader = (dir) => {
  const lockPath = join(dir, "yarn.lock");
  const raw = readFileSync(lockPath, "utf8");

  if (BERRY_METADATA_RE.test(raw)) {
    throw new UnsupportedLockfileError(
      `Unsupported yarn lockfile format: yarn.lock carries a berry "__metadata:" block. ` +
        "Only classic yarn lockfile v1 is supported today; yarn berry is refused explicitly, not guessed at.",
    );
  }
  if (!CLASSIC_HEADER_RE.test(raw)) {
    throw new UnsupportedLockfileError(
      `Unrecognised yarn.lock format: no "# yarn lockfile v1" header and no berry "__metadata:" block found ` +
        "(yarn.lock). Refusing rather than guessing at an unknown shape.",
    );
  }

  const lines = raw.split("\n");
  const installed = new Map<string, string>();
  let currentName: string | null = null;

  for (const line of lines) {
    if (line.trim() === "" || line.startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      // A new entry key line: `left-pad@^1.3.0:` or `"@a/b@^1.0.0, @a/b@^1.2.0":`.
      const m = /^(.+):\s*$/.exec(line);
      const wholeKey = m ? unquoteWhole(m[1]!) : null;
      const firstSpecifier = wholeKey?.split(",")[0];
      currentName = firstSpecifier ? packageNameFromSpecifier(firstSpecifier) : null;
      continue;
    }
    if (currentName) {
      const m = /^\s*version\s+"?([^"\s]+)"?\s*$/.exec(line);
      if (m) {
        installed.set(currentName, m[1]!);
        currentName = null;
      }
    }
  }

  const topLevel = declaredTopLevelNames(dir);
  for (const name of installed.keys()) {
    if (!topLevel.has(name)) installed.delete(name);
  }
  return installed;
};
