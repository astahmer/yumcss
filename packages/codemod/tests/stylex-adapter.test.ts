import { describe, expect, test } from "vitest";
import { CodemodAdapterId, runAdapterMigration } from "../src/swap/index.ts";

describe("StyleX source adapter", () => {
	test("resolves bracketed token variables as computed custom-property keys", () => {
		const result = runAdapterMigration(
			[
				'import * as stylex from "@stylexjs/stylex";',
				"const vars = { '--text-body-size': '--text-body-size' };",
				"const styles = stylex.create({ root: { [vars['--text-body-size']]: '1rem' } });",
				"export const View = () => <div {...stylex.props(styles.root)} />;",
			].join("\n"),
			{
				from: CodemodAdapterId.StyleX,
				to: CodemodAdapterId.Pandwind,
				file: "src/View.tsx",
				root: ".",
				mode: "safe",
				semantic: { source: { file: "src/View.tsx", framework: "react" } },
			},
		);

		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.props(styles.root)");
		expect(result.code).not.toContain("pandwind:migrate-skip");
	});
});
