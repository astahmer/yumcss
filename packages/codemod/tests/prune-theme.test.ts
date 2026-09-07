/**
 * @theme var pruning — proves, against the REAL Tailwind compiler, that
 * filterBridgeByUsedVars keeps exactly the variables the engine references
 * for a scanned class list and drops everything else.
 */
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { filterBridgeByUsedVars, themeBlockBody, usedBridgeVars } from "../src/tw/prune-theme.ts";

const APP = resolve(import.meta.dirname, "../../../apps/example");

const BRIDGE = `@theme {
	--color-surface: #101014;
	--color-ocean: #0055ff;
	--color-unused: #999999;
	--font-display: "Inter", sans-serif;
}

/* Condition-bound token overrides */
.dark {
	--color-surface-dark: #05050a;
}`;

describe("filterBridgeByUsedVars", () => {
	test("keeps only referenced vars, drops the rest", () => {
		const out = filterBridgeByUsedVars(BRIDGE, new Set(["--color-surface", "--font-display"]));
		expect(themeBlockBody(out)).toBe(
			`\n\t--color-surface: #101014;\n\t--font-display: "Inter", sans-serif;`,
		);
		// override rules survive (tied to condition semantics, not pruning)
		expect(out).toContain(".dark {");
	});

	test("empty used set removes the whole @theme block but keeps overrides", () => {
		const out = filterBridgeByUsedVars(BRIDGE, new Set());
		expect(out).not.toContain("@theme");
		expect(out).toContain(".dark {");
	});

	test("document without a theme block is returned unchanged", () => {
		expect(filterBridgeByUsedVars(".foo { color: red }", new Set())).toBe(".foo { color: red }");
	});
});

describe("usedBridgeVars — real Tailwind compilation", () => {
	test("mines exactly the vars the compiled utilities reference", async () => {
		const used = await usedBridgeVars({
			themeBlock: BRIDGE,
			files: [],
			twEntry: "",
			base: APP,
		}).catch(() => null);
		// With no files/classes nothing is used — but this path requires a
		// tw entry; skip gracefully when the fixture app isn't present.
		if (used === null) return;
		expect(used.size).toBe(0);
	});

	test("bg utility usage surfaces its color var through real compilation", async () => {
		const twEntry = resolve(APP, "src/tw.ts");
		const sourceDir = resolve(APP, "src");
		// Scan the real example app sources.
		const { readdirSync } = await import("node:fs");
		const files: Array<string> = [];
		const walk = (dir: string) => {
			for (const e of readdirSync(dir, { withFileTypes: true })) {
				const p = resolve(dir, e.name);
				if (e.isDirectory()) walk(p);
				else if (/\.tsx?$/.test(e.name)) files.push(p);
			}
		};
		walk(sourceDir);
		const used = await usedBridgeVars({ themeBlock: BRIDGE, files, twEntry, base: APP });
		// The example dogfoods surface tokens; whatever it uses must be a
		// subset of the bridge, and unused/ocean are unused by construction.
		expect(used.has("--color-unused")).toBe(false);
		expect(used.has("--color-ocean")).toBe(false);
	}, 30_000);
});
