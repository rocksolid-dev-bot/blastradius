import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The three common monorepo/workspace markers this tool refuses on by
 * default: a `workspaces` field in `package.json`, a `pnpm-workspace.yaml`,
 * or a `lerna.json`. Half-support would produce a confidently wrong answer
 * — a workspace root's `package.json` lists almost no real dependencies —
 * so detection is deliberately narrow and the message names exactly which
 * marker fired.
 */
export type MonorepoMarker = "package.json workspaces field" | "pnpm-workspace.yaml" | "lerna.json";

/**
 * Returns the first monorepo marker found in `dir`, or `null` when none of
 * the three markers are present. Never throws: a missing/unreadable
 * `package.json` here is not this function's problem to report — the
 * normal dependency-reading path surfaces that separately.
 */
export function detectMonorepoMarker(dir: string): MonorepoMarker | null {
  if (existsSync(join(dir, "pnpm-workspace.yaml"))) return "pnpm-workspace.yaml";
  if (existsSync(join(dir, "lerna.json"))) return "lerna.json";

  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { workspaces?: unknown };
      if (pkg.workspaces !== undefined) return "package.json workspaces field";
    } catch {
      // Malformed package.json is reported by the normal dependency-reading
      // path (exit 2 usage error), not by monorepo detection.
    }
  }

  return null;
}
