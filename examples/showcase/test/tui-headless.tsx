/**
 * TUI parity leg — the SAME shared vocabulary (src/shared-styles.ts) on
 * @opentui/core's headless test renderer. Asserts the shared $blue-500
 * header background and the `_dark` resolver flip ($gray-100 -> $gray-900)
 * match the web/native assertions in e2e.mjs.
 */
import { createTestRenderer } from "@opentui/core/testing";
import { rgbToHex } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "../src/tui/app.tsx";

let failures = 0;
const check = (name, ok, detail = "") => {
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures++;
};

function collect(cap) {
	const hexes = new Set();
	for (const line of cap.lines) {
		for (const span of line.spans) {
			try {
				hexes.add(rgbToHex(span.bg));
			} catch {
				// default-color spans have no RGB representation
			}
		}
	}
	return hexes;
}

async function boot(dark) {
	const t = await createTestRenderer({ width: 60, height: 18 });
	createRoot(t.renderer).render(App({ dark }));
	await new Promise((r) => setTimeout(r, 100));
	await t.renderOnce();
	await t.flush();
	return t;
}

{
	const t = await boot(false);
	const hexes = collect(t.capture);
	check("shared $blue-500 renders (#3182ce)", hexes.has("#3182ce"), [...hexes].join(","));
	check("shared $gray-100 status renders", hexes.has("#f3f4f6"));
	t.destroy();
}
{
	const t = await boot(true);
	const hexes = collect(t.capture);
	check("_dark flips shared status to $gray-900 (#1f2937)", hexes.has("#1f2937"));
	t.destroy();
}

if (failures > 0) {
	console.log(`SUMMARY: FAIL — ${failures}`);
	process.exit(1);
}
console.log("SUMMARY: tui parity green");
