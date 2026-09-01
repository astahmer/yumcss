import { describe, expect, test } from "vitest";
import {
	BuiltinHostFramework,
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

	test("projects a static styled intrinsic subject to a React Native View", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red", padding: "1rem" });\n' +
				'export const App = () => <Card data-testid="card" />;',
			{
				from: CodemodAdapterId.StyledComponents,
				to: CodemodAdapterId.ReactNative,
				file: "App.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			},
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('<View data-testid="card" style={Card} />');
		expect(result.code).toContain("View");
		expect(result.code).toContain('from "react-native"');
		expect(result.code).not.toContain("styled-components");
	});

	test.each([CodemodAdapterId.NextYak, CodemodAdapterId.SolidStyled] as const)(
		"projects a standalone static %s subject to a React Native component",
		(sourceAdapter) => {
			const source =
				sourceAdapter === CodemodAdapterId.NextYak
					? 'import { styled } from "next-yak";\n' +
						"const Card = styled.div`color: red; padding: 1rem;`;"
					: 'import { styled } from "solid-styled-components";\n' +
						'const Card = styled.div({ color: "red", padding: "1rem" });';
			const result = runAdapterMigration(source, {
				from: sourceAdapter,
				to: CodemodAdapterId.ReactNative,
				file: "Card.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			});

			expect(result.skipped, `${sourceAdapter} -> ${CodemodAdapterId.ReactNative}`).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).toContain("(props) => <View");
			expect(result.code).toContain("StyleSheet.create");
			expect(result.code).not.toContain(sourceAdapter);
		},
	);

	test("projects a static Solid host document into a Vue SFC", () => {
		const result = runAdapterMigration(
			'import { styled } from "solid-styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				'export function App() { return <Card className="extra" />; }',
			{
				from: CodemodAdapterId.SolidStyled,
				to: CodemodAdapterId.VueStyled,
				file: "App.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
			},
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.outputExtension).toBe(".vue");
		expect(result.code).toContain("<script setup>");
		expect(result.code).toContain("<template>");
		expect(result.code).toContain('<Card class="extra" />');
		expect(result.code).not.toContain("solid-styled-components");
	});

	test("keeps a dynamic styled subject as an explicit React Native residual", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div({ color: (props) => props.color });\n" +
				"export const App = () => <Card />;",
			{
				from: CodemodAdapterId.StyledComponents,
				to: CodemodAdapterId.ReactNative,
				file: "App.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			},
		);

		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "function-dynamic" })]),
		);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain("styled.div");
	});

	test.each([
		[
			CodemodAdapterId.Stitches,
			'import { css } from "@stitches/react";',
			'const Card = css({ color: "red" });',
		],
		[
			CodemodAdapterId.Mui,
			'import { styled } from "@mui/system";',
			'const Card = styled("div")({ color: "red" });',
		],
		[
			CodemodAdapterId.StyleX,
			'import * as stylex from "@stylexjs/stylex";',
			'const Card = stylex.create({ style: { color: "red" } }).style;',
		],
	] as const)(
		"projects a static Solid host into %s's React-compatible target",
		(target, targetImport, declaration) => {
			const result = runAdapterMigration(
				'import { styled } from "solid-styled-components";\n' +
					'const Card = styled.div({ color: "red" });\n' +
					"export const App = () => <Card />;",
				{
					from: CodemodAdapterId.SolidStyled,
					to: target,
					file: "App.tsx",
					mode: "safe",
					readFile: () => undefined,
					adapterRegistry: catalog.registry,
					semantic: { source: { framework: BuiltinHostFramework.Solid } },
				},
			);

			expect(result.skipped, `${CodemodAdapterId.SolidStyled} -> ${target}`).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).toContain(targetImport);
			expect(result.code).toContain(declaration);
			expect(result.code).not.toContain("solid-styled-components");
		},
	);

	test.each([
		[CodemodAdapterId.Stitches, 'import { css } from "@stitches/react";'],
		[CodemodAdapterId.Mui, 'import { styled } from "@mui/system";'],
		[CodemodAdapterId.StyleX, 'import * as stylex from "@stylexjs/stylex";'],
	] as const)("projects a static Vue SFC into %s's React host dialect", (target, targetImport) => {
		const result = runAdapterMigration(
			"<script setup>\n" +
				'import styled from "vue-styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				"</script>\n<template><Card /></template>",
			{
				from: CodemodAdapterId.VueStyled,
				to: target,
				file: "App.vue",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.Vue } },
			},
		);

		expect(result.skipped, `${CodemodAdapterId.VueStyled} -> ${target}`).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(targetImport);
		expect(result.code).toContain("export default function App()");
		expect(result.code).toMatch(/<(?:Card|div)\b/);
		expect(result.code).not.toContain("<template>");
		expect(result.code).not.toContain("vue-styled-components");
		expect(result.outputExtension).toBe(".tsx");
	});

	test("preserves a reactive Vue SFC as an explicit host residual", () => {
		const source =
			"<script setup>\n" +
			'import { ref } from "vue";\n' +
			'import styled from "vue-styled-components";\n' +
			"const active = ref(true);\n" +
			'const Card = styled.div({ color: "red" });\n' +
			'</script>\n<template><Card v-if="active" /></template>';
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.VueStyled,
			to: CodemodAdapterId.Stitches,
			file: "App.vue",
			mode: "safe",
			readFile: () => undefined,
			adapterRegistry: catalog.registry,
			semantic: { source: { framework: BuiltinHostFramework.Vue } },
		});

		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: expect.stringMatching(/capability|host-framework/) }),
			]),
		);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain("vue-styled-components");
		expect(result.outputExtension).toBeUndefined();
	});

	test.each([CodemodAdapterId.Stitches, CodemodAdapterId.Mui, CodemodAdapterId.StyleX] as const)(
		"preserves Solid-only host semantics as a typed residual for %s",
		(target) => {
			const result = runAdapterMigration(
				'import { createSignal } from "solid-js";\n' +
					'import { styled } from "solid-styled-components";\n' +
					'const Card = styled.div({ color: "red" });\n' +
					'export const App = () => <Card class="extra" />;',
				{
					from: CodemodAdapterId.SolidStyled,
					to: target,
					file: "App.tsx",
					mode: "safe",
					readFile: () => undefined,
					adapterRegistry: catalog.registry,
					semantic: { source: { framework: BuiltinHostFramework.Solid } },
				},
			);

			expect(result.skipped, `${CodemodAdapterId.SolidStyled} -> ${target}`).toBeGreaterThan(0);
			expect(result.residuals.length).toBeGreaterThan(0);
			expect(result.code).toContain("pandwind:migrate-skip");
			expect(result.code).toContain("solid-styled-components");
		},
	);

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

	test.each([CodemodAdapterId.Emotion, CodemodAdapterId.Jss, CodemodAdapterId.Aphrodite] as const)(
		"preserves CSS-origin numeric spacing when targeting Chakra UI from %s",
		(sourceAdapter) => {
			const sourceByAdapter = {
				[CodemodAdapterId.Emotion]:
					'import { css } from "@emotion/css";\nconst card = css({ padding: 16 });',
				[CodemodAdapterId.Jss]:
					'import { createUseStyles } from "react-jss";\nconst card = createUseStyles({ padding: 16 });',
				[CodemodAdapterId.Aphrodite]:
					'import { StyleSheet } from "aphrodite";\nconst card = StyleSheet.create({ padding: 16 });',
			}[sourceAdapter];
			const result = migrate(sourceByAdapter, sourceAdapter, CodemodAdapterId.ChakraUi);

			expect(result.skipped, `${sourceAdapter} -> ${CodemodAdapterId.ChakraUi}`).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).toContain('padding: "16px"');
			expect(result.validations.every((validation) => validation.valid)).toBe(true);
		},
	);

	test.each([
		[CodemodAdapterId.Jss, CodemodAdapterId.SolidStyled, BuiltinHostFramework.Solid, "App.tsx"],
		[
			CodemodAdapterId.Aphrodite,
			CodemodAdapterId.SolidStyled,
			BuiltinHostFramework.Solid,
			"App.tsx",
		],
		[CodemodAdapterId.Style9, CodemodAdapterId.SolidStyled, BuiltinHostFramework.Solid, "App.tsx"],
		[CodemodAdapterId.Jss, CodemodAdapterId.VueStyled, BuiltinHostFramework.Vue, "App.vue"],
		[CodemodAdapterId.Aphrodite, CodemodAdapterId.VueStyled, BuiltinHostFramework.Vue, "App.vue"],
		[CodemodAdapterId.Style9, CodemodAdapterId.VueStyled, BuiltinHostFramework.Vue, "App.vue"],
	] as const)(
		"projects a static %s class carrier across %s hosts",
		(target, sourceAdapter, framework, file) => {
			const source =
				sourceAdapter === CodemodAdapterId.SolidStyled
					? 'import { styled } from "solid-styled-components";\n' +
						'const Card = styled.div({ color: "red" });\n' +
						"export const App = () => <Card />;"
					: "<script setup>\n" +
						'import styled from "vue-styled-components";\n' +
						'const Card = styled.div({ color: "red" });\n' +
						"</script>\n<template><Card /></template>";
			const result = runAdapterMigration(source, {
				from: sourceAdapter,
				to: target,
				file,
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework } },
			});

			expect(result.skipped, `${sourceAdapter} -> ${target}`).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).toContain(
				framework === BuiltinHostFramework.Vue
					? '<div :class="Card" />'
					: "<div className={Card} />",
			);
			expect(result.code).not.toContain("solid-styled-components");
			expect(result.code).not.toContain("vue-styled-components");
		},
	);

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
		expect(result.code).toContain('import { createRuntimeCss } from "pandwind/css/runtime"');
		expect(result.code).toContain("css.vars({");
		expect(result.code).toMatch(/["']color["']:\s*theme\.foreground/);
	});

	test.each([
		[CodemodAdapterId.Emotion, "theme.foreground"],
		[CodemodAdapterId.StyledComponents, "theme.foreground"],
		[CodemodAdapterId.Stitches, "theme.foreground"],
		[CodemodAdapterId.ChakraUi, "theme.foreground"],
		[CodemodAdapterId.NextYak, "theme.foreground"],
		[CodemodAdapterId.Goober, "theme.foreground"],
		[CodemodAdapterId.Fela, "theme.foreground"],
	] as const)("preserves a hostless dynamic carrier for %s", (target, expression) => {
		const result = migrate(
			`import { css } from "pandwind/css";\nconst card = css.class({ color: ${expression} });`,
			CodemodAdapterId.Pandwind,
			target,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(expression);
	});

	test("lowers a host-bound dynamic value to a Tailwind custom-property carrier", () => {
		const result = migrate(
			'import { css } from "pandwind/css";\n' +
				"const card = css.class({ color: theme.foreground });\n" +
				"export const App = () => <div className={card} />;",
			CodemodAdapterId.Pandwind,
			CodemodAdapterId.Tailwind,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("[color:var(--pandwind-dynamic-");
		expect(result.code).toContain('style={{ "--pandwind-dynamic-');
		expect(result.code).toContain("theme.foreground");
	});

	test("lowers a host-bound dynamic value to an UnoCSS custom-property carrier", () => {
		const result = migrate(
			'import { css } from "pandwind/css";\n' +
				"const card = css.class({ color: theme.foreground });\n" +
				"export const App = () => <div className={card} />;",
			CodemodAdapterId.Pandwind,
			CodemodAdapterId.UnoCSS,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("[color:var(--pandwind-dynamic-");
		expect(result.code).toContain('style={{ "--pandwind-dynamic-');
		expect(result.code).toContain("theme.foreground");
	});

	test.each([
		CodemodAdapterId.Bamboo,
		CodemodAdapterId.VanillaExtract,
		CodemodAdapterId.Jss,
		CodemodAdapterId.Aphrodite,
		CodemodAdapterId.Style9,
		CodemodAdapterId.Compiled,
		CodemodAdapterId.Treat,
		CodemodAdapterId.Linaria,
	] as const)("uses the shared dynamic class carrier for %s", (target) => {
		const result = migrate(
			'import { css } from "pandwind/css";\n' +
				"const card = css.class({ color: theme.foreground });\n" +
				"export const App = () => <Box className={card} />;",
			CodemodAdapterId.Pandwind,
			target,
		);

		expect(result.converted, `${CodemodAdapterId.Pandwind} -> ${target}`).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("var(--pandwind-dynamic-");
		expect(result.code).toContain('style={{ "--pandwind-dynamic-');
		expect(result.code).toContain("String(theme.foreground)");
	});

	test("does not overwrite an existing host style while lowering a dynamic class", () => {
		const result = migrate(
			'import { css } from "pandwind/css";\n' +
				"const card = css.class({ color: theme.foreground });\n" +
				'export const App = () => <div className={card} style={{ color: "blue" }} />;',
			CodemodAdapterId.Pandwind,
			CodemodAdapterId.Tailwind,
		);

		expect(result.code).toContain("theme.foreground");
		expect(result.code).toContain('style={{ color: "blue" }}');
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "dynamic-custom-property" })]),
		);
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
