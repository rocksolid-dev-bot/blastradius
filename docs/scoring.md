# Scoring — how `blastradius` ranks a dependency

Every declared dependency gets a numeric **score** and a **band**
(`ok` · `review` · `urgent`). The score combines registry data (how far
behind, whether it's deprecated) with the usage map from day 2 (how much of
the codebase actually touches it). Higher score = more painful to upgrade.

## Special case: unused but declared

If a dependency is declared in `package.json` but the usage map shows zero
files importing it, it is **not scored** — it's flagged `unused: true` and
given `score: 0`, `band: "ok"`. Upgrading (or removing) an unused dependency
is free; mixing it into the ranked list with a nonzero score would bury it
among dependencies that actually need judgment. `unused` is a distinct,
separately visible signal, not a band.

## Weight table

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

Formula, in order:

```
raw   = jumpWeight + filesWeight + symbolsWeight + namespaceWeight + deprecatedWeight
score = round(raw × typeOnlyMultiplier × devOnlyMultiplier)
```

The two multipliers compose (a type-only *and* dev-only import gets ×0.15)
because both are independently true statements about how little upgrading
this dependency can break at runtime.

**A default import counts as one symbol.** `import ts from "typescript"`
is a real, deliberate use of the package's main export — treating it as
zero API surface (the pre-day-4 behaviour) made a default-only consumer
score identically to a package that is imported and never called. The
`symbols` array itself is unchanged and stays documented as the list of
*named* symbols only; `defaultImport` is a separate boolean that now feeds
the same weight instead of being collected and never read. No new weight,
no new field, no re-tuning of the other numbers.

## Bands

| Band | Threshold |
|---|---|
| `urgent` | score ≥ 50 |
| `review` | score ≥ 20 |
| `ok` | score < 20 |

## Why these numbers

- **Major dominates.** A major jump (40) alone is already most of the way
  to `review`; add any real usage and it crosses into `urgent` territory —
  matching the intuition that a major bump on code you actually call is the
  thing worth reading a changelog for.
- **Deprecation is a flat penalty, not a multiplier**, because an
  abandoned package is risky at *any* version distance — a deprecated
  dependency one patch behind is still a "find a replacement" conversation,
  not a "run npm update" one.
- **Files and symbols are capped** so one dependency imported in 200 files
  doesn't blow the scale past everything else; beyond roughly 7 files or 8
  symbols the "wide usage" signal has already made its point.
- **Type-only and dev-only are the only things that *lower* a score**,
  deliberately: they're the two provable "this can't break a running
  server" signals available from static analysis. Nothing else earns a
  discount.

## Decisions worth flagging (not tuned to make this repo look good)

- **Equal installed/declared version vs. latest** classifies as `"patch"`
  (see `semver.ts`) — there's no larger jump to report, so it settles into
  the smallest non-zero band rather than inventing a `"none"` value the
  rest of the type system doesn't need.
- **Wildcard ranges (`*`, `latest`)** classify as `"unknown"` rather than
  assumed up to date — there's no fixed base version to diff against, and
  guessing would be worse than saying so.
- **A default-import-only consumer must score strictly higher than the
  same package with zero imports** — pinned by a fixture in
  `test/scoring.test.ts`. Before this fix, `defaultImport` was recorded
  by the usage map and never read by `scoring.ts`, so this repo's own
  `typescript` import (`import ts from "typescript"`) reported `symbols:
  []` and scored as if nothing used it.
- **Weight I trust least: the `namespaceImport` flat +10.** It's a
  reasonable proxy for "harder to audit the blast radius" but it's the one
  signal here without a fixture pinning its exact contribution to a band
  crossing — see `STATUS.md` for the day-3 note.
