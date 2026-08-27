#!/usr/bin/env bash
# Release publish — run by CI on v* tags (or manually with a clean env).
# Requires: NPM_TOKEN in env (or already-authenticated npm), clean tree.
#
# Publish order matters: pandwind first (workspace dep of the others),
# then the tools. Changesets has already rewritten workspace:* ranges to
# real versions at `changeset version` time.
set -euo pipefail
cd "$(dirname "$0")/../.."

./node_modules/.bin/tsx scripts/release/check-publish-ready.mjs

ORDER=(pandwind lint-plugin codemod analyze)

echo "== verifying packs before publish =="
for pkg in "${ORDER[@]}"; do
	./node_modules/.bin/tsx scripts/release/smoke-pack.mjs "packages/$pkg"
done

echo "== publishing =="
for pkg in "${ORDER[@]}"; do
	pnpm --filter "./packages/$pkg" publish --access public --provenance --no-git-checks
done

echo "== published =="
for pkg in "${ORDER[@]}"; do
	name=$(node -p "require('./packages/$pkg/package.json').name")
	version=$(node -p "require('./packages/$pkg/package.json').version")
	echo "  $name@$version"
done
