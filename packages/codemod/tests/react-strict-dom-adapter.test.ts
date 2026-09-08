import { describe, expect, test } from "vitest";
import { BuiltinHostFramework, CodemodAdapterId, runAdapterMigration } from "../src/swap/index.ts";

const migrate = (source: string, from: string, to: string, file = "App.tsx") =>
	runAdapterMigration(source, {
		from,
		to,
		file,
		mode: "safe",
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

describe("react-strict-dom codemod adapter", () => {
	test("lowers css.create and html style hosts to Pandwind class carriers", () => {
		const result = migrate(
			'import { css, html } from "react-strict-dom";\nconst styles = css.create({ card: { color: "red", padding: "1rem" } });\nexport const Card = () => <html.div style={styles.card} />;',
			CodemodAdapterId.ReactStrictDom,
			CodemodAdapterId.Pandwind,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { createCss } from "pandwind/css";');
		expect(result.code).toContain('const styles = { "card": css.class');
		expect(result.code).toContain("<div className={styles.card} />");
		expect(result.code).not.toContain("react-strict-dom");
		expect(result.code).not.toContain("<html.");
	});

	test("emits real RSD css.create and html style syntax from Pandwind", () => {
		const result = migrate(
			'import { createCss } from "pandwind/css";\nconst css = createCss();\nexport const Card = () => <div className={css.class({ color: "red", padding: "1rem" })} />;',
			CodemodAdapterId.Pandwind,
			CodemodAdapterId.ReactStrictDom,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { css, html } from "react-strict-dom";');
		expect(result.code).toContain("css.create({ style:");
		expect(result.code).toContain("<html.div style={");
		expect(result.code).not.toContain("className=");
	});

	test("preserves component hosts when RSD cannot prove an intrinsic host", () => {
		const result = migrate(
			'import { Box } from "@chakra-ui/react";\n' +
				'export const Card = () => <Box className={css.class({ color: "red" })} />;',
			CodemodAdapterId.Pandwind,
			CodemodAdapterId.ReactStrictDom,
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "host-framework" })]),
		);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain("@chakra-ui/react");
		expect(result.code).not.toContain('from "react-strict-dom"');
	});

	test("preserves compiler-only theme APIs as typed residuals", () => {
		const result = migrate(
			'import { css } from "react-strict-dom";\nexport const theme = css.createTheme({ accent: "red" });',
			CodemodAdapterId.ReactStrictDom,
			CodemodAdapterId.Pandwind,
			"theme.ts",
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "configuration" })]),
		);
		expect(result.code).toContain("pandwind:migrate-skip");
	});

	test("preserves compat.native as a typed host-boundary residual", () => {
		const result = migrate(
			'import { compat } from "react-strict-dom";\nimport { Text } from "react-native";\nexport const Label = () => <compat.native as="text">{(props) => <Text {...props} />}</compat.native>;',
			CodemodAdapterId.ReactStrictDom,
			CodemodAdapterId.Pandwind,
			"compat.native.tsx",
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
		);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain("compat.native");
	});

	test("lowers the documented keyframes and defineVars forms", () => {
		const result = migrate(
			'import { css } from "react-strict-dom";\nexport const pulse = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });\nexport const theme = css.defineVars({ accent: "red" });',
			CodemodAdapterId.ReactStrictDom,
			CodemodAdapterId.Pandwind,
			"styles.ts",
		);

		expect(result.converted).toBe(2);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("registerSemanticRules");
		expect(result.code).toContain('"--accent"');
	});
});
