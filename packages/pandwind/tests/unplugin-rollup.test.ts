/**
 * Cross-bundler smoke tests for the unplugin adapters.
 *
 * - rollup: a real `rollup.build()` over a fixture entry proves the inline
 *   pass folds `tw()` calls outside vite (the fs-fallback resolver finds the
 *   generated tw module; the bare `pandwind/tw` runtime import is aliased to
 *   the package source since there is no node-resolve in this minimal setup).
 * - css extractor: `resolveId`/`load` served through the unplugin-wrapped
 *   vite slice generate the stylesheet from a temp-dir scan.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { rollup } from "rollup";
import { describe, expect, test } from "vitest";
import { examplePreset } from "../src/preset/example-preset.ts";
import { pandwindRollup, pandwindUnpluginCss } from "../src/unplugin.ts";

const pkgRoot = resolve(import.meta.dirname, "..");
const exampleTwModule = resolve(pkgRoot, "../../apps/example/src/tw.ts");

/**
 * The generated tw module is TypeScript (rollup parses JS only), so derive a
 * plain-JS twin for the fixture: strip imports and the type parameter. What
 * remains still carries the full createTw metadata the inline pass extracts.
 */
function writeJsTwModule(dir: string): string {
	let src = readFileSync(exampleTwModule, "utf8");
	src = src.replace(/^import [^\n]*$/gm, "");
	src = src.replace(/createTw<[^>(]*>\(/, "createTw(");
	const target = join(dir, "tw.js");
	writeFileSync(target, src);
	return target;
}

describe("pandwindRollup", () => {
	test("folds tw() calls in a real rollup build", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pandwind-unplugin-rollup-"));
		try {
			const twModule = writeJsTwModule(dir);
			const entry = join(dir, "entry.js");
			writeFileSync(
				entry,
				[
					`import { tw } from ${JSON.stringify(twModule)};`,
					`export const cls = tw({ p: "6", text: "sm" });`,
				].join("\n"),
			);

			const bundle = await rollup({ input: entry, plugins: [pandwindRollup()] });
			const { output } = await bundle.generate({ format: "es" });
			const code = output.map((chunkOrAsset) => chunkOrAsset.code).join("\n");

			expect(code).toContain("p-6 text-sm");
			expect(code).not.toMatch(/\btw\s*\(/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("pandwindUnpluginCss", () => {
	test("resolveId maps the virtual id through the unplugin vite slice", () => {
		const plugin = pandwindUnpluginCss.vite({
			preset: examplePreset,
			root: tmpdir(),
		});
		const resolved = (
			plugin as unknown as {
				resolveId: (source: string) => string | null;
			}
		).resolveId("pandwind:css");
		expect(resolved).toContain("pandwind:css.css");
	});

	test("load serves the generated stylesheet from a scanned directory", async () => {
		const root = mkdtempSync(join(tmpdir(), "pandwind-unplugin-css-"));
		try {
			writeFileSync(
				join(root, "app.ts"),
				['import { css } from "./css";', 'export const a = css({ color: "$blue-500" });'].join(
					"\n",
				),
			);
			mkdirSync(join(root, "keep"), { recursive: true });

			const plugin = pandwindUnpluginCss.vite({
				preset: examplePreset,
				root,
				cssSources: ["css"],
			}) as unknown as {
				resolveId: (source: string) => string | null;
				load: (id: string) => string | null;
			};

			const id = plugin.resolveId("pandwind:css");
			expect(id).not.toBeNull();
			const css = plugin.load(id!);
			expect(css).toContain("#3182ce");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
