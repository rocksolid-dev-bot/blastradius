# Exit codes

Without `--fail-on`, `blastradius` always exits `0` on a successful
analysis, no matter how ugly the table is — printing a report is not
failing a build. `--fail-on` is what turns this into a CI gate.

| Code | Meaning |
|---|---|
| `0` | Success. Either `--fail-on` was not given, or it was given and nothing reached the named band. |
| `1` | `--fail-on <band>` was given and at least one dependency's score is at or above that band. The offending package names and bands are printed to stderr. |
| `2` | Usage error: an unknown flag, an invalid `--fail-on` value (anything other than `review` or `urgent`), no `package.json`/lockfile found in the target directory, or a lockfile that is recognised but unreadable (an npm lockfile with a `lockfileVersion` outside 2 and 3, a pnpm lockfile outside the supported 6.x/9.x majors, or a yarn berry/unrecognised `yarn.lock`) — the message names the file and the version/shape found. |
| `3` | Monorepo refusal — a `workspaces` field in `package.json`, `pnpm-workspace.yaml`, or `lerna.json` was found and `--root-only` was not passed. See `--root-only` to analyze the root `package.json` alone. |

## `--fail-on`

```
blastradius --fail-on review    # exit 1 if anything is "review" or "urgent"
blastradius --fail-on urgent    # exit 1 only if something is "urgent"
```

The threshold is **at or above**, not equal to: `--fail-on review` fails on
both `review` and `urgent`; `--fail-on urgent` does not fail on a `review`.
`unused` dependencies never trigger `--fail-on` — they are not scored (see
`docs/scoring.md`).

`--fail-on` composes with `--json`: the exit code reflects `--fail-on`,
and stdout still carries exactly one JSON document, nothing else.

## Monorepo refusal and `--root-only`

Detection is narrow and deliberate — three markers, checked directly, no
heuristics: `workspaces` in `package.json`, `pnpm-workspace.yaml`,
`lerna.json`. A workspace root's own `package.json` typically declares
almost no real dependencies, so analyzing it as if it were a normal
project would print a confidently near-empty table for what might be a
large repo. Refusing by default (exit `3`, marker named in the message) is
safer than a silent wrong answer.

`--root-only` is the explicit escape hatch: it skips the refusal and
analyzes the root `package.json` exactly as a non-monorepo project would,
printing a one-line banner first so the output is never ambiguous about
what happened. There is no workspace-package analysis yet — see the
README's "what it does not do" section.
