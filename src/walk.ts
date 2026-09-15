import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ALWAYS_SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

/**
 * A minimal `.gitignore` matcher — enough for the common cases a real repo's
 * root `.gitignore` uses. It is not a full gitignore implementation:
 * supported are literal path segments, a single directory-anchored prefix
 * (`/build`), trailing-slash directory markers, and `*` as a single-segment
 * wildcard. Negation (`!pattern`), `**`, and nested `.gitignore` files are
 * not handled — good enough for skipping build output, not a substitute for
 * `git check-ignore`.
 */
function parseGitignore(dir: string): string[] {
  let raw: string;
  try {
    raw = readFileSync(join(dir, ".gitignore"), "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function globToRegExp(pattern: string): RegExp {
  const anchored = pattern.startsWith("/");
  const dirOnly = pattern.endsWith("/");
  let body = pattern.replace(/^\//, "").replace(/\/$/, "");
  body = body.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  const prefix = anchored ? "^" : "(^|/)";
  const suffix = dirOnly ? "(/|$)" : "($|/)";
  return new RegExp(`${prefix}${body}${suffix}`);
}

function isIgnored(relPath: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(relPath));
}

/**
 * Walks the source tree from `root`, returning every file with a JS/TS
 * extension. Always skips `node_modules`, `dist`, `.git`; additionally
 * honors the root `.gitignore`, if present.
 */
export function walkSourceFiles(root: string): string[] {
  const patterns = parseGitignore(root).map(globToRegExp);
  const results: string[] = [];

  function visit(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(sep).join("/");

      if (entry.isDirectory()) {
        if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
        if (isIgnored(rel, patterns)) continue;
        visit(full);
        continue;
      }

      if (!entry.isFile()) continue;
      if (isIgnored(rel, patterns)) continue;
      if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      results.push(full);
    }
  }

  if (statSync(root).isDirectory()) visit(root);
  return results.sort();
}
