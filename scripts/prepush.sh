#!/usr/bin/env bash
# Local pre-push gate: proves the build is green without depending on GitHub Actions,
# which this repo's fine-grained PAT cannot push to (.github/workflows/ci.yml is
# rejected server-side without the "workflow" scope — see STATUS.md day 8/9).
#
# Mirrors ci.yml's own step order (build before test: dist/ is gitignored and
# test/bin.test.ts throws without it), then proves the exact `bin` symlink shape
# npm creates by installing into a throwaway prefix and invoking the shim —
# npm i -g --prefix, not `npm link`, so this needs no root and leaves no global state.
set -euo pipefail

echo "== npm ci =="
npm ci

echo "== npx tsc --noEmit =="
npx tsc --noEmit

echo "== npm run build =="
npm run build

echo "== npm test =="
npm test

echo "== install into throwaway prefix and invoke the bin shim =="
rm -rf /tmp/br-prefix
npm i -g --prefix /tmp/br-prefix .
echo "\$ /tmp/br-prefix/bin/blastradius --help"
/tmp/br-prefix/bin/blastradius --help

echo "== prepush.sh: all steps passed =="
