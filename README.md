# blastradius

Ranks outdated npm dependencies by how much of your code actually touches them, not
alphabetically and not by version-jump size alone.

## Output

Run against this repo's own `package.json`:

```
$ blastradius .
package      declared  installed  latest   jump    files  score  band  
vitest       ^2.0.0    2.1.9      5.0.1    major   10     37     review
typescript   ^5.5.0    5.9.3      7.0.2    major   1      23     review
@types/node  ^20.14.0  20.19.43   22.20.3  unused  0      0      ok    
tsx          ^4.16.0   4.23.13    4.23.13  unused  0      0      ok    
```

`vitest` and `typescript` are both a major version behind and are actually imported (10 files
and 1 file respectively), so they rank above `@types/node` and `tsx`, which are declared but
never imported anywhere in `src/` or `test/` — `unused`, not scored, upgrade or remove for free.

As CI would see it:

```
$ blastradius --fail-on review .
package      declared  installed  latest   jump    files  score  band  
vitest       ^2.0.0    2.1.9      5.0.1    major   10     37     review
typescript   ^5.5.0    5.9.3      7.0.2    major   1      23     review
@types/node  ^20.14.0  20.19.43   22.20.3  unused  0      0      ok    
tsx          ^4.16.0   4.23.13    4.23.13  unused  0      0      ok    
blastradius: --fail-on review — 2 dependency(ies) at or above "review": vitest (review), typescript (review)
(exit 1)
```

Full captured session — table, `--json` excerpt, `--fail-on`, `--help` — is in
[`media/2026-09-16-day4.txt`](media/2026-09-16-day4.txt). Every output block on this page is
pasted from that file, not retyped.

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
blastradius — rank outdated dependencies by blast radius, not alphabet

Usage:
  blastradius [dir]                    Ranked table: registry + usage + score (npm only, for now)
  blastradius --json [dir]             Same report as machine-readable JSON on stdout
  blastradius --dry [dir]              Print declared vs. installed versions only, no registry call
  blastradius --fail-on <band> [dir]   Exit 1 if any dependency scores at or above <band> (review|urgent)
  blastradius --root-only [dir]        Monorepo escape hatch: analyze the root package.json only
  blastradius --help                   Show this help and exit

[dir] defaults to the current directory. Registry lookups are cached for 24h
in $XDG_CACHE_HOME/blastradius (or ~/.cache/blastradius); a lookup that
fails for any reason (offline, timeout, 429/5xx, bad body) renders as
"unknown" rather than crashing the run.

A workspace root (`workspaces` in package.json, pnpm-workspace.yaml, or
lerna.json) is refused by default — half-support produces a confidently
wrong answer. Pass --root-only to analyze the root package.json alone.
```

### `--json`

Same report, one JSON document on stdout and nothing else:

```json
{"schemaVersion":1,"dependencies":[{"name":"vitest","declared":"^2.0.0","installed":"2.1.9","latest":"5.0.1","registryStatus":"ok","deprecated":false,"jump":"major","dev":true,"files":["test/cli.test.ts","test/failon-monorepo.test.ts","test/lockfile.test.ts", ...
```

Full field-by-field schema: [`docs/json-schema.md`](docs/json-schema.md).

### `--fail-on <review|urgent>`

Exits `1` when at least one dependency scores at or above the named band; `0` otherwise. The
threshold is *at or above* — `--fail-on review` also fails on `urgent`, `--fail-on urgent` does
not fail on a `review`. Composes with `--json`: the exit code reflects `--fail-on`, stdout still
carries exactly the one JSON document. Full exit-code table below.

### `--root-only`

A monorepo (`workspaces` in `package.json`, `pnpm-workspace.yaml`, or `lerna.json`) is refused by
default, because a workspace root's own `package.json` lists almost no real dependencies and
this tool would print a confidently near-empty table for what might be a large repo:

```
$ blastradius .
blastradius: refusing to run — monorepo marker found (package.json workspaces field).
Workspace packages are not analyzed yet; a workspace root's package.json
lists almost no real dependencies and would print a near-empty, misleading
table. Pass --root-only to analyze the root package.json alone.
(exit 3)

$ blastradius --root-only .
note: --root-only — analyzing the root package.json only, not any workspace packages
package   declared  installed  latest  jump   files  score  band  
left-pad  ^1.3.0    1.3.0      1.3.0   patch  1      40     review
```

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
| `2` | Usage error — unknown flag, invalid `--fail-on` value, or no `package.json`/lockfile found |
| `3` | Monorepo refused — see `--root-only` |

Full detail: [`docs/exit-codes.md`](docs/exit-codes.md).

## CI

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 18
- run: npm ci
- run: npm run build
- run: node dist/cli.js --fail-on review .
```

## What it does not do

- **No monorepo/workspace analysis.** A `workspaces` field, `pnpm-workspace.yaml`, or
  `lerna.json` gets refused (exit `3`); `--root-only` analyzes the root `package.json` alone,
  nothing under `packages/`.
- **npm lockfiles only.** pnpm and yarn are behind the same `LockfileReader` interface but have
  no reader implemented yet.
- **No transitive analysis.** One level — direct dependencies only. A vulnerable dependency of a
  dependency does not show up here.
- **No CVE/advisory data, no automatic upgrades, no non-JS ecosystems.**
- **The scoring weights are a defensible opinion, not a measurement** — see `docs/scoring.md` for
  the reasoning and the one weight (`namespaceImport`) that still lacks a fixture pinning its
  exact contribution across a band boundary.

## License

[MIT](LICENSE).
