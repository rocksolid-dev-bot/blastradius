# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-09-18

The closing release for this project. No feature was added this cycle — everything below is
verification and correction of work already shipped in 0.2.0.

### Fixed

- **`urgent`-band reachability is now tested, not just observed.** Day 9 found the `urgent`
  band never fired across 184 dependencies from five actively maintained repos and left open
  whether the 50-point threshold was set too high or the sample simply had no abandoned
  dependencies in it. `test/scoring.test.ts` now pins the three reachable routes as asserted
  fixtures (`deprecated(30) + files capped at 20 = 50`; `major(40) + 1 file(3) +
  namespace(10) = 53`; the same major jump one component short at `49`, staying `review`), and
  a second, deliberately older/smaller-biased sample (`istanbuljs/nyc`) made `urgent` fire for
  real: `find-cache-dir` at 73 (deprecated + major jump, one file — a fourth, previously
  unenumerated route) and `make-dir` at 58 (major jump, six-file usage breadth). Day 9's null
  result was the sample, not the threshold. Full arithmetic and both calibration runs in
  `docs/calibration.md`.
- **Two causal sentences in `docs/calibration.md` corrected against their own cited data.**
  `find-cache-dir`'s 73 was mislabeled "the deprecated route"; it is deprecated *and* a major
  jump on one file (`30 + 40 + 3`), a third route the boundary-arithmetic section had not
  enumerated. `yeoman-assert`'s 28 was blamed on "thin usage"; its usage is real (eight
  importing files, raw score 55 — over the threshold), and what actually halves it into
  `review` is the dev-only `×0.5` multiplier, which the original sentence never mentioned.
- **The day-10 capture the doc's strongest provenance claim depended on was never committed.**
  `docs/calibration.md` cited `media/2026-09-18-day10.txt` from a path the shipped repo did not
  contain — the file existed only in the workspace, one directory above the repo the container
  mounts. Now committed at `media/2026-09-18-day10.txt`.

### Investigated, not changed

- **The `tapable`/`es-module-lexer` ordering disagreement (open since day 9): tried, reverted.**
  On `webpack/webpack`, a 2-file major-version bump outranks a 38-file patch bump, because both
  hit the same file-breadth cap. Raising `FILES_WEIGHT_CAP` from 20 to 30 does fix the ordering
  (`tapable` review→urgent, correctly above `es-module-lexer`), but a real-repo collateral check
  against a fresh `webpack` clone found it also silently re-bands two unrelated packages
  (`lodash`, `memfs`, both `ok→review`) — a band retune in disguise. Reverted;
  `src/scoring.ts` is unchanged from 0.2.0. The red test, the real numbers, and the full
  collateral evidence are kept (`test/scoring.test.ts`, `it.skip`; `docs/calibration.md`) for
  whichever future project picks this back up.
- **Whether `DEV_ONLY_MULTIPLIER` (0.5) is right for a deprecated package.** Found while fixing
  the `yeoman-assert` sentence above: a deprecated package imported in eight files scores 55
  raw — solidly `urgent` — but lands at 28 solely for being a dev dependency, even though dev
  dependencies still execute in CI and on every contributor's machine. Written down as an open
  question in `docs/calibration.md`, deliberately not changed this cycle (one weight-change
  budget already spent above).

## [0.2.0] - 2026-09-18

### Changed

- **The v0.2.0 release gate no longer depends on GitHub Actions.** The gate's purpose was
  "proven green before a tag"; Actions was one way to prove that, never the only one. The
  configured push token (a fine-grained PAT) cannot push anything under
  `.github/workflows/` — every push attempt is rejected server-side for missing the
  "workflow" scope. `.github/workflows/ci.yml` exists in this repo's history and is correct,
  but has never reached `origin` and has no runs on GitHub to point at. `scripts/prepush.sh`
  is now the real gate: `npm ci` → `tsc --noEmit` → `npm run build` → `npm test` → install
  into a throwaway global prefix and invoke the `bin` shim through the exact symlink shape
  npm creates. This release was cut on a real, captured, green run of that script.

### Added

- `--explain <package> [dir]`: prints the full score breakdown (every component, every
  multiplier) and the per-file symbol usage for one package. Wires in the `breakdown` and
  `perFile` signals that scoring/usage tracking had computed since day 7 but nothing
  consumed. `--json`'s shape is unchanged (`schemaVersion` stays `1`; no `breakdown` or
  `perFile` key) — `--explain` is a text renderer, not a schema change.

### Fixed

- **`typescript` was a runtime dependency living only in `devDependencies`.** `src/imports.ts`
  imports the TypeScript compiler API to parse source files, but the package had never been
  moved out of `devDependencies` — so `npm i -g` (the exact install a real user or the `bin`
  field needs) omitted it, and the installed binary crashed with `ERR_MODULE_NOT_FOUND` on
  first use, while `npm test` stayed green because dev dependencies are present during
  testing. Caught by `scripts/prepush.sh`'s throwaway-global-install step — the reason that
  step exists. Fixed by moving `typescript` to `dependencies` (already license-checked,
  Apache-2.0, see `BRIEF.md`); `test/deps.test.ts` now pins the whole class of bug by
  asserting every non-relative, non-`node:` import anywhere in `src/` is a declared
  `dependencies` entry, not just a `devDependencies` one.

## [0.1.1] - 2026-09-17

### Fixed

- **Refusal exit codes on the `--dry` and npm paths.** Two of the three documented
  exit-`2` refusal paths actually exited `1`: `cli.ts`'s `--dry` branch had its own
  `try/catch` that had never heard of `UnsupportedLockfileError`, and `src/lockfile/npm.ts`
  predated the shared error class and threw a plain `Error`. This was a defect shipped
  in 0.1.0, not a new regression — `docs/exit-codes.md` documented both cases as exit `2`
  from day one, while the shipped binary disagreed. Both paths now throw and catch the
  same type; see `test/exit-codes.test.ts` for the behavioural table (every documented
  exit code, every entry point) that pins it.

### Added

- **npm `lockfileVersion: 2` support.** `package-lock.json` files written by npm 7/8
  (lockfileVersion 2) are now read the same way as lockfileVersion 3 — both carry the
  same `"packages"` map. lockfileVersion 1 (npm 6, legacy `"dependencies"` tree only) is
  still refused explicitly, by name, with a message naming the file and the version found.

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
