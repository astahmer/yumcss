/**
 * E2E for the OpenTUI consumer sandbox — runs the REAL app component on
 * @opentui/core's headless test renderer (createTestRenderer) and asserts:
 *
 * 1. the captured character frame contains every expected label, indented
 *    by the per-side cell expansion of `pad: [4, 8]`;
 * 2. border-shorthand box renders actual border glyphs;
 * 3. captured span BACKGROUNDS carry our exact token colors (via
 *    rgbToHex): outer $blue-500 = #3182ce, status $gray-100 = #f3f4f6;
 * 4. the `_dark` resolver flips the status background to $gray-800 =
 *    #1f2937 on a second boot (same call site, different resolver state);
 * 5. no OpenTUI error markers ("Invalid", "error:", "magenta fallback").
 */
import { createTestRenderer } from "@opentui/core/testing";
import { rgbToHex } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "../src/app.tsx";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
	if (!ok) failures++;
};

function collect(cap: { lines: Array<{ spans: Array<{ bg: unknown }> }> }): Set<string> {
	const hexes = new Set<string>();
	for (const line of cap.lines) {
		for (const span of line.spans) {
			try {
				hexes.add(rgbToHex(span.bg as never));
			} catch {
				// default-color spans have no RGB representation
			}
		}
	}
	return hexes;
}

async function boot(dark: boolean) {
	const t = await createTestRenderer({ width: 60, height: 18 });
	createRoot(t.renderer).render(<App dark={dark} />);
	await new Promise((r) => setTimeout(r, 100));
	await t.renderOnce();
	await t.flush();
	return t;
}

// --- pass 1: light boot -------------------------------------------------
{
	const t = await boot(false);
	const frame = t.captureCharFrame();
	const hexes = collect(t.captureSpans());

	check(
		"labels render",
		frame.includes("pandwind / opentui") &&
			frame.includes("status: light theme active") &&
			frame.includes("bordered section") &&
			frame.includes("unconditional bottom row"),
	);
	check("pad [4,8] expands to 2-cell side inset", /^ {2}pandwind \/ opentui/m.test(frame));
	check("border shorthand draws border glyphs", frame.includes("┌") && frame.includes("│"));
	check(
		"token backgrounds exact ($blue-500, $gray-100)",
		hexes.has("#3182ce") && hexes.has("#f3f4f6"),
		`bg set: ${[...hexes].join(", ")}`,
	);
	check("no error/fallback markers", !frame.includes("�") && !/Invalid|error:/i.test(frame));
	t.renderer.destroy?.();
}

// --- pass 2: dark boot --------------------------------------------------
{
	const t = await boot(true);
	const frame = t.captureCharFrame();
	const hexes = collect(t.captureSpans());

	check("dark boot flips status copy", frame.includes("status: dark theme active"));
	check(
		"_dark resolution swaps $gray-100 -> $gray-800",
		hexes.has("#1f2937") && !hexes.has("#f3f4f6"),
		`bg set: ${[...hexes].join(", ")}`,
	);
	t.renderer.destroy?.();
}

console.log(
	failures === 0
		? "\nSUMMARY: all opentui e2e checks passed"
		: `\nSUMMARY: ${failures} failing check(s)`,
);
process.exit(failures === 0 ? 0 : 1);
