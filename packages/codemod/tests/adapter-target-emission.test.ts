import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();

function migrate(source: string, from: CodemodAdapterId, to: CodemodAdapterId, file = "Card.tsx") {
	return runAdapterMigration(source, {
		from,
		to,
		file,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
	});
}

describe("target adapter emission contract", () => {
	test("emits native StyleX source when StyleX is selected as the target", () => {
		const result = migrate(
			'import { css } from "@emotion/css";\nconst card = css({ color: "red" });',
			CodemodAdapterId.Emotion,
			CodemodAdapterId.StyleX,
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import * as stylex from "@stylexjs/stylex";');
		expect(result.code).toContain('stylex.create({ style: { color: "red" } }).style');
		expect(result.code).not.toContain("createCss");
		expect(result.outcomes).toMatchObject([{ outcome: "static", representation: "static" }]);
	});

	test("projects an intrinsic React host through MUI Box instead of a DOM sx prop", () => {
		const result = migrate(
			'import { createCss } from "pandwind/css";\n' +
				"const css = createCss();\n" +
				'const card = css.class({ color: "red" });\n' +
				"export const App = () => <div className={card}>content</div>;",
			CodemodAdapterId.Pandwind,
			CodemodAdapterId.Mui,
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('<Box component="div" sx={card}>content</Box>');
		expect(result.code).toContain('import { Box } from "@mui/material";');
		expect(result.code).not.toContain("<div sx={card}");
		expect(result.outcomes).toMatchObject([{ outcome: "static", representation: "static" }]);
	});

	test("uses a portable static artifact for an unknown custom component", () => {
		const result = migrate(
			'import { createCss } from "pandwind/css";\n' +
				"const css = createCss();\n" +
				'const card = css.class({ color: "red" });\n' +
				"export const App = () => <CustomCard className={card} />;",
			CodemodAdapterId.Pandwind,
			CodemodAdapterId.Mui,
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("className={card}");
		expect(result.code).not.toContain("sx={card}");
		expect(result.code).toContain('import { createCss } from "pandwind/css";');
		expect(result.code).toContain("css.class");
		expect(result.outcomes).toMatchObject([
			{ outcome: "portable-artifact", representation: "portable-artifact" },
		]);
	});

	test("uses a portable static artifact for a standalone MUI style value", () => {
		const result = migrate(
			'import { createCss } from "pandwind/css";\n' +
				"const css = createCss();\n" +
				'const card = css.class({ color: "red" });',
			CodemodAdapterId.Pandwind,
			CodemodAdapterId.Mui,
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { createCss } from "pandwind/css";');
		expect(result.code).toContain("css.class");
		expect(result.outcomes).toMatchObject([
			{ outcome: "portable-artifact", representation: "portable-artifact" },
		]);
	});

	test("uses the runtime portable artifact for a hostless dynamic MUI value", () => {
		const result = migrate(
			'import { createCss } from "pandwind/css";\n' +
				"const css = createCss();\n" +
				"const card = css.class({ color: theme.foreground });",
			CodemodAdapterId.Pandwind,
			CodemodAdapterId.Mui,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.outcomes).toMatchObject([
			{ outcome: "portable-artifact", representation: "portable-artifact" },
		]);
		expect(result.loweringPlans[0]?.availableRepresentations).toContain("portable-artifact");
		expect(result.code).toContain("css.class({ color: theme.foreground })");
	});

	test("preserves a React Native named style map through MUI's portable target", () => {
		const result = migrate(
			'import { StyleSheet } from "react-native";\n' +
				'const styles = StyleSheet.create({ button: { color: "red" } });',
			CodemodAdapterId.ReactNative,
			CodemodAdapterId.Mui,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"button": css.class({ color: "red" })');
	});

	test.each([
		[CodemodAdapterId.Goober, 'import { css } from "goober";'],
		[CodemodAdapterId.Aphrodite, 'import { StyleSheet } from "aphrodite";'],
		[CodemodAdapterId.Style9, 'import style9 from "style9";'],
		[CodemodAdapterId.Compiled, 'import { css } from "@compiled/react";'],
		[CodemodAdapterId.SolidStyled, 'import { styled } from "solid-styled-components";'],
		[CodemodAdapterId.VueStyled, 'import styled from "vue-styled-components";'],
		[CodemodAdapterId.ReactNative, 'import { StyleSheet } from "react-native";'],
	] as const)("adds the target-owned import for %s", (target, expectedImport) => {
		const result = migrate(
			'import { css } from "@emotion/css";\nconst card = css({ color: "red" });',
			CodemodAdapterId.Emotion,
			target,
		);

		expect(result.skipped, `${CodemodAdapterId.Emotion} -> ${target}`).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(expectedImport);
	});
});
