# `--json` output schema

`blastradius --json [dir]` writes exactly one JSON document to stdout and
nothing else on stdout (diagnostics, if any, go to stderr). Pretty-printing
is not applied — pipe through `jq` if you want it readable.

## Top level

```ts
{
  schemaVersion: number,       // currently 1 — bump when this shape changes
  dependencies: Dependency[],  // sorted by score descending
  skipped: SkippedImport[],    // non-literal dynamic import() calls found during the source walk
}
```

`schemaVersion` exists so a future breaking change to this shape has a
marker a consumer can check before parsing — it will not always be `1`.

## `Dependency`

| Field | Type | Meaning |
|---|---|---|
| `name` | `string` | Package name as declared |
| `declared` | `string` | The range/version string from `package.json` |
| `installed` | `string` | Exact version from the lockfile, or the literal `"missing"` |
| `latest` | `string \| null` | `dist-tags.latest` from the registry, or `null` when unresolvable |
| `registryStatus` | `"ok" \| "unknown"` | Whether the registry lookup succeeded |
| `deprecated` | `boolean` | Whether the `latest` version carries a `deprecated` field |
| `jump` | `"patch" \| "minor" \| "major" \| "prerelease" \| "unsupported" \| "unknown"` | Semver distance from installed/declared to latest — see `docs/scoring.md` |
| `dev` | `boolean` | Declared in `devDependencies` (day-1 flag, not a usage inference) |
| `files` | `string[]` | Repo-relative paths that import this package |
| `symbols` | `string[]` | Distinct named symbols imported from it, sorted |
| `namespaceImport` | `boolean` | Whether any import uses `import * as x` |
| `typeOnly` | `boolean` | True only when *every* import of this package is type-only |
| `devOnly` | `boolean` | Same as `dev` today — see `usageMap.ts` for the file-level TODO |
| `unused` | `boolean` | Declared but zero files import it — not scored, see `docs/scoring.md` |
| `score` | `number` | Rounded integer; `0` when `unused` |
| `band` | `"ok" \| "review" \| "urgent"` | See `docs/scoring.md` for thresholds |

## `SkippedImport`

| Field | Type | Meaning |
|---|---|---|
| `file` | `string` | Absolute path of the file containing the skipped import |
| `reason` | `string` | Why it couldn't be resolved statically (currently: non-literal dynamic `import()`) |

## What `unknown` means, precisely

`unknown` appears in two independent places and means slightly different
things in each:

- `registryStatus: "unknown"` / `latest: null` — the registry lookup
  itself failed (offline, timeout, 429/5xx after one attempt, non-JSON
  body, or a missing `dist-tags.latest` field). Nothing about the package's
  real state is implied either way.
- `jump: "unknown"` — either `latest` is `null` (above), or the declared
  range has no fixed base version to diff from (a wildcard like `*` or
  `latest`). `jump: "unsupported"` is the separate case for git/file/
  workspace specifiers, which are never classified at all.

Both render as the literal string `"unknown"` in the table; `--json` keeps
them as their typed values (`null` for `latest`, the string `"unknown"` for
`jump`/`registryStatus`) so a consumer can branch on them without string
matching against table output.
