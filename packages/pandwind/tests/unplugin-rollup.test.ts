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
import { join } from "node:path";
import { rollup } from "rollup";
import { describe, expect, test } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import { pandwindRollup, pandwindUnpluginCss } from "../src/unplugin.ts";
import { writeJsTwModule } from "./helpers/generated-tw.ts";
import { RollupOutputKind } from "./helpers/rollup-output-kind.ts";

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

			const bundle = await rollup({ input: entry, plugins: [pandwindRollup({})] });
			const { output } = await bundle.generate({ format: "es" });
			const code = output
				.filter(
					(
						chunkOrAsset,
					): chunkOrAsset is Extract<
						typeof chunkOrAsset,
						{ type: typeof RollupOutputKind.Chunk }
					> => chunkOrAsset.type === RollupOutputKind.Chunk,
				)
				.map((chunk) => chunk.code)
				.join("\n");

			expect(code).toContain("p-6 text-sm");
			expect(code).not.toMatch(/\btw\s*\(/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("erases cross-file static style calls from the final bundle", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pandwind-unplugin-rollup-static-"));
		try {
			const twModule = writeJsTwModule(dir);
			const constants = join(dir, "tokens.js");
			const entry = join(dir, "entry.js");
			writeFileSync(constants, 'export const P = "6";');
			writeFileSync(
				entry,
				[
					`import { tw } from ${JSON.stringify(twModule)};`,
					'import { P } from "./tokens.js";',
					"export const cls = tw({ p: P });",
				].join("\n"),
			);

			const bundle = await rollup({ input: entry, plugins: [pandwindRollup({})] });
			const { output } = await bundle.generate({ format: "es" });
			const code = output
				.filter(
					(
						chunkOrAsset,
					): chunkOrAsset is Extract<
						typeof chunkOrAsset,
						{ type: typeof RollupOutputKind.Chunk }
					> => chunkOrAsset.type === RollupOutputKind.Chunk,
				)
				.map((chunk) => chunk.code)
				.join("\n");

			expect(code).toMatchInlineSnapshot(`
				"const cls = "p-6";

				export { cls };
				"
			`);
			expect(code).toContain('"p-6"');
			expect(code).not.toMatch(/\b(?:createTw|tw|P)\b/u);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("watchChange invalidates inline cross-module constants", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pandwind-unplugin-rollup-inline-watch-"));
		try {
			const twModule = writeJsTwModule(dir);
			const constants = join(dir, "constants.js");
			const entry = join(dir, "entry.js");
			writeFileSync(constants, 'export const P = "6";');
			const source = () =>
				[
					`import { tw } from ${JSON.stringify(twModule)};`,
					'import { P } from "./constants.js";',
					"export const cls = tw({ p: P });",
				].join("\n");
			writeFileSync(entry, source());

			const plugin = pandwindRollup({}) as unknown as {
				transform: (code: string, id: string) => Promise<{ code: string } | null>;
				watchChange: (id: string) => void;
			};
			const before = await plugin.transform(readFileSync(entry, "utf8"), entry);
			expect(before?.code).toContain('"p-6"');

			writeFileSync(constants, 'export const P = "8";');
			plugin.watchChange(constants);
			writeFileSync(entry, source());
			const after = await plugin.transform(readFileSync(entry, "utf8"), entry);
			expect(after?.code).toContain('"p-8"');
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

	test("watchChange invalidates the Rollup stylesheet scan", async () => {
		const root = mkdtempSync(join(tmpdir(), "pandwind-unplugin-rollup-watch-"));
		try {
			writeFileSync(
				join(root, "app.ts"),
				[
					'import { css } from "./css";',
					'export const a = css({ $frame: { fill: "$blue-500" } });',
				].join("\n"),
			);
			const plugin = pandwindUnpluginCss.rollup({
				preset: examplePreset,
				root,
				cssSources: ["css"],
			}) as unknown as {
				resolveId: (source: string) => string | null;
				load: (id: string) => string | null;
				watchChange: (id: string) => void;
			};
			const id = plugin.resolveId("pandwind:css");
			expect(id).not.toBeNull();
			expect(plugin.load(id!)).toContain("#3182ce");

			const extra = join(root, "extra.ts");
			writeFileSync(
				extra,
				['import { css } from "./css";', 'css({ $frame: { fill: "$green-500" } });'].join("\n"),
			);
			plugin.watchChange(extra);
			expect(plugin.load(id!)?.toLowerCase()).toContain("#60a3bc");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
