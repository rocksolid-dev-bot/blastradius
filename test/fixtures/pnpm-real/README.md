Generated, not hand-shaped. `pnpm-lock.yaml` here was produced by a real
`pnpm install` (pnpm 8.15.9, installed via `npm i -g --prefix /tmp/pm
pnpm@8` — never global, never on the host) against real npm registry
packages: `@types/node` (scoped), `react-dom` (declares
`peerDependencies: {"react":"^18.2.0"}`, satisfied here by also declaring
`react` directly), and `left-pad` (plain, deprecated). `lockfileVersion:
'6.0'`. Regenerate with:

```
cd /tmp/real-pnpm && pnpm install
```
