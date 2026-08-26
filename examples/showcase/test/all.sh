#!/usr/bin/env bash
# Showcase runner: all three targets from ONE shared vocabulary source.
set -uo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
fail=0

echo "=== showcase browser e2e (web + native parity) ==="
node "$here/test/e2e.mjs" || fail=1

echo "=== showcase tui parity (headless opentui) ==="
(cd "$here" && bun run test/tui-headless.tsx) || fail=1

if [ "$fail" -ne 0 ]; then
	echo "SUMMARY: showcase FAIL"
	exit 1
fi
echo "SUMMARY: showcase ALL PASS (web + native + tui)"
