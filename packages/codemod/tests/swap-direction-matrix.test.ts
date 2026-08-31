import { describe, expect, test } from "vitest";
import { examplePreset } from "pandwind/preset";
import { resolve } from "node:path";
import { loadMetaFromSources } from "../src/meta.ts";
import { SWAP_REGISTRY, runSwap, SwapSourceId } from "../src/swap/index.ts";

const appDir = resolve(import.meta.dirname, "../../../apps/example/src");
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
		file: "SwapMatrix.tsx",
		metaDir: "apps/example/src",
		capabilityMode: "partial",
	});
}

describe("flat SwapIR source/target matrix", () => {
	test("exercises every legacy source-to-target route", () => {
		const outcomes: string[] = [];
		for (const fixture of sourceFixtures) {
			for (const target of targets) {
				const result = migrate(fixture.source, fixture.id, target);
				const evidence = result.converted > 0 || result.skippedByMarker > 0;
				expect(
					evidence,
					`${fixture.id} -> ${target} produced neither conversion nor explicit skip evidence`,
				).toBe(true);
				if (result.skippedByMarker > 0) {
					expect(result.code).toContain("pandwind:migrate-skip");
					expect(result.code).toContain(fixture.source.slice(-20));
					expect(result.unmappedTokens.length + result.skippedByMarker).toBeGreaterThan(0);
				}
				outcomes.push(`${fixture.id}->${target}`);
			}
		}
		expect(outcomes).toHaveLength(sourceFixtures.length * targets.length);
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
