import { describe, expect, test } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import { resolve } from "node:path";
import { loadMetaFromSources } from "../src/meta.ts";
import { SWAP_REGISTRY, runSwap, SwapSourceId } from "../src/swap/index.ts";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";

const appDir = resolve(import.meta.dirname, "../../../examples/example/src");
const meta = loadMetaFromSources({
	typesDtsPath: resolve(appDir, "types.d.ts"),
	twTsPath: resolve(appDir, "tw.ts"),
	bridgePath: resolve(appDir, "bridge.ts"),
	tokens: examplePreset.tokens,
});

const sourceFixtures = [
	{
		id: SwapSourceId.Tw,
		source:
			'import { tw } from "./tw";\n' +
			'import { css, dss } from "./design";\n' +
			'const card = tw({ bgColor: "blue-500", textSize: "lg" });',
	},
	{
		id: SwapSourceId.Css,
		source:
			'import { css, dss } from "./design";\n' +
			'const card = css.class({ backgroundColor: "#3182ce", fontSize: "1.125rem" });',
	},
	{
		id: SwapSourceId.Design,
		source:
			'import { css, dss } from "./design";\n' +
			'const card = css.class({ $frame: { fill: "$blue-500" }, $text: { size: "lg" } });',
	},
] as const;

const targets = SWAP_REGISTRY.targets.map((adapter) => adapter.id);

function migrate(source: string, from: SwapSourceId, to: string) {
	return runSwap(source, meta, {
		from,
		to: to as never,
		file: "examples/example/src/SwapMatrix.tsx",
		metaDir: "examples/example/src",
		capabilityMode: "partial",
	});
}

describe("flat SwapIR source/target matrix", () => {
	test("exercises every flat source-to-target route", () => {
		const outcomes: Array<{ route: string; code: string }> = [];
		for (const fixture of sourceFixtures) {
			for (const target of targets) {
				const result = migrate(fixture.source, fixture.id, target);
				const route = `${fixture.id}->${target}`;
				const parsed = SOURCE_SCANNER_SERVICE.parse({
					file: "examples/example/src/SwapMatrix.tsx",
					source: result.code,
				});
				expect(parsed.errors, `${route} emitted invalid source`).toEqual([]);
				if (target === "panda") {
					expect(result.code, `${route} did not avoid the existing css binding`).toContain(
						'import { css as pandaCss } from "styled-system/css";',
					);
					expect(result.code).toContain("const card = pandaCss(");
				}
				const identityTarget = fixture.id === SwapSourceId.Css ? "css.class" : fixture.id;
				expect(result.skippedByMarker, `${route} unexpectedly left a residual`).toBe(0);
				expect(result.unmappedTokens, `${route} left utilities unmapped`).toEqual([]);
				if (target === identityTarget) {
					expect(result.code, `${route} changed source`).toBe(fixture.source);
				} else {
					expect(result.converted, `${route} did not convert`).toBeGreaterThan(0);
				}
				outcomes.push({ route, code: result.code });
			}
		}
		expect(outcomes).toHaveLength(sourceFixtures.length * targets.length);
		expect(outcomes).toMatchInlineSnapshot(`
			[
			  {
			    "code": "import { tw } from "./tw";
			import { css, dss } from "./design";
			const card = css.class({ backgroundColor: "#3182ce", fontSize: "1.125rem" });",
			    "route": "tw->css.class",
			  },
			  {
			    "code": "import { tw } from "./tw";
			import { css, dss } from "./design";
			const card = css.class({ $frame: { fill: "blue.500" }, $text: { size: "lg" } });",
			    "route": "tw->design",
			  },
			  {
			    "code": "import { tw } from "./tw";
			import { css, dss } from "./design";
			const card = dss({ $frame: { fill: "blue.500" }, $text: { size: "lg" } });",
			    "route": "tw->dss",
			  },
			  {
			    "code": "import { tw } from "./tw";
			import { css, dss } from "./design";
			const card = tw({ bgColor: "blue-500", textSize: "lg" });",
			    "route": "tw->tw",
			  },
			  {
			    "code": "import { tw } from "./tw";
			import { css, dss } from "./design";
			const card = "bg-blue-500 text-lg";",
			    "route": "tw->tailwind",
			  },
			  {
			    "code": "import { tw } from "./tw";
			import { css, dss } from "./design";
			import { css as pandaCss } from "styled-system/css";
			const card = pandaCss({ backgroundColor: "blue.500", fontSize: "lg" });",
			    "route": "tw->panda",
			  },
			  {
			    "code": "import { tw } from "./tw";
			import { css, dss } from "./design";
			import * as stylex from "@stylexjs/stylex";
			const swapStyles = stylex.create({
				s1: {
					backgroundColor: "#3182ce",
					fontSize: "1.125rem",
				},
			});
			const card = stylex.props(swapStyles.s1).className;",
			    "route": "tw->stylex",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			const card = css.class({ backgroundColor: "#3182ce", fontSize: "1.125rem" });",
			    "route": "css->css.class",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			const card = css.class({ $frame: { fill: "blue.500" }, $text: { size: "lg" } });",
			    "route": "css->design",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			const card = dss({ $frame: { fill: "blue.500" }, $text: { size: "lg" } });",
			    "route": "css->dss",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			import { tw } from "./tw";
			const card = tw({ bgColor: "blue-500", textSize: "lg" });",
			    "route": "css->tw",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			const card = "bg-blue-500 text-lg";",
			    "route": "css->tailwind",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			import { css as pandaCss } from "styled-system/css";
			const card = pandaCss({ backgroundColor: "blue.500", fontSize: "lg" });",
			    "route": "css->panda",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			import * as stylex from "@stylexjs/stylex";
			const swapStyles = stylex.create({
				s1: {
					backgroundColor: "#3182ce",
					fontSize: "1.125rem",
				},
			});
			const card = stylex.props(swapStyles.s1).className;",
			    "route": "css->stylex",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			const card = css.class({ backgroundColor: "#3182ce", fontSize: "1.125rem" });",
			    "route": "design->css.class",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			const card = css.class({ $frame: { fill: "$blue-500" }, $text: { size: "lg" } });",
			    "route": "design->design",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			const card = dss({ $frame: { fill: "$blue-500" }, $text: { size: "lg" } });",
			    "route": "design->dss",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			import { tw } from "./tw";
			const card = tw({ bgColor: "blue-500", textSize: "lg" });",
			    "route": "design->tw",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			const card = "bg-blue-500 text-lg";",
			    "route": "design->tailwind",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			import { css as pandaCss } from "styled-system/css";
			const card = pandaCss({ backgroundColor: "blue.500", fontSize: "lg" });",
			    "route": "design->panda",
			  },
			  {
			    "code": "import { css, dss } from "./design";
			import * as stylex from "@stylexjs/stylex";
			const swapStyles = stylex.create({
				s1: {
					backgroundColor: "#3182ce",
					fontSize: "1.125rem",
				},
			});
			const card = stylex.props(swapStyles.s1).className;",
			    "route": "design->stylex",
			  },
			]
		`);
	});

	test("keeps unmapped utilities source-preserving in every target direction", () => {
		const source =
			'import { tw } from "./tw";\nconst card = tw({ totallyUnknownUtility: "value" });';
		for (const target of targets) {
			const result = migrate(source, SwapSourceId.Tw, target);
			expect(result.skippedByMarker, `tw -> ${target}`).toBe(1);
			expect(result.code).toContain("pandwind:migrate-skip");
			expect(result.code).toContain("totallyUnknownUtility");
			expect(result.unmappedTokens.length + result.skippedByMarker).toBeGreaterThan(0);
		}
	});

	test("does not invent a conversion for malformed source calls", () => {
		for (const fixture of sourceFixtures) {
			const open = fixture.source.indexOf("{");
			const malformed = `${fixture.source.slice(0, open + 1)} /* unfinished`;
			for (const target of targets) {
				const result = migrate(malformed, fixture.id, target);
				expect(result.converted, `${fixture.id} -> ${target}`).toBe(0);
				expect(result.code).toContain("unfinished");
			}
		}
	});
});
