import { describe, expect, test } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import { resolve } from "node:path";
import { loadMetaFromSources } from "../src/meta.ts";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();
const exampleSource = resolve(import.meta.dirname, "../../../apps/example/src");
const exampleMeta = loadMetaFromSources({
	typesDtsPath: resolve(exampleSource, "types.d.ts"),
	twTsPath: resolve(exampleSource, "tw.ts"),
	bridgePath: resolve(exampleSource, "bridge.ts"),
	tokens: examplePreset.tokens,
});

function migrate(source: string, meta?: typeof exampleMeta) {
	return runAdapterMigration(source, {
		from: CodemodAdapterId.Emotion,
		to: CodemodAdapterId.Pandwind,
		file: "Card.tsx",
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
		meta,
	});
}

describe("verified Pandwind token preservation", () => {
	test("emits an expert Pandwind token reference when metadata proves the match", () => {
		const result = migrate(
			'import { css } from "@emotion/css";\n' +
				'export const card = css({ color: "#3182ce", padding: "4px", borderRadius: "0.5rem" });',
			exampleMeta,
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('color: "$blue-500"');
		expect(result.code).not.toContain('color: "#3182ce"');
		expect(result.code).toContain('padding: "$4"');
		expect(result.code).toContain('borderRadius: "$lg"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ padding: "$4", borderRadius: "$lg", color: "$blue-500" });"
		`);
	});

	test("keeps a literal when no target preset is available to prove a token", () => {
		const result = migrate(
			'import { css } from "@emotion/css";\nexport const card = css({ color: "#3182ce" });',
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('color: "#3182ce"');
		expect(result.code).not.toContain('color: "$blue-500"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "#3182ce" });"
		`);
	});

	test("keeps an ambiguous token value literal instead of guessing a semantic name", () => {
		const result = migrate(
			'import { css } from "@emotion/css";\nexport const card = css({ color: "#60A3BC" });',
			exampleMeta,
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('color: "#60A3BC"');
		expect(result.code).not.toMatch(/color: "\$(?:green-500|success)"/u);
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "#60A3BC" });"
		`);
	});
});
