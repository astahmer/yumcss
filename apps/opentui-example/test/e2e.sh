#!/usr/bin/env bash
# E2E for apps/opentui-example.
# Part A (hard gate): headless assertions against @opentui/core's test renderer.
# Part B (smoke): the production entry boots under a pseudo-TTY and exits 0.
set -uo pipefail
cd "$(dirname "$0")/.."
rc=0

echo "=== opentui e2e: headless span assertions ==="
if ! bun test/e2e.tsx; then rc=1; fi

echo "=== opentui e2e: PTY smoke of src/index.tsx ==="
cap="$(mktemp)"
# BSD macOS has no GNU timeout; the app exits itself (~400ms) and the
# perl alarm only guards against a hang.
perl -e 'alarm 20; exec @ARGV' script -q "$cap" bun run src/index.tsx >/dev/null 2>&1
code=$?
if [ $code -eq 0 ] && [ -s "$cap" ]; then
	echo "PASS pty boot exits 0 with captured output ($(wc -c <"$cap" | tr -d ' ') bytes)"
else
	echo "FAIL pty boot (exit=$code, bytes=$(wc -c <"$cap" | tr -d ' '))"
	rc=1
fi
rm -f "$cap"

exit $rc
