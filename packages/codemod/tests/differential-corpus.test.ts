import { describe, expect, test } from "vitest";
import { runAdapterMigration, runDifferentialSuite } from "../src/swap/index.ts";

const corpus = [
	{
		name: "emotion-to-fela",
		sourceAdapter: "emotion",
		targetAdapter: "fela",
		file: "Card.tsx",
		source: `const card = css({ color: "red", "&:hover": { color: "blue" } });`,
	},
	{
		name: "goober-to-emotion",
		sourceAdapter: "goober",
		targetAdapter: "emotion",
		file: "Card.tsx",
		source: `const card = css({ padding: 2, color: "red" });`,
	},
	{
		name: "aphrodite-round-trip",
		sourceAdapter: "aphrodite",
		targetAdapter: "aphrodite",
		file: "styles.ts",
		source: `const styles = StyleSheet.create({ button: { color: "red", padding: 2 } });`,
	},
] as const;

describe("real-world adapter differential corpus", () => {
	test("keeps representative ecosystem programs equivalent", () => {
		const results = runDifferentialSuite(corpus);
		expect(
			results.map(
				({ fixture, valid, differences, residuals, canonicalSource, canonicalTarget }) => ({
					fixture,
					valid,
					differences,
					residuals,
					canonicalSource,
					canonicalTarget,
				}),
			),
		).toMatchInlineSnapshot(`
			[
			  {
			    "canonicalSource": "&{color:red}&:hover{color:blue}",
			    "canonicalTarget": "&{color:red}&:hover{color:blue}",
			    "differences": [],
			    "fixture": "emotion-to-fela",
			    "residuals": [],
			    "valid": true,
			  },
			  {
			    "canonicalSource": "&{padding:2;color:red}",
			    "canonicalTarget": "&{padding:2;color:red}",
			    "differences": [],
			    "fixture": "goober-to-emotion",
			    "residuals": [],
			    "valid": true,
			  },
			  {
			    "canonicalSource": "&{padding:2px;color:red}",
			    "canonicalTarget": "&{padding:2px;color:red}",
			    "differences": [],
			    "fixture": "aphrodite-round-trip",
			    "residuals": [],
			    "valid": true,
			  },
			]
		`);
		expect(results.every((result) => result.valid)).toBe(true);
		expect(results.every((result) => result.residuals.length === 0)).toBe(true);

		const goober = runAdapterMigration(corpus[1].source, {
			from: "goober",
			to: "emotion",
			file: corpus[1].file,
		});
		expect(goober.converted).toBe(1);
		expect(goober.skipped).toBe(0);
		expect(goober.residuals).toEqual([]);
		expect(goober.code).toContain('padding: "2"');
		expect(goober.code).toMatchInlineSnapshot(`
			"import { css } from "@emotion/css";
			const card = css({ padding: "2", color: "red" });"
		`);
	});
});
