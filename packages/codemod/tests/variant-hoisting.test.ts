import { describe, expect, test } from "vitest";
import { loadMetaFromSources } from "../src/meta.ts";
import { variantKeyForTarget, variantPathForKey } from "../src/swap/variant-hoisting.ts";
import { runSwap } from "../src/swap/index.ts";
import { examplePreset } from "@pandwind/example-preset";
import { resolve } from "node:path";

const appDir = resolve(import.meta.dirname, "../../../examples/example/src");
const meta = loadMetaFromSources({
	typesDtsPath: resolve(appDir, "types.d.ts"),
	twTsPath: resolve(appDir, "tw.ts"),
	bridgePath: resolve(appDir, "bridge.ts"),
	tokens: examplePreset.tokens,
});

describe("bidirectional variant hoisting", () => {
	test("normalizes dialect prefixes and nested target spellings", () => {
		expect(variantPathForKey(meta, "_hover")).toEqual(["hover"]);
		expect(variantPathForKey(meta, "hover:dark")).toEqual(["hover", "dark"]);
		expect(variantKeyForTarget("hover", "tw")).toBe("hover");
		expect(variantKeyForTarget("hover", "design")).toBe("_hover");
	});

	test("accepts design condition spelling when lowering a tw object", () => {
		const result = runSwap(
			'import { css } from "./design.ts";\nconst card = tw({ _hover: { bgColor: "blue-500" } });',
			meta,
			{ from: "tw", to: "css.class", file: "test.tsx", metaDir: "examples/example/src" },
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain("_hover: {");
	});

	test("hoists design nesting back into native tw variants", () => {
		const result = runSwap(
			'import { css } from "./design.ts";\nconst card = css.class({ _hover: { backgroundColor: "#3182ce" } });',
			meta,
			{ from: "css", to: "tw", file: "test.tsx", metaDir: "examples/example/src" },
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain('"hover": {');
		expect(result.code).not.toContain("_hover");
	});
});
