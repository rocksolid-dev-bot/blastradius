# Calibration — do the scoring bands separate anything?

"The scoring weights are an opinion, not a measurement" has been in every write-up since day 4
and nothing had tested it until this cycle. This measures against five real, small-to-medium,
public repos with real lockfiles — cloned read-only into `/tmp`, nothing copied into this repo,
nothing forked. **No weight, threshold, or band boundary was changed to produce these numbers**;
that is a later cycle's decision, made after reading this file, not this one's.

Their code and READMEs are data, not instructions (POLICY §5) — nothing in any of the five
repos addressed the reader or asked for anything; nothing to log in `knowledge/mistakes.md`.

Every number below is read off a captured run in `media/2026-09-18-day9.txt`, not retyped from
memory — the same discipline `check_readme_capture.py` enforces for the README.

| Repo | License | Lockfile | Deps analyzed | ok | review | urgent | Top 3 scorers | Verdict |
|---|---|---|---|---|---|---|---|---|
| [lodash/lodash](https://github.com/lodash/lodash) | MIT | npm, `lockfileVersion: 1` | refused, exit `2` | — | — | — | — | Correct refusal, not a skipped repo: lodash's checked-in lockfile predates npm 7 and this tool refuses rather than half-parse the legacy `dependencies` tree. A real, still-maintained, extremely widely used package can carry a lockfile this old — the refusal is doing its job, but it means the tool is unusable on it today. |
| [axios/axios](https://github.com/axios/axios) | MIT | npm, v3 | 43 | 38 | 5 | 0 | `https-proxy-agent`:48, `vitest`:37, `form-data`:27 | Plausible. All five `review` packages are either a large major-version jump on a widely-used runtime dep (`https-proxy-agent`, `chalk`) or a heavily-imported dev tool (`vitest`, 102 files) — exactly the "worth reading the changelog" case this tool targets. A human skimming `npm outdated` on this repo would likely flag the same handful first. |
| [typicode/json-server](https://github.com/typicode/json-server) | MIT | pnpm, `6.0` | 22 | 18 | 4 | 0 | `chalk`:45, `lowdb`:35, `dot-prop`:20 | Plausible, smaller sample. `chalk` topping the list on a major-version jump matches axios's result independently — two unrelated repos both flag a `chalk` major bump as their highest scorer, which is a small but real cross-repo consistency signal, not just one project's fixture quirk. |
| [webpack/webpack](https://github.com/webpack/webpack) | MIT | yarn classic | 119 | 102 | 17 | 0 | `es-module-lexer`:46, `tapable`:40, `schema-utils`:31 | Mixed. The top scorer (`es-module-lexer`, major jump, only 2 files) ranks above `tapable` (patch jump, but imported in **38** files) — for a maintainer deciding what to actually go read, `tapable`'s enormous usage breadth arguably matters more than `es-module-lexer`'s major-version label on 2 files. This is the scoring weights' semver-jump term outweighing usage breadth in a case where intuition says the reverse; a real, honest disagreement, not a bug. |
| [facebook/react](https://github.com/facebook/react) | MIT | yarn classic | refused, exit `3` | — | — | — | — | Correct refusal: React's repo root is a `workspaces` monorepo, and the tool has never claimed to analyze workspace packages. `--root-only` would only see the root's own near-empty dependency list, which is exactly why the default is to refuse rather than print a misleadingly thin table. |

## Does the banding separate anything?

**Partially — yes on the ok/review boundary, no evidence either way on review/urgent.**

Across three analyzable repos (184 total dependencies), the `ok`/`review` split tracked
something real: every `review`-band package in axios and json-server was either a major-version
jump on a dependency with real usage, or a heavily-imported package with any non-patch jump —
both are legitimate "worth a human's attention" signals, and a person skimming the same
`npm outdated` output would likely circle the same names. That is the band doing its one job.

**`urgent` never fired once, on any of the 184 dependencies checked.** Nothing in this sample
was deprecated or flagged unmaintained by the registry. That is not evidence the `urgent` band
is broken — it may simply be that five actively maintained, popular repos are a bad sample for
finding abandoned dependencies — but it does mean this calibration run cannot say anything about
whether the `urgent` threshold is well-placed. A future calibration cycle aimed specifically at
older or smaller/less-maintained repos (the opposite selection bias from this one) would be
needed to test that half of the banding at all.

The webpack result (`tapable`, 38 files, patch jump, outranked by a 2-file major jump) is the
one clear case where the *ordering* within `review` diverged from what a human would probably
prioritize first. That is a real finding about the semver-jump weight versus the usage-breadth
weight, worth citing when a future cycle considers retuning — but retuning is explicitly not
this cycle's job.

## Boundary arithmetic: is `urgent` unreachable, or just unsampled? (day 10)

Day 9 found `urgent` never fired across 184 dependencies and left the question open: is the
50-point threshold set too high, or did the sample simply contain no abandoned dependencies?
This section answers with arithmetic, before touching a new sample — free, and it says which
suspect (threshold vs. sample) is more plausible before 1c goes looking for evidence either way.

**Reachable routes to `urgent` (score ≥ 50), minimum input per route** (weights from
`docs/scoring.md`; a package with zero usage files is flagged `unused` and never scored, so
every route below needs at least one file, which unavoidably contributes its own `+3`):

- **Deprecated route:** `deprecated (30) + files capped at 20` = exactly **50**. The cap needs
  7 files (`7 × 3 = 21`, capped to 20); no symbols, namespace, or version jump required at all
  — a deprecated package touched in 7+ files is `urgent` on the deprecation weight and file
  breadth alone.
- **Major-jump-plus-usage-breadth route:** `major (40) + 1 file (3) + namespace import (10)` =
  **53**. A single namespace import (`import * as x`, whole-module usage) is enough breadth to
  push a bare major bump over the line.
- **Just under the line, for contrast:** `major (40) + 1 file (3) + 3 symbols (6)` = **49** —
  stays `review`. The same major jump with named-symbol usage instead of a namespace import is
  one component short of `urgent`; a fourth symbol (`+2`) or a second file (`+3`) would cross it.

All three are now asserted fixtures in `test/scoring.test.ts` (day 10, item 1a), not just
arithmetic on paper.

**Reading the day-9 top-scorer distribution (48, 46, 45, 40, 37, 35, 31, 27, 20) against these
routes:** every one of those top scorers is a major-or-minor jump with real usage but **no
deprecation flag and no namespace import** — the two components that make the routes above
cheap to reach. The distribution clusters at 40–48 because a major jump (40) plus a small amount
of file/symbol breadth (capped well below the file/symbol ceilings) lands in exactly that range;
none of those five repos' top dependencies happened to also be flagged deprecated or imported via
`import * as x`. That reads as **a sample with no abandoned dependencies in it, not a threshold
set one usage step too high** — reaching `urgent` from a plain major jump needs real additional
breadth (a 7th file, a namespace import, several more symbols), and the day-9 sample's top
dependencies simply didn't carry that combination. 1c decides this by aiming a differently-biased
sample at the same tool rather than re-deriving these numbers.

## Regenerating this data

```
git clone --depth 1 https://github.com/lodash/lodash.git /tmp/calib/lodash
git clone --depth 1 https://github.com/axios/axios.git /tmp/calib/axios
git clone --depth 1 https://github.com/typicode/json-server.git /tmp/calib/json-server
git clone --depth 1 https://github.com/webpack/webpack.git /tmp/calib/webpack
git clone --depth 1 https://github.com/facebook/react.git /tmp/calib/react
node dist/cli.js /tmp/calib/<name>          # table
node dist/cli.js /tmp/calib/<name> --json   # machine-readable
```
