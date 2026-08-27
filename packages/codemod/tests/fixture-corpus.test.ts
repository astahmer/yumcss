import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { runAdapterMigration, runDifferentialFixture } from "../src/swap/index.ts";

const fixture = (name: string): { file: string; source: string } => {
	const file = resolve(import.meta.dirname, "fixtures/css-in-js", name);
	return { file, source: readFileSync(file, "utf8") };
};

describe("representative CSS-in-JS migration corpus", () => {
	test("migrates Linaria source through the same adapter contract", () => {
		const input = fixture("linaria-card.tsx");
		const result = runAdapterMigration(input.source, {
			from: "linaria",
			to: "emotion",
			file: input.file,
		});
		expect(result.converted).toBe(1);
		expect(result.code).toContain("@emotion/css");
	});

	test("keeps JSS and Style9 in the independently registered adapter set", () => {
		const jss = fixture("jss-card.tsx");
		const style9 = fixture("style9-card.ts");
		const jssResult = runAdapterMigration(jss.source, {
			from: "jss",
			to: "emotion",
			file: jss.file,
		});
		const style9Result = runAdapterMigration(style9.source, {
			from: "style9",
			to: "emotion",
			file: style9.file,
		});
		expect(jssResult.skipped).toBe(1);
		expect(style9Result.skipped).toBe(1);
		expect(jssResult.residuals.length + style9Result.residuals.length).toBeGreaterThan(0);
	});

	test("records residuals instead of silently accepting a dynamic corpus case", () => {
		const result = runDifferentialFixture({
			name: "jss-dynamic-corpus",
			sourceAdapter: "jss",
			targetAdapter: "vanilla-extract",
			file: "Dynamic.tsx",
			source: `import { createUseStyles } from "react-jss";\nconst useStyles = createUseStyles({ card: { color: props => props.color } });`,
		});
		expect(result.valid).toBe(false);
		expect(result.residuals.length).toBeGreaterThan(0);
	});
});
