import { describe, expect, test } from "vitest";
import { loadMetaFromSources } from "../src/meta.ts";
import { runSwap, SWAP_TARGETS } from "../src/swap/index.ts";
import { examplePreset } from "@pandwind/example-preset";

const appDir = new URL("../../../apps/example/src/", import.meta.url).pathname;
const meta = loadMetaFromSources({
	typesDtsPath: `${appDir}/types.d.ts`,
	twTsPath: `${appDir}/tw.ts`,
	bridgePath: `${appDir}/bridge.ts`,
	tokens: examplePreset.tokens,
});

const run = (source: string, from: "tw" | "css" | "design", to: string) =>
	runSwap(source, meta, {
		from,
		to: to as never,
		file: "api-corpus.tsx",
		metaDir: "apps/example/src",
	});

describe("Pandwind public API migration corpus", () => {
	test("exposes every documented target adapter", () => {
		for (const target of ["css.class", "design", "dss", "tw", "tailwind", "panda", "stylex"])
			expect(SWAP_TARGETS).toContain(target);
	});

	test.each([
		["css({ ... })", "css", "tw", 'tw({ bgColor: "blue-500" })'],
		["tw({ ... })", "tw", "css.class", "css.class({"],
	] as const)("migrates %s through the semantic pivot", (_name, from, to, expected) => {
		const source =
			from === "tw"
				? 'import { tw } from "./tw";\nimport { css } from "./design";\nconst card = tw({ bgColor: "blue-500" });'
				: String(from) === "design"
					? 'import { css } from "./design";\nconst card = css.class({ $frame: { fill: "$blue-500" } });'
					: 'import { css } from "./design";\nconst card = css({ backgroundColor: "#3182ce" });';
		const result = run(source, from, to);
		expect(result.code).toContain(expected);
		expect(result.skippedByMarker).toBe(0);
	});

	test("dss remains a separate local target contract", () => {
		const result = run(
			'import { css, dss } from "./design";\nconst card = css.class({ $frame: { fill: "$blue-500" } });',
			"design",
			"dss",
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain('dss({ $frame: { fill: "$blue-500" } })');
	});

	test.each([
		[
			"css.class",
			"css.class(",
			'import { css } from "./design";\nconst card = css({ backgroundColor: "#3182ce" });',
		],
		[
			"design",
			"css.class(",
			'import { css } from "./design";\nconst card = css({ backgroundColor: "#3182ce" });',
		],
		[
			"dss",
			"dss(",
			'import { css, dss } from "./design";\nconst card = css({ backgroundColor: "#3182ce" });',
		],
		[
			"tw",
			"tw(",
			'import { css } from "./design";\nconst card = css({ backgroundColor: "#3182ce" });',
		],
	] as const)(
		"routes a css declaration through the %s Pandwind API",
		(target, expected, source) => {
			const result = run(source, "css", target);
			expect(result.converted).toBe(1);
			expect(result.skippedByMarker).toBe(0);
			expect(result.code).toContain(expected);
		},
	);
});
