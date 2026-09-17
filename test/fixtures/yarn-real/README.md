Generated, not hand-shaped. `yarn.lock` here was produced by a real
`yarn install` (yarn classic 1.22.22, installed via `npm i -g --prefix
/tmp/pm yarn@1.22.22` — never global, never on the host) against the same
three real registry packages as `test/fixtures/pnpm-real/`: `@types/node`
(scoped), `react-dom` (peer deps on `react`), `left-pad` (plain). Header:
`# yarn lockfile v1`. Regenerate with:

```
cd /tmp/real-yarn && yarn install
```
