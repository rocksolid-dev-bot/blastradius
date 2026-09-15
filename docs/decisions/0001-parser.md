# ADR 0001: parser for source-walk / usage analysis

**Compared:** TypeScript compiler API (`typescript`, already a dep) vs `oxc-parser` (MIT,
0.150.0). Acorn not tried — first two settled it.

**Numbers:** never got a wall-clock comparison. `oxc-parser@0.150.0` requires Node
`^20.19.0 || >=22.12.0`; the build container ships Node 18.19.1 (`clawdev-base`). Fresh
`npm install oxc-parser` succeeds (npm only warns `EBADENGINE`), but that's a landmine for
anyone running this tool on an older Node — not acceptable for a CLI meant to run in arbitrary
repos' CI.

**TSX / type-only imports:** not benchmarked on oxc for the same reason. TS compiler API already
confirmed capable from day-1 usage (strict TSX support, `ts.isImportDeclaration` +
`importClause.isTypeOnly` / per-specifier `isTypeOnly` covers both `import type {}` and
`import { type X }`).

**Picked:** TypeScript compiler API.

**Why:** it's already an installed dependency (zero new install), has no engine floor above our
Node 18 container, and gives first-class TSX and type-only-import fidelity via the public
`ts.isImportDeclaration` / `ts.isTypeOnly` surface. `oxc-parser` is faster on paper but disqualified
by engine mismatch before speed became relevant — not worth reopening unless the container's Node
version changes.
