import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	runAdapterMigration,
} from "../src/swap/index.ts";

const catalog = createBuiltinCodemodCatalog();

function migrate(source: string, from: CodemodAdapterId, file = "src/Card.tsx") {
	return runAdapterMigration(source, {
		from,
		to: CodemodAdapterId.Pandwind,
		file,
		mode: "safe",
		readFile: () => undefined,
		adapterRegistry: catalog.registry,
	});
}

describe("remaining adapter-owned custom semantics", () => {
	test("resolves an inline Stitches theme reference and removes its bootstrap", () => {
		const result = migrate(
			'import { createStitches } from "@stitches/react";\n' +
				'const { css } = createStitches({ theme: { colors: { brand: "#123456" }, space: { 2: "0.5rem" } } });\n' +
				'export const card = css({ color: "$colors$brand", padding: "$space$2" });',
			CodemodAdapterId.Stitches,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("createStitches");
		expect(result.code).not.toContain("$colors$brand");
		expect(result.code).toContain('color: "#123456"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();
			export const card = css.class({ padding: "0.5rem", color: "#123456" });"
		`);
	});

	test("reports an unresolved Stitches custom token instead of guessing", () => {
		const result = migrate(
			'import { createStitches } from "@stitches/react";\n' +
				'const { css } = createStitches({ theme: { colors: { brand: "#123456" } } });\n' +
				'export const card = css({ color: "$colors$missing" });',
			CodemodAdapterId.Stitches,
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual([
			expect.objectContaining({
				kind: "configuration",
				text: "$colors$missing",
			}),
		]);
		expect(result.code).toContain("createStitches");
		expect(result.code).toContain("$colors$missing");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createStitches } from "@stitches/react";
			const { css } = createStitches({ theme: { colors: { brand: "#123456" } } });
			export const card = // pandwind:migrate-skip (route: stitches -> pandwind | parse-residual: configuration | available: named-map, residual)
			css({ color: "$colors$missing" });"
		`);
	});

	test("normalizes Tokenami token sigils before Pandwind emission", () => {
		const result = migrate(
			'import { css } from "@tokenami/css";\n' +
				'export const card = css({ color: "$colors.brand", padding: "$spacing.4" });',
			CodemodAdapterId.Tokenami,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('color: "brand"');
		expect(result.code).toContain('padding: "4"');
		expect(result.code).not.toContain("$colors");
		expect(result.code).not.toContain("$spacing");
	});

	test("lowers StyleX defineVars to real custom properties and references", () => {
		const result = migrate(
			'import stylex from "@stylexjs/stylex";\n' +
				'export const theme = stylex.defineVars({ brand: "#123456" });\n' +
				"export const card = stylex.create({ root: { color: theme.brand } });",
			CodemodAdapterId.StyleX,
		);

		expect(result.converted).toBe(2);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('property: "--brand"');
		expect(result.code).toContain('"brand": "var(--brand)"');
		expect(result.code).toContain('color: "var(--brand)"');
		expect(result.code).not.toContain("var(brand)");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			import { createCss } from "pandwind/css";
			const css = createCss();
			const runtimeCss = createRuntimeCss(pandwindPreset);
			export const theme = (runtimeCss.sheet.registerSemanticRules([{ kind: "global", selector: ":root", declarations: [{ property: "--brand", value: "#123456" }] }]), { "brand": "var(--brand)" });
			export const card = { "root": css.class({ color: "var(--brand)" }) };"
		`);
	});

	test("keeps Vanilla Extract variable declarations static", () => {
		const result = migrate(
			'import { createVar, style } from "@vanilla-extract/css";\n' +
				"export const accent = createVar();\n" +
				'export const card = style({ color: accent, vars: { [accent]: "#123456" } });',
			CodemodAdapterId.VanillaExtract,
			"src/Card.css.ts",
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('const accent = "--pw-accent"');
		expect(result.code).toContain('color: "var(--pw-accent)"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();
			export const accent = "--pw-accent";
			export const card = css.class({ "--pw-accent": "#123456", color: "var(--pw-accent)" });"
		`);
	});

	test("does not delete a Vanilla Extract theme contract it cannot lower", () => {
		const result = migrate(
			'import { createTheme, createThemeContract, style } from "@vanilla-extract/css";\n' +
				"export const contract = createThemeContract({ colors: { brand: null } });\n" +
				'export const theme = createTheme(contract, { colors: { brand: "#123456" } });\n' +
				"export const card = style({ color: contract.colors.brand });",
			CodemodAdapterId.VanillaExtract,
			"src/Card.css.ts",
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(2);
		expect(result.residuals).toEqual([
			expect.objectContaining({ kind: "configuration", text: "createThemeContract(" }),
			expect.objectContaining({ kind: "configuration", text: "createTheme(" }),
		]);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain("createThemeContract");
		expect(result.code).toContain("createTheme(contract");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createTheme, createThemeContract } from "@vanilla-extract/css";
			import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const runtimeCss = createRuntimeCss(pandwindPreset);
			export const contract = // pandwind:migrate-skip (route: vanilla-extract -> pandwind | parse-residual: configuration | available: named-map, residual)
			createThemeContract({ colors: { brand: null } });
			export const theme = // pandwind:migrate-skip (route: vanilla-extract -> pandwind | parse-residual: configuration | available: named-map, residual)
			createTheme(contract, { colors: { brand: "#123456" } });
			export const card = runtimeCss.class({ color: contract.colors.brand });"
		`);
	});

	test("preserves Emotion runtime providers instead of removing their imports", () => {
		const result = migrate(
			'import { ThemeProvider } from "@emotion/react";\n' +
				'import { css } from "@emotion/css";\n' +
				"export const card = css({ color: theme.colors.brand });\n" +
				"export const App = () => <ThemeProvider theme={theme}><div /></ThemeProvider>;",
			CodemodAdapterId.Emotion,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(2);
		expect(result.residuals).toEqual([
			expect.objectContaining({ kind: "runtime-context" }),
			expect.objectContaining({ kind: "runtime-context" }),
		]);
		expect(result.code).toContain('from "@emotion/react"');
		expect(result.code).toContain("<ThemeProvider");
		expect(result.code).toContain("theme.colors.brand");
		expect(result.code).toMatchInlineSnapshot(`
			"// pandwind:migrate-skip (route: emotion -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			import { ThemeProvider } from "@emotion/react";
			import { createCss } from "pandwind/css";
			const css = createCss();
			export const card = css.vars({ color: theme.colors.brand });
			export const App = () => // pandwind:migrate-skip (route: emotion -> pandwind | parse-residual: runtime-context | available: named-map, residual)
			<ThemeProvider theme={theme}><div /></ThemeProvider>;"
		`);
	});

	test("preserves JSS function-valued theme styles as runtime code", () => {
		const result = migrate(
			'import { createUseStyles } from "react-jss";\n' +
				"export const useStyles = createUseStyles({ card: { color: (theme) => theme.colors.brand } });",
			CodemodAdapterId.Jss,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("(theme) => theme.colors.brand");
		expect(result.code).toContain("runtimeCss.group");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const runtimeCss = createRuntimeCss(pandwindPreset);
			export const useStyles = { "card": runtimeCss.group({ color: (theme) => theme.colors.brand }) };"
		`);
	});

	test("preserves MUI createTheme references while lowering sx", () => {
		const result = migrate(
			'import { Box, createTheme } from "@mui/material";\n' +
				'const theme = createTheme({ palette: { primary: { main: "#123456" } } });\n' +
				"export const App = () => <Box sx={{ color: theme.palette.primary.main }} />;",
			CodemodAdapterId.Mui,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("createTheme");
		expect(result.code).toContain("theme.palette.primary.main");
		expect(result.code).toContain("css.vars");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createTheme } from "@mui/material";
			import { createCss } from "pandwind/css";
			const css = createCss();
			const theme = createTheme({ palette: { primary: { main: "#123456" } } });
			export const App = () => <div className={css.vars({ color: theme.palette.primary.main }).class} style={css.vars({ color: theme.palette.primary.main }).style} />;"
		`);
	});

	test("preserves Mantine createTheme references while lowering style props", () => {
		const result = migrate(
			'import { Box, createTheme } from "@mantine/core";\n' +
				'const theme = createTheme({ colors: { brand: ["#123456"] } });\n' +
				"export const App = () => <Box bg={theme.colors.brand[0]} />;",
			CodemodAdapterId.Mantine,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("createTheme");
		expect(result.code).toContain("theme.colors.brand[0]");
		expect(result.code).toContain("css.vars");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createTheme } from "@mantine/core";
			import { createCss } from "pandwind/css";
			const css = createCss();
			const theme = createTheme({ colors: { brand: ["#123456"] } });
			export const App = () => <div className={css.vars({ backgroundColor: theme.colors.brand[0] }).class} style={css.vars({ backgroundColor: theme.colors.brand[0] }).style} />;"
		`);
	});

	test("retains Treat createTheme as an explicit residual", () => {
		const result = migrate(
			'import { createTheme, style } from "treat"; export const theme = createTheme({ color: "#123456" }); export const card = style({ color: theme.color });',
			CodemodAdapterId.Treat,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual([
			expect.objectContaining({ kind: "configuration", text: "createTheme(" }),
		]);
		expect(result.code).toContain("createTheme");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createRuntimeCss } from "pandwind/css/runtime";
			import { pandwindPreset } from "pandwind/preset";
			const runtimeCss = createRuntimeCss(pandwindPreset);
			import { createTheme } from "treat"; export const theme = // pandwind:migrate-skip (route: treat -> pandwind | parse-residual: configuration | available: named-map, residual)
			createTheme({ color: "#123456" }); export const card = runtimeCss.class({ color: theme.color });"
		`);
	});

	test("retains Fela renderer plugins as an explicit residual", () => {
		const result = migrate(
			'import { createRenderer } from "fela"; const renderer = createRenderer({ plugins: [myPlugin] }); export const card = renderer.renderRule({ color: "red" });',
			CodemodAdapterId.Fela,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual([
			expect.objectContaining({ kind: "configuration", text: "createRenderer(" }),
		]);
		expect(result.code).toContain("createRenderer");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();
			import { createRenderer } from "fela"; const renderer = // pandwind:migrate-skip (route: fela -> pandwind | parse-residual: configuration | available: named-map, residual)
			createRenderer({ plugins: [myPlugin] }); export const card = css.class({ color: "red" });"
		`);
	});

	test("retains Goober setup as an explicit residual", () => {
		const result = migrate(
			'import { css, setup } from "goober"; setup(React.createElement); export const card = css({ color: theme.colors.brand });',
			CodemodAdapterId.Goober,
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual([
			expect.objectContaining({ kind: "configuration", text: "setup(" }),
		]);
		expect(result.code).toContain("setup(React.createElement)");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();
			import { setup } from "goober"; // pandwind:migrate-skip (route: goober -> pandwind | parse-residual: configuration | available: named-map, residual)
			setup(React.createElement); export const card = css.vars({ color: theme.colors.brand });"
		`);
	});

	test("emits Panda cva for a Pandwind recipe carrier", () => {
		const result = runAdapterMigration(
			'import { createCss } from "pandwind/css";\n' +
				'import { createRecipe } from "pandwind/recipe";\n' +
				"const css = createCss();\n" +
				'export const button = createRecipe(css, { base: { color: "red" }, variants: { size: { sm: { padding: "2" } } } });',
			{
				from: CodemodAdapterId.Pandwind,
				to: CodemodAdapterId.Panda,
				file: "src/button.ts",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
			},
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { cva } from "styled-system/recipes";');
		expect(result.code).toContain('cva({ base: { color: "red" }');
		expect(result.code).not.toContain("createRecipe");
		expect(result.code).not.toContain("createCss");
		expect(result.code).toMatchInlineSnapshot(`
			"import { cva } from "styled-system/recipes";

			export const button = cva({ base: { color: "red" }, variants: { "size": { "sm": { padding: "2" } } } });"
		`);
	});

	test("emits Panda sva for a Pandwind slot-recipe carrier", () => {
		const result = runAdapterMigration(
			'import { createCss } from "pandwind/css";\n' +
				'import { createSlotRecipe } from "pandwind/recipe";\n' +
				"const css = createCss();\n" +
				'export const card = createSlotRecipe(css, { slots: { root: { color: "red" }, label: {} }, slotVariants: { size: { sm: { root: { padding: "2" } } } } });',
			{
				from: CodemodAdapterId.Pandwind,
				to: CodemodAdapterId.Panda,
				file: "src/card.ts",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
			},
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { sva } from "styled-system/recipes";');
		expect(result.code).toContain('sva({ slots: ["root", "label"]');
		expect(result.code).not.toContain("createSlotRecipe");
		expect(result.code).toMatchInlineSnapshot(`
			"import { sva } from "styled-system/recipes";

			export const card = sva({ slots: ["root", "label"], base: { "root": { color: "red" }, "label": {  } }, variants: { "size": { "sm": { "root": { padding: "2" } } } } });"
		`);
	});
});
