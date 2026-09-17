# blastradius

Ranks outdated dependencies by how much of your code actually touches them, not
alphabetically and not by version-jump size alone. Reads npm, pnpm, and yarn classic
lockfiles.

## Output

Run against this repo's own `package.json` (npm lockfile — note the detected manager
named above the table):

```
$ blastradius .
lockfile: npm
package      declared  installed  latest   jump    files  score  band  
vitest       ^2.0.0    2.1.9      5.0.1    major   10     37     review
typescript   ^5.5.0    5.9.3      7.0.2    major   1      23     review
@types/node  ^20.14.0  20.19.43   22.20.3  unused  0      0      ok    
tsx          ^4.16.0   4.23.13    4.23.13  unused  0      0      ok    
(exit 0)
```

`vitest` and `typescript` are both a major version behind and are actually imported (10 files
and 1 file respectively), so they rank above `@types/node` and `tsx`, which are declared but
never imported anywhere in `src/` or `test/` — `unused`, not scored, upgrade or remove for free.

As CI would see it:

```
$ blastradius --fail-on review .
lockfile: npm
package      declared  installed  latest   jump    files  score  band  
vitest       ^2.0.0    2.1.9      5.0.1    major   10     37     review
typescript   ^5.5.0    5.9.3      7.0.2    major   1      23     review
@types/node  ^20.14.0  20.19.43   22.20.3  unused  0      0      ok    
tsx          ^4.16.0   4.23.13    4.23.13  unused  0      0      ok    
blastradius: --fail-on review — 2 dependency(ies) at or above "review": vitest (review), typescript (review)
(exit 1)
```

Full captured session — table, `--json` excerpt, `--fail-on`, `--help`, the monorepo refusal,
`--root-only`, and a pnpm-detected run — is in
[`media/2026-09-16-day5.txt`](media/2026-09-16-day5.txt). Every output block on this page is
pasted from that file, none retyped.

## Install

```
git clone https://github.com/rocksolid-dev-bot/blastradius.git
cd blastradius
npm ci
npm run build
node dist/cli.js .
```

Needs Node `>=18` (`engines` in `package.json`). Built and tested on Node 18.19.1.

## Usage

```
$ blastradius --help
blastradius — rank outdated dependencies by blast radius, not alphabet

Usage:
  blastradius [dir]                    Ranked table: registry + usage + score (npm, pnpm, or yarn classic)
  blastradius --json [dir]             Same report as machine-readable JSON on stdout
  blastradius --dry [dir]              Print declared vs. installed versions only, no registry call
  blastradius --fail-on <band> [dir]   Exit 1 if any dependency scores at or above <band> (review|urgent)
  blastradius --root-only [dir]        Monorepo escape hatch: analyze the root package.json only
  blastradius --explain <pkg> [dir]    Print the score breakdown and per-file usage for one package
  blastradius --help                   Show this help and exit

[dir] defaults to the current directory. Registry lookups are cached for 24h
in $XDG_CACHE_HOME/blastradius (or ~/.cache/blastradius); a lookup that
fails for any reason (offline, timeout, 429/5xx, bad body) renders as
"unknown" rather than crashing the run.

A workspace root (`workspaces` in package.json, pnpm-workspace.yaml, or
lerna.json) is refused by default — half-support produces a confidently
wrong answer. Pass --root-only to analyze the root package.json alone.

Exit codes:
  0  success — --fail-on's band was not reached (or --fail-on was not given)
  1  --fail-on's band was reached by at least one dependency
  2  usage error — unknown flag, invalid --fail-on value, or no package.json found
  3  monorepo detected and refused (see --root-only)
(exit 0)
```

### `--json`

Same report, one JSON document on stdout and nothing else:

```json
{"schemaVersion":1,"dependencies":[{"name":"vitest","declared":"^2.0.0","installed":"2.1.9","latest":"5.0.1","registryStatus":"ok","deprecated":false,"jump":"major","dev":true,"files":["test/cli.test.ts","test/failon-monorepo.test.ts","test/lockfile.test.ts","test/registry.test.ts","test/report.test.ts","test/scoring.test.ts","test/semver.test.ts","test/table.test.ts","test/usageMap.test.ts","vitest.config.ts"],"symbols":["afterEach","beforeEach","defineConfig","describe","expect","it","vi"],"namespaceImport":false,"typeOnly":false,"devOnly":true,"unused":false,"score":37,"band":"review"},{"name":"typescript","declared":"^5.5.0","installed":"5.9.3","latest":"7.0.2","registryStatus":"ok","dep
```

`schemaVersion` is `1` and does not carry the detected lockfile manager — that's presentation
only (see the table header above), not part of the machine-readable shape. Full field-by-field
schema: [`docs/json-schema.md`](docs/json-schema.md).

### `--fail-on <review|urgent>`

Exits `1` when at least one dependency scores at or above the named band; `0` otherwise. The
threshold is *at or above* — `--fail-on review` also fails on `urgent`, `--fail-on urgent` does
not fail on a `review`. Composes with `--json`: the exit code reflects `--fail-on`, stdout still
carries exactly the one JSON document. Full exit-code table below.

### `--root-only` and monorepo refusal

A monorepo (`workspaces` in `package.json`, `pnpm-workspace.yaml`, or `lerna.json`) is refused by
default, because a workspace root's own `package.json` lists almost no real dependencies and
this tool would print a confidently near-empty table for what might be a large repo:

```
$ blastradius test/fixtures/monorepo-workspaces
blastradius: refusing to run — monorepo marker found (package.json workspaces field).
Workspace packages are not analyzed yet; a workspace root's package.json
lists almost no real dependencies and would print a near-empty, misleading
table. Pass --root-only to analyze the root package.json alone.
(exit 3)

$ blastradius --root-only test/fixtures/monorepo-workspaces
note: --root-only — analyzing the root package.json only, not any workspace packages
lockfile: npm
package   declared  installed  latest  jump   files  score  band  
left-pad  ^1.3.0    1.3.0      1.3.0   patch  1      40     review
(exit 0)
```

### `--explain <package>`

A text-only deep dive on one package: the score, then every scoring component and multiplier
that produced it, then the file list showing which symbols each file actually uses. `--json`
does not carry this breakdown — it's the renderer this flag exists for, and only that.

```
$ blastradius --explain typescript .
typescript: score 23 (review)

components:
  jump: 40
  files: 3
  symbols: 2
  namespace: 0
  deprecated: 0
multipliers:
  type-only: x1
  dev-only: x0.5

files:
  src/imports.ts: default
```

Naming a package that isn't in `package.json` at all is a usage error, same family as an unknown
flag — it exits `2` and names the package, without ever hitting the registry:

```
$ blastradius --explain not-a-real-dep .
blastradius: package "not-a-real-dep" is not declared in package.json
exit=2
```

### pnpm and yarn

Detection is by which lockfile is present (`package-lock.json` → npm, `pnpm-lock.yaml` → pnpm,
`yarn.lock` → yarn classic — that priority order when more than one exists). The detected
manager is named above the table, as shown here against a pnpm project:

```
$ blastradius test/fixtures/pnpm-basic
lockfile: pnpm
package     declared  installed  latest  jump    files  score  band
left-pad    ^1.3.0    1.3.0      1.3.0   unused  0      0      ok  
typescript  ^5.4.0    5.9.3      7.0.2   unused  0      0      ok  
(exit 0)
```

Yarn classic (`# yarn lockfile v1`) works the same way. Yarn berry (`__metadata:` block) and any
pnpm `lockfileVersion` outside 6.x/9.x are refused explicitly (exit `2`, naming the file and the
version/shape found) rather than half-parsed on a guess.

## Scoring

Every declared dependency gets a **score** and a **band** (`ok` / `review` / `urgent`).
Copied verbatim from [`docs/scoring.md`](docs/scoring.md), which is the source of truth:

| Signal | Source | Weight | Direction |
|---|---|---|---|
| semver jump — major | `classifyJump` | **40** | raises risk |
| semver jump — prerelease | `classifyJump` | **10** | raises risk |
| semver jump — minor | `classifyJump` | **15** | raises risk |
| semver jump — patch | `classifyJump` | **5** | raises risk |
| semver jump — unsupported/unknown | `classifyJump` | **0** | no data to score |
| files touching it | `usageMap.files.length` | **3 per file, capped at 20** | more files = more blast radius |
| distinct symbols used (+ default import) | `usageMap.symbols.length + (defaultImport ? 1 : 0)` | **2 per symbol, capped at 15** | wider API surface = more to break |
| namespace import (`import * as x`) | `usageMap.namespaceImport` | **+10 flat** | whole-module use, harder to audit |
| deprecated | registry `versions[latest].deprecated` | **+30 flat** | raises risk regardless of version distance |
| type-only usage | `usageMap.typeOnly` | **×0.3 on the total** | lowers risk — compile-time only, nothing ships |
| dev-only usage | `usageMap.devOnly` | **×0.5 on the total** | lowers risk — not shipped to production |

```
raw   = jumpWeight + filesWeight + symbolsWeight + namespaceWeight + deprecatedWeight
score = round(raw × typeOnlyMultiplier × devOnlyMultiplier)
```

Bands: `urgent` ≥ 50, `review` ≥ 20, `ok` < 20. A declared-but-never-imported dependency is
flagged `unused: true` and given `score: 0` instead of being scored — it's a free upgrade, not a
risk judgment.

These weights are a defensible opinion, not a measurement — see the "why these numbers" section
of `docs/scoring.md` for the reasoning behind each one. `namespaceImport`'s flat +10 is pinned to
a real band crossing by a fixture in `test/scoring.test.ts` as of day 4.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success — `--fail-on` not given, or given and not reached |
| `1` | `--fail-on <band>` was given and reached |
| `2` | Usage error — unknown flag, invalid `--fail-on` value, no `package.json`/lockfile found, or a lockfile that is recognised but unreadable (naming the file and the version/shape found) |
| `3` | Monorepo refused — see `--root-only` |

Full detail: [`docs/exit-codes.md`](docs/exit-codes.md).

## CI

`.github/workflows/ci.yml` exists in this repo's history — `npm ci`, `npx tsc --noEmit`,
`npm run build`, `npm test`, then `node dist/cli.js --help` and `npm link && blastradius --help`
as smoke tests of the built binary and the `bin` entry point, on Node 18 (the floor in `engines`)
and Node 22 — **but it has never reached `origin`**: the configured push token (a fine-grained
PAT) lacks the "Workflows" repository permission GitHub requires to accept a push touching
`.github/workflows/`. No badge, no run, no green checkmark to point at honestly. See `STATUS.md`
for the exact rejection and what would unblock it (a token regrant, not something fixable from
inside a build cycle).

**The actual release gate is `scripts/prepush.sh`, run locally.** Every tagged release since
`v0.2.0` was cut on a real run of it, not on GitHub Actions: `npm ci` → `npx tsc --noEmit` →
`npm run build` → `npm test` → install the package into a throwaway global prefix
(`npm i -g --prefix /tmp/br-prefix .`, not `npm link` — no root, no global state left behind) →
invoke `/tmp/br-prefix/bin/blastradius --help` through the exact symlink shape npm's `bin`
field creates. That last step is not cosmetic: it is what caught this project's two `bin`-related
defects (the day-7 entry-point guard, and the day-9 `typescript` runtime dependency that only
`devDependencies` had, so a real global install crashed with `ERR_MODULE_NOT_FOUND` while
`npm test` stayed green). No step touches the network beyond npm itself; the suite mocks the
registry.

## What it does not do

- **No monorepo/workspace analysis.** A `workspaces` field, `pnpm-workspace.yaml`, or
  `lerna.json` gets refused (exit `3`); `--root-only` analyzes the root `package.json` alone,
  nothing under `packages/`.
- **npm, pnpm, and yarn classic (v1) lockfiles are read; yarn berry is refused by name.**
  Berry's `__metadata:` shape is detected and rejected explicitly (exit `2`) rather than
  half-parsed — it was cut this cycle to keep classic-plus-pnpm solid rather than guess at a
  third shape untested.
- **No transitive analysis.** One level — direct dependencies only. A vulnerable dependency of a
  dependency does not show up here.
- **No CVE/advisory data, no automatic upgrades, no non-JS ecosystems.**
- **No workspace-package-level detection of which manager a monorepo's sub-packages use** — the
  manager named above the table is whichever lockfile sits in the analyzed directory itself.
- **The scoring weights are a defensible opinion, not a measurement** — see `docs/scoring.md` for
  the reasoning and the one weight (`namespaceImport`) that still lacks a fixture pinning its
  exact contribution across a band boundary.

## License

[MIT](LICENSE).
