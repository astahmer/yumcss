import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { collectTwClasses, createTwClassCollector } from "../src/tw/collect.ts";

const app = resolve(import.meta.dirname, "../../../apps/example");

describe("tw scanner", () => {
	test("collects exactly the classes a tw() call emits", async () => {
		const classes = await collectTwClasses(
			[resolve(app, "src/examples/typed-tw-app.tsx")],
			resolve(app, "src/tw.ts"),
		);

		expect(classes).toContain("sm:flex");
		expect(classes).toContain("dark:text-gray-300");
		expect(classes).toContain("flex flex-col".split(" ")[1]);
		expect(classes).toContain("focus-visible:outline-2");
		expect(classes).toContain("ring-gray-900/5");
	});

	test("bounded dynamic tw() calls register every runtime candidate", async () => {
		const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const root = mkdtempSync(join(tmpdir(), "pandwind-tw-collect-"));
		try {
			const dynamicSource = join(root, "dynamic.tsx");
			const body = [
				'import { tw } from "../../../apps/example/src/tw";',
				'export const a = tw({ bg: active ? "sky-600" : "gray-900" });',
				'export const b = tw({ p: SPACING === "4" ? "4" : "8" });',
			].join("\n");
			writeFileSync(dynamicSource, body);
			const classes = await collectTwClasses([dynamicSource], resolve(app, "src/tw.ts"));
			expect(classes).toContain("bg-sky-600");
			expect(classes).toContain("bg-gray-900");
			expect(classes).toContain("p-4");
			expect(classes).toContain("p-8");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("finite dynamic cx() calls register verified candidates", async () => {
		const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const root = mkdtempSync(join(tmpdir(), "pandwind-tw-collect-cx-"));
		try {
			const cxSource = join(root, "cx-dynamic.tsx");
			const body = [
				'import { cx } from "../../../apps/example/src/tw";',
				"const tone = pickTone();",
				'export const a = cx(tone === "light" ? "bg-sky-600" : "bg-gray-900");',
				'export const b = cx(flags && { underline: true, "font-bold": true });',
				"export const c = cx(dynamicClassName());",
			].join("\n");
			writeFileSync(cxSource, body);
			const classes = await collectTwClasses([cxSource], resolve(app, "src/tw.ts"));
			expect(classes).toContain("bg-sky-600");
			expect(classes).toContain("bg-gray-900");
			expect(classes).toContain("underline");
			expect(classes).toContain("font-bold");
			// Unbounded calls contribute nothing.
			expect(classes).not.toContain("flex");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("foreign cx() helpers are not collected", async () => {
		const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const root = mkdtempSync(join(tmpdir(), "pandwind-tw-collect-foreign-"));
		try {
			const foreignSource = join(root, "foreign.tsx");
			const body = [
				'import { cx } from "clsx";',
				'export const a = cx(cond ? "bg-sky-600" : "bg-gray-900");',
			].join("\n");
			writeFileSync(foreignSource, body);
			const classes = await collectTwClasses([foreignSource], resolve(app, "src/tw.ts"));
			expect(classes).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	describe("verification gates (plan 058 T6)", () => {
		test("unresolvable finite dynamic candidates are excluded and reported", async () => {
			const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
			const { tmpdir } = await import("node:os");
			const { join } = await import("node:path");
			const root = mkdtempSync(join(tmpdir(), "pandwind-tw-collect-gates-"));
			try {
				const source = join(root, "gates.tsx");
				const body = [
					'import { tw, cx } from "../../../apps/example/src/tw";',
					"const size = pickSize();",
					"const color = pickColor();",
					'export const a = tw({ p: size === "1" ? "4" : "bananas" });',
					'export const b = cx(color === "x" ? "bg-sky-600" : "bg-nope-999");',
				].join("\n");
				writeFileSync(source, body);
				const { classes, unresolvedTokens } = await createTwClassCollector().collect(
					[source],
					resolve(app, "src/tw.ts"),
				);
				// Verified design-system classes still register.
				expect(classes).toContain("p-4");
				expect(classes).toContain("bg-sky-600");
				// Classes with no exact design-system CSS never enter the safelist…
				expect(classes).not.toContain("p-bananas");
				expect(classes).not.toContain("bg-nope-999");
				// …they are reported with their call-site line instead.
				const tokens = unresolvedTokens.map((entry) => entry.token);
				expect(tokens).toHaveLength(2);
				expect(tokens).toContain("p-bananas");
				expect(tokens).toContain("bg-nope-999");
				for (const entry of unresolvedTokens) {
					expect(entry.reason).toBe("no-css");
					expect(entry.line).toBeGreaterThan(0);
				}
				const pEntry = unresolvedTokens.find((entry) => entry.token === "p-bananas");
				const bgEntry = unresolvedTokens.find((entry) => entry.token === "bg-nope-999");
				expect(pEntry?.line).toBeLessThan(bgEntry?.line ?? 0);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		});
	});
});
