import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

// Regression test for the day-7 bin bug: cli.ts's entry-point guard compared
// `import.meta.url` against `"file://" + process.argv[1]` verbatim. Invoked through
// a symlink -- the exact shape `npm link` / a `bin` field produces -- `argv[1]` stays
// the symlink path while the module URL resolves to the realpath, so the two never
// matched and the CLI silently did nothing. This starts the tool the way the `bin`
// entry actually starts it: through a symlink, not a new argument to `node dist/cli.js`.
describe("bin entry point via symlink (the way npm's `bin` starts it)", () => {
  const distCli = resolve(here, "..", "dist", "cli.js");

  it("runs and prints usage when invoked through a symlink", () => {
    if (!existsSync(distCli)) {
      // No build present -- fail loudly rather than silently skipping, which is how
      // this exact bug survived six days undetected.
      throw new Error(
        `dist/cli.js not found at ${distCli}. Run \`npm run build\` before \`npm test\`.`,
      );
    }

    const dir = mkdtempSync(join(tmpdir(), "blastradius-bin-test-"));
    const link = join(dir, "blastradius-link.js");
    try {
      symlinkSync(distCli, link);
      const output = execFileSync(process.execPath, [link, "--help"], {
        encoding: "utf8",
      });
      expect(output.length).toBeGreaterThan(0);
      expect(output).toContain("Usage:");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
