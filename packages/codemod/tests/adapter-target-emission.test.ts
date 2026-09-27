import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { loadMetaFromSources } from "../src/meta.ts";
import { StyleProgramResidualKindTag } from "../src/swap/semantic-ir.ts";
import {
	BuiltinHostFramework,
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createStyleAdapterRegistry,
	externalIdentifier,
	runAdapterMigration,
	runAdapterMigrationAsync,
	SwapSourceId,
} from "../src/swap/index.ts";
import { NODE_PROJECT_MODULE_LOADER } from "../src/swap/project-module-loader.ts";
import { createAdapterRouteProject, createAdapterRouteSpec } from "./route-spec-support.ts";

const catalog = createBuiltinCodemodCatalog();
const nodeCatalog = createBuiltinCodemodCatalog(NODE_PROJECT_MODULE_LOADER);
const exampleRoot = resolve(import.meta.dirname, "../../../examples/example");
const exampleSourceDir = resolve(import.meta.dirname, "../../../examples/example/src");
const exampleFiles = [
	resolve(exampleSourceDir, "tailwind.css"),
	resolve(exampleSourceDir, "pandwind-theme.css"),
	resolve(exampleSourceDir, "pandwind.safelist.css"),
];
const exampleMeta = loadMetaFromSources({
	typesDtsPath: resolve(exampleSourceDir, "types.d.ts"),
	twTsPath: resolve(exampleSourceDir, "tw.ts"),
	bridgePath: resolve(exampleSourceDir, "bridge.ts"),
});

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

const migrateChakra = (source: string, to: CodemodAdapterId, file = "Card.tsx") =>
	createAdapterRouteSpec(CodemodAdapterId.ChakraUi, to).runAsync({
		source,
		file,
		project: createAdapterRouteProject(CodemodAdapterId.ChakraUi, to, "#2a57c8"),
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

describe("target adapter emission contract", () => {
	test("preserves the JSX host when targeting Pandwind's tw dialect", async () => {
		const result = await runAdapterMigrationAsync('<div className="bg-black" />', {
			from: CodemodAdapterId.Tailwind,
			to: `${CodemodAdapterId.Pandwind}:${SwapSourceId.Tw}`,
			file: resolve(exampleRoot, "Card.tsx"),
			root: exampleRoot,
			mode: "safe",
			meta: exampleMeta,
			readFile: (file) => {
				try {
					return readFileSync(file, "utf8");
				} catch {
					return undefined;
				}
			},
			listFiles: () => exampleFiles,
			moduleLoader: NODE_PROJECT_MODULE_LOADER,
			adapterRegistry: nodeCatalog.registry,
		});

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("<div className={tw(");
		expect(result.code).toContain('import { tw } from "pandwind";');
		expect(result.code).not.toMatch(/^\s*tw\(\{/u);
		expect(result.validations).toMatchObject([{ valid: true }]);
	});

	test("uses Chakra's css prop instead of a fabricated className css carrier", () => {
		const result = migrate(
			'import { css } from "styled-system/css";\n' +
				'const card = css({ padding: "1rem", color: "$colors.brand" });\n' +
				"export const App = () => <div className={card} />;",
			CodemodAdapterId.Bamboo,
			CodemodAdapterId.ChakraUi,
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("<chakra.div css={{");
		expect(result.code).not.toContain("className={css(");
		expect(result.code).not.toContain('from "styled-system/css"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { chakra } from "@chakra-ui/react";
			const card = { padding: "1rem", color: "$colors.brand" };
			export const App = () => <chakra.div css={{ padding: "1rem", color: "$colors.brand" }} />;"
		`);
	});

	test("keeps finite literal conditional values on the static class path", async () => {
		const result = await migrateChakra(
			'import { Box } from "@chakra-ui/react";\n' +
				"export const App = ({ noHistoricalData }: { noHistoricalData: boolean }) => " +
				'<Box color={noHistoricalData ? "fg.muted" : "red"} fontSize="xs" />;',
			CodemodAdapterId.Pandwind,
			"SyncCell.tsx",
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.class");
		expect(result.code).toContain('color: noHistoricalData ? "fg.muted" : "red"');
		expect(result.code).not.toContain("css.vars");
		expect(result.code).not.toContain("style=");
	});

	test("emits literal responsive JSX styles as one static class", async () => {
		const result = await migrateChakra(
			'import { Box } from "@chakra-ui/react";\n' +
				'export const App = () => <Box data-label="Action" flex="1" minW={{ base: "full", md: "260px" }} />;',
			CodemodAdapterId.Pandwind,
			"Filters.tsx",
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(
			'className={css.class({ flex: "1", minWidth: "100%", "@media (min-width: 768px)": { minWidth: "260px" } })}',
		);
		expect(result.code).not.toContain('from "@chakra-ui/react"');
		expect(result.code).not.toContain("css.props");
		expect(result.code).not.toContain("css.vars");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div data-label="Action" className={css.class({ flex: "1", minWidth: "100%", "@media (min-width: 768px)": { minWidth: "260px" } })} />;"
		`);
	});

	test("preserves an exported styled component subject as a component", () => {
		const result = migrate(
			'import styled from "styled-components";\n' +
				"const Link = (props: { href: string }) => <a {...props} />;\n" +
				'export const Card = styled(Link)({ color: "red" });',
			CodemodAdapterId.StyledComponents,
			CodemodAdapterId.Pandwind,
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("const __pandwindSlot =");
		expect(result.code).toContain("export const Card = __pandwindSlot(");
		expect(result.code).toContain("(Link)");
		expect(result.code).not.toMatch(/export const Card = css\.class\(/u);
	});

	test("returns the registered keyframe name for external consumers", () => {
		const result = migrate(
			'import { keyframes } from "styled-components";\n' +
				"export const pulse = keyframes`from { opacity: 0; } to { opacity: 1; }`;\n" +
				"export const animationName = pulse;",
			CodemodAdapterId.StyledComponents,
			CodemodAdapterId.Pandwind,
			"animation.ts",
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("export const pulse = (() =>");
		expect(result.code).toContain("runtimeCss.sheet.registerSemanticRules");
		expect(result.code).toContain("return name; })();");
		expect(result.code).toContain("export const animationName = pulse;");
		expect(result.code).not.toContain(']), "pw-kf-pulse")');
	});

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
			'import { createUnsafeCss } from "pandwind/unsafe/css";\n' +
				"const css = createUnsafeCss();\n" +
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

	test.each([CodemodAdapterId.Tailwind, CodemodAdapterId.UnoCSS] as const)(
		"projects JSX style-prop hosts through the shared %s host port exactly once",
		async (target) => {
			const result = await migrateChakra(
				'import { Box } from "@chakra-ui/react";\n' +
					'export const App = () => <Box bg="tomato" />;',
				target,
			);

			expect(result.skipped, `${CodemodAdapterId.ChakraUi} -> ${target}`).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).toContain('className={"[background:tomato]"}');
			expect(result.code).not.toMatch(/\bclassName\s*=\s*\{\s*<Box/u);
		},
	);

	test.each([
		CodemodAdapterId.Bamboo,
		CodemodAdapterId.VanillaExtract,
		CodemodAdapterId.Tailwind,
		CodemodAdapterId.UnoCSS,
	] as const)("projects a dynamic JSX style prop onto %s's class carrier", async (target) => {
		const result = await migrateChakra(
			'import { Box } from "@chakra-ui/react";\n' +
				"export const App = () => <Box bg={theme.foreground} />;",
			target,
		);
		if (target === CodemodAdapterId.VanillaExtract) {
			expect(result.converted).toBe(0);
			expect(result.skipped).toBeGreaterThan(0);
			expect(result.residuals).toEqual(
				expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
			);
			expect(result.code).toContain("bg={theme.foreground}");
			expect(result.code).not.toContain("className");
			return;
		}

		expect(result.skipped, `${CodemodAdapterId.ChakraUi} -> ${target}`).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("className");
		expect(result.code).toContain("style=");
		expect(result.code).toContain("theme.foreground");
		expect(result.code).not.toContain("bg={theme.foreground}");
		expect(result.code).not.toContain("adapter capability mismatch");
	});

	test("keeps an unbounded dynamic value as source with a typed residual", () => {
		// T7 issue fixture: a call expression is not a bounded scalar - the
		// portable lane must not invent a css.vars carrier for it; the source
		// stays and the migration reports a capability residual.
		const result = runAdapterMigration(
			'import { css } from "@linaria/core";' +
				String.fromCharCode(10) +
				"const card = css`color: computeColor(accent);`;",
			{
				from: CodemodAdapterId.Linaria,
				to: CodemodAdapterId.Pandwind,
				file: "Card.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			},
		);

		expect(result.code).toContain("computeColor(accent)");
		expect(result.code).not.toContain("css.vars(");
		expect(
			result.residuals.some((residual) => residual.kind === StyleProgramResidualKindTag.Capability),
		).toBe(true);
	});

	test("preserves scalar template dynamics when Chakra has no host carrier", () => {
		const result = runAdapterMigration(
			'import { css } from "@linaria/core";\nconst card = css`color: ${theme.foreground};`;',
			{
				from: CodemodAdapterId.Linaria,
				to: CodemodAdapterId.ChakraUi,
				file: "Card.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			},
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { createUnsafeCss } from "pandwind/unsafe/css";');
		expect(result.code).toContain("theme.foreground");
		expect(result.code).toContain("css.vars({");
		expect(result.outcomes).toMatchObject([
			{ outcome: "portable-artifact", representation: "portable-artifact" },
		]);
	});

	test("types runtime carriers loosely when generated styles contain raw CSS values", () => {
		const result = runAdapterMigration(
			'import { css } from "@linaria/core";\n' +
				"const card = css`color: ${theme.foreground}; padding: 0.5em 1em;`;",
			{
				from: CodemodAdapterId.Linaria,
				to: CodemodAdapterId.ChakraUi,
				file: "Card.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			},
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("const css = createUnsafeCss();");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			const card = css.vars({ "padding": "0.5em 1em", "color": theme.foreground });"
		`);
	});

	test.each([
		CodemodAdapterId.Bamboo,
		CodemodAdapterId.VanillaExtract,
		CodemodAdapterId.Tailwind,
		CodemodAdapterId.UnoCSS,
	] as const)("projects a scalar dynamic styled subject through %s's class carrier", (target) => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div({ color: theme.foreground });\n" +
				"export const App = () => <Card />;",
			{
				from: CodemodAdapterId.StyledComponents,
				to: target,
				file: "App.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			},
		);
		if (target === CodemodAdapterId.VanillaExtract) {
			expect(result.converted).toBe(0);
			expect(result.skipped).toBeGreaterThan(0);
			expect(result.residuals).toEqual(
				expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
			);
			expect(result.code).toContain("styled.div({ color: theme.foreground })");
			expect(result.code).toContain("<Card />");
			return;
		}

		expect(result.skipped, `${CodemodAdapterId.StyledComponents} -> ${target}`).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("const Card = (props) => <div");
		expect(result.code).toContain("theme.foreground");
		expect(result.code).toContain("<Card />");
		expect(result.code).not.toContain("styled-components");
	});

	test("reports a styled subject whose theme expression has no verified Chakra mapping", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div({ color: theme.foreground });\n" +
				"export const App = () => <Card />;",
			{
				from: CodemodAdapterId.StyledComponents,
				to: CodemodAdapterId.ChakraUi,
				file: "App.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			},
		);

		expect(result.skipped).toBe(1);
		expect(
			result.residuals.some(
				(residual) => residual.kind === StyleProgramResidualKindTag.DynamicCustomProperty,
			),
		).toBe(true);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain("theme.foreground");
		expect(result.code).toContain("<div className={Card} />");
	});

	test("keeps scalar dynamic styled subjects in MUI's target-native styled carrier", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div({ color: theme.foreground });\n" +
				"export const App = () => <Card />;",
			{
				from: CodemodAdapterId.StyledComponents,
				to: CodemodAdapterId.Mui,
				file: "App.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			},
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { styled } from "@mui/system";');
		expect(result.code).toContain('styled("div")({ color: theme.foreground })');
		expect(result.code).toContain("<Card />");
	});

	test("uses Mantine's host style prop for dynamic JSX styles", async () => {
		const result = await migrateChakra(
			'import { Box } from "@chakra-ui/react";\n' +
				"export const App = () => <Box bg={theme.foreground} />;",
			CodemodAdapterId.Mantine,
			"App.tsx",
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("style={{ background: theme.foreground }}");
		expect(result.code).not.toContain("bg={theme.foreground}");
		expect(result.code).toMatchInlineSnapshot(`
			"import { Box } from "@mantine/core";
			export const App = () => <Box  style={{ background: theme.foreground }}/>;"
		`);
	});

	test("preserves scalar template interpolation in Next-yak's runtime template", () => {
		const result = runAdapterMigration(
			'import { css } from "@linaria/core";\nconst card = css`color: ${theme.foreground};`;',
			{
				from: CodemodAdapterId.Linaria,
				to: CodemodAdapterId.NextYak,
				file: "Card.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			},
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { css } from "next-yak";');
		expect(result.code).toContain("${theme.foreground}");
		expect(result.code).not.toContain("pandwind:migrate-skip");
	});

	test.each(
		catalog.adapters
			.filter((adapter) => adapter.migration?.targetPolicy?.dynamicClassCarrier === true)
			.map((adapter) => adapter.id),
	)("uses the shared dynamic subject projection for %s", (target) => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div({ color: theme.foreground });\n" +
				"export const App = () => <Card />;",
			{
				from: CodemodAdapterId.StyledComponents,
				to: target,
				file: "App.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			},
		);
		if (target === CodemodAdapterId.VanillaExtract || target === CodemodAdapterId.Treat) {
			expect(result.converted).toBe(0);
			expect(result.skipped).toBeGreaterThan(0);
			expect(result.residuals).toEqual(
				expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
			);
			expect(result.code).toContain("theme.foreground");
			expect(result.code).toContain("<Card />");
			return;
		}

		expect(result.skipped, `${CodemodAdapterId.StyledComponents} -> ${target}`).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("const Card = (props) =>");
		expect(result.code).toContain("theme.foreground");
		expect(result.code).toContain("<Card />");
	});

	test("normalizes a registered substitute through the shared class-host port", () => {
		const bamboo = catalog.registry.get(CodemodAdapterId.Bamboo)!;
		const substituteId = externalIdentifier("test-class-target");
		const substitute = {
			...bamboo,
			id: substituteId,
			capabilities: { ...bamboo.capabilities, adapter: substituteId },
			emit: () => ({ text: "targetClass", residuals: [] }),
		};
		const registry = createStyleAdapterRegistry([
			catalog.registry.get(CodemodAdapterId.ChakraUi)!,
			substitute,
		]);
		const result = runAdapterMigration(
			'import { Box } from "@chakra-ui/react";\n' +
				"export const App = () => <Box css={{ backgroundColor: theme.foreground }} />;",
			{
				from: CodemodAdapterId.ChakraUi,
				to: substituteId,
				file: "App.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: registry,
			},
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("className={targetClass}");
		expect(result.code).toContain("theme.foreground");
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
		expect(result.code).toMatchInlineSnapshot(`
			"<script setup>
			import { ref } from "vue";
			import styled from "vue-styled-components";
			const active = ref(true);
			// pandwind:migrate-skip (route: vue-styled -> stitches | capability-blocked: framework-semantics: vue | available: static, named-map, residual)
			const Card = styled.div({ color: "red" });
			</script>
			<template><Card v-if="active" /></template>"
		`);
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

	test("preserves a Pandwind class binding for an unknown custom component", () => {
		const source =
			'import { createUnsafeCss } from "pandwind/unsafe/css";\n' +
			"const css = createUnsafeCss();\n" +
			'const card = css.class({ color: "red" });\n' +
			"export const App = () => <CustomCard className={card} />;";
		const result = migrate(source, CodemodAdapterId.Pandwind, CodemodAdapterId.Mui);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "host-framework" })]),
		);
		expect(result.code.replace(/^\/\/ pandwind:migrate-skip[^\r\n]*\r?\n/gmu, "")).toBe(source);
		expect(result.code).toContain("className={card}");
		expect(result.code).not.toContain("sx={card}");
		expect(result.code).toContain('import { createUnsafeCss } from "pandwind/unsafe/css";');
		expect(result.code).toContain("css.class");
		expect(result.outcomes).toMatchObject([{ outcome: "residual", representation: "static" }]);
	});

	test("uses a portable static artifact for a standalone MUI style value", () => {
		const result = migrate(
			'import { createUnsafeCss } from "pandwind/unsafe/css";\n' +
				"const css = createUnsafeCss();\n" +
				'const card = css.class({ color: "red" });',
			CodemodAdapterId.Pandwind,
			CodemodAdapterId.Mui,
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { createUnsafeCss } from "pandwind/unsafe/css";');
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
			'import { createUnsafeCss } from "pandwind/unsafe/css";\n' +
				"const css = createUnsafeCss();\n" +
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
		expect(result.code).toContain('import { createUnsafeCss } from "pandwind/unsafe/css"');
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
		if (target === CodemodAdapterId.VanillaExtract || target === CodemodAdapterId.Treat) {
			expect(result.converted).toBe(0);
			expect(result.skipped).toBeGreaterThan(0);
			expect(result.residuals).toEqual(
				expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
			);
			expect(result.code).toContain("css.class");
			expect(result.code).toContain("className={card}");
			return;
		}

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

	test("keeps scalar dynamic styled subjects in Next-yak's component template", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div({ color: theme.foreground });\n" +
				"export const App = () => <Card />;",
			{
				from: CodemodAdapterId.StyledComponents,
				to: CodemodAdapterId.NextYak,
				file: "App.tsx",
				mode: "safe",
				readFile: () => undefined,
				adapterRegistry: catalog.registry,
				semantic: { source: { framework: BuiltinHostFramework.React } },
			},
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { styled } from "next-yak";');
		expect(result.code).toContain("styled.div`color: ${theme.foreground};`");
		expect(result.code).toContain("<Card />");
	});
});
