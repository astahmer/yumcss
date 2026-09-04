import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { collectTwClasses } from "../src/tw/collect.ts";

const app = resolve(import.meta.dirname, "../../../apps/example");

describe("tw scanner", () => {
	test("collects exactly the classes a tw() call emits", async () => {
		const classes = await collectTwClasses(
			[resolve(app, "src/css-in-js-app.tsx")],
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
				'const tone = pickTone();',
				"export const a = cx(tone === \"light\" ? \"bg-sky-600\" : \"bg-gray-900\");",
				'export const b = cx(flags && { underline: true, "font-bold": true });',
				'export const c = cx(dynamicClassName());',
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
});
