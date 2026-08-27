import { describe, expect, test } from "vitest";
import { runDifferentialSuite } from "../src/swap/index.ts";

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
		expect(results.every((result) => result.valid)).toBe(true);
		expect(results.every((result) => result.residuals.length === 0)).toBe(true);
	});
});
