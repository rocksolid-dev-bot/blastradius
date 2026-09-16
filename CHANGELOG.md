# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-09-16

### Added

- **Lockfile reading** for npm (`package-lock.json`, `lockfileVersion: 3`), pnpm
  (`pnpm-lock.yaml`, `lockfileVersion` 6.x and 9.x), and yarn classic (`yarn.lock` v1).
  Detected by whichever lockfile file is present, in that priority order when several
  exist. No YAML dependency — each reader is a targeted, indentation-aware parser for
  the one shape it needs. Yarn berry (`__metadata:` block) and any other unrecognised
  lockfile shape or unsupported version are refused explicitly (see exit codes below),
  never half-parsed.
- **Import extraction and usage mapping.** Walks source files (skipping `node_modules`,
  `dist`, `.git`, and anything the root `.gitignore` matches), extracts ESM imports, CJS
  `require()`, and literal dynamic `import()` via the TypeScript compiler API, and
  aggregates per-package usage: files touching it, symbols used, default/namespace
  import, type-only usage, dev-only usage.
- **Registry-backed semver classification.** Fetches each declared dependency's latest
  version and deprecation status from `registry.npmjs.org`, with a 24h disk cache, a
  4-worker pool, and 10s timeouts; any failure (offline, timeout, 429/5xx, bad body)
  degrades to `"unknown"` rather than crashing the run. Classifies the jump from
  installed/declared to latest as `major` / `minor` / `patch` / `prerelease` /
  `unsupported` / `unknown` via a hand-written ~90-line parser (no `semver` dependency).
- **Scoring.** Combines the semver jump, usage breadth (files, symbols, namespace
  import), and deprecation into a single score and band (`ok` / `review` / `urgent`),
  with multipliers that only ever lower risk (type-only, dev-only). Declared-but-unused
  dependencies are flagged `unused` and excluded from scoring rather than given a
  misleading low score. Full weight table and rationale in `docs/scoring.md`.
- **Table and `--json` output.** A plain-text ranked table (no ANSI/colour dependency,
  shrinks the package column on a narrow terminal) or a single JSON document on stdout
  (`schemaVersion: 1`, documented field-by-field in `docs/json-schema.md`). The detected
  lockfile manager is named above the table header; it is presentation only and is not
  part of the JSON schema.
- **`--fail-on <review|urgent>`** for CI gating: exits `1` if any non-`unused` dependency
  scores at or above the named band, composing cleanly with `--json`.
- **Monorepo detection and refusal.** A `workspaces` field in `package.json`,
  `pnpm-workspace.yaml`, or `lerna.json` is refused by default (a workspace root's own
  `package.json` would otherwise print a confidently near-empty table); `--root-only` is
  the explicit escape hatch to analyze the root `package.json` alone.
- **`--dry`** for a quick declared-vs-installed version check with no registry call.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | `--fail-on <band>` was given and reached |
| `2` | Usage error, or a lockfile that is recognised but unreadable (wrong npm/pnpm lockfile version, yarn berry, or an unrecognised yarn shape) — the message names the file and the version/shape found |
| `3` | Monorepo detected and refused (see `--root-only`) |

### Not in this release

No npm publish (decided in writing at REFLECT: no CI of its own yet, and the newest
lockfile-reader code had never been executed as of the cycle that added it — a GitHub
release is the reversible way to say "this is done"). No `--explain`, no transitive
dependency analysis, no workspace-package analysis, no JSON schema change beyond what's
listed above.
