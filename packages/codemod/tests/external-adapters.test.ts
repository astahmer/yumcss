import {
	StyleProgramResidualKindTag,
	StyleValueKindTag,
	SwapResidualKindTag,
} from "../src/swap/semantic-ir.ts";
import { StyleDynamicExpressionKind } from "../src/swap/identifiers.ts";
import { AdapterDependencyKindTag } from "../src/swap/adapter-contract.ts";
import { describe, expect, test } from "vitest";
import {
	ADAPTER_CONTRACT_SCHEMA,
	BuiltinHostFramework,
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createChakraAdapter,
	getCodemodAdapter,
	runAdapterMigration,
} from "../src/swap/index.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";
import {
	createAdapterRouteProject,
	fixtureAdapterRegistry,
	createAdapterRouteSpec,
	routeEvidence,
} from "./route-spec-support.ts";
import { intrinsicTagForSubject } from "../src/swap/host-component-rewriter.ts";

const migrateConfiguredChakra = (source: string, file: string) =>
	createAdapterRouteSpec(CodemodAdapterId.ChakraUi, CodemodAdapterId.YumCSS).runAsync({
		source,
		file,
		project: createAdapterRouteProject(
			CodemodAdapterId.ChakraUi,
			CodemodAdapterId.YumCSS,
			"#2a57c8",
		),
		semantic: { source: { framework: BuiltinHostFramework.React } },
	});

describe("CSS-in-JS adapter contract v2", () => {
	test("registers detection, config, parse, emit, dependencies, and validation for every adapter", () => {
		const samples: Record<string, string> = {
			yumcss: "css.class({ color: 'red' })",
			emotion: "import '@emotion/css'; css({ color: 'red' })",
			"styled-components": "import styled from 'styled-components'; styled.div({ color: 'red' })",
			"vanilla-extract": "import { style } from '@vanilla-extract/css'; style({ color: 'red' })",
			stitches: "import { createStitches } from '@stitches/react'; createStitches()",
			linaria: "import { css } from '@linaria/core'; css`color: red;`",
			jss: "import { createUseStyles } from 'react-jss'; createUseStyles({ button: { color: 'red' } })",
			fela: "import { createRenderer } from 'fela'; renderer.renderRule({ color: 'red' })",
			goober: "import { css } from 'goober'; css({ color: 'red' })",
			aphrodite:
				"import { StyleSheet } from 'aphrodite'; StyleSheet.create({ button: { color: 'red' } })",
			style9: "import style9 from 'style9'; style9.create({ button: { color: 'red' } })",
			treat: "import { style } from './styles.treat'; style({ color: 'red' })",
			compiled: "import { css } from '@compiled/react'; css({ color: 'red' })",
			stylex: "import stylex from '@stylexjs/stylex'; stylex.create({ card: { color: 'red' } })",
			[CodemodAdapterId.ReactStrictDom]:
				'import { css, html } from "react-strict-dom";\n' +
				'const styles = css.create({ card: { color: "red" } });\n' +
				"export const Card = () => <html.div style={styles.card} />;",
			"solid-styled":
				"import { styled } from 'solid-styled-components'; styled.div({ color: 'red' })",
			"vue-styled": "import styled from 'vue-styled-components'; styled.div({ color: 'red' })",
			"authored-css": "body { color: red; }",
			"react-native":
				"import { StyleSheet } from 'react-native'; StyleSheet.create({ button: { color: 'red' } })",
			tamagui: "import { styled } from 'tamagui'; styled('div', { color: 'red' })",
			"css-modules": ".card { color: red; }",
			sass: ".card { color: red; }",
			less: ".card { color: red; }",
			bamboo: "import { css } from 'styled-system/css'; css({ color: 'red' })",
			panda: "import { css } from 'styled-system/css'; css({ color: 'red' })",
			"next-yak": "import { css } from 'next-yak'; css`color: red;`",
			"chakra-ui": "import { Box } from '@chakra-ui/react'; <Box bg='tomato' />",
			mui: "import { Box } from '@mui/material'; <Box sx={{ color: 'red' }} />",
			mantine: "import { Box } from '@mantine/core'; <Box c='red' />",
			tokenami: "import { css } from '@tokenami/css'; css({ '--color': 'red' })",
			tailwind: "<div className='flex p-4' />",
			unocss: '<div className="flex items-center" />',
		};
		for (const adapter of createBuiltinCodemodCatalog().adapters) {
			const id = adapter.id;
			expect(adapter.schema).toBe(ADAPTER_CONTRACT_SCHEMA);
			expect(adapter.version).toBe("2");
			expect(adapter.sourceModules).toBeDefined();
			expect(adapter.dependencies).toBeDefined();
			const file =
				id === CodemodAdapterId.AuthoredCss
					? "styles.css"
					: id === CodemodAdapterId.CssModules
						? "styles.module.css"
						: id === CodemodAdapterId.Sass
							? "styles.scss"
							: id === CodemodAdapterId.Less
								? "styles.less"
								: id === CodemodAdapterId.ReactStrictDom
									? "styles.tsx"
									: "styles.ts";
			const detection = adapter.detect({ file, source: samples[id]! });
			expect(detection, `${id} detection`).toMatchObject({
				matched: true,
			});
			const config = adapter.loadConfig({
				file,
				source: samples[id]!,
				root: "/project",
			});
			expect(config.adapter).toBe(id);
		}
	});

	test("consumes Fela's empty renderRule props argument", () => {
		const result = runAdapterMigration(
			'import { createRenderer } from "fela";\nconst renderer = createRenderer();\nexport const card = renderer.renderRule(() => ({ color: "red" }), {});',
			{
				from: CodemodAdapterId.Fela,
				to: CodemodAdapterId.YumCSS,
				file: "styles.ts",
			},
		);
		expect(result.residuals).toHaveLength(0);
		expect(result.code).toContain('css.class({ color: "red" })');
		expect(result.code).not.toContain(", {});");
	});

	test("loads Chakra's official merged system config through the adapter port", async () => {
		const system = {
			$$chakra: true as const,
			_config: {
				utilities: { color: { values: "colors" } },
				theme: { tokens: { colors: { brand: { "500": { value: "#123456" } } } } },
			},
			properties: new Set(["color"]),
			token: {
				var: (path: string) => `var(--chakra-${path.replaceAll(".", "-")})`,
			},
		};
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				return packageName === "@chakra-ui/react"
					? ({ isValidSystem: (value: unknown) => value === system } as never)
					: undefined;
			},
			async importFile(path) {
				return path === "/project/chakra.config.ts" ? ({ default: system } as never) : undefined;
			},
		};
		const adapter = createChakraAdapter({ moduleLoader: loader });
		const config = await adapter.loadConfigAsync?.({
			file: "App.tsx",
			source: "",
			root: "/project",
			listFiles: () => ["/project/chakra.config.ts"],
		});
		expect(config?.values.chakraConfig).toEqual(system._config);
		expect(config?.values.officialConfigPackage).toBe("@chakra-ui/react");
		expect(config?.colorPalettes).toEqual({ brand: "colors.brand" });
		const source = '<Box color="brand.500" />';
		const parsed = adapter.parse(source, {
			file: "App.tsx",
			source,
			root: "/project",
			config: config!,
		});
		expect(parsed.matches[0]?.program.declarations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					property: "color",
					value: {
						kind: "token",
						ref: "brand.500",
						authored: "brand.500",
						resolved: "#123456",
					},
				}),
			]),
		);
	});

	test("treats Panda's generated object dialect as a bidirectional adapter", () => {
		const catalog = createBuiltinCodemodCatalog();
		const source =
			'import { css } from "styled-system/css";\n' +
			'const card = css({ color: "red", _hover: { color: "blue" } });';
		const toYumCSS = runAdapterMigration(source, {
			from: "panda",
			to: "yumcss",
			file: "Card.tsx",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});
		expect(toYumCSS.converted).toBe(1);
		expect(toYumCSS.skipped).toBe(0);
		expect(toYumCSS.residuals).toEqual([]);
		expect(toYumCSS.code).toContain("css.class");
		expect(toYumCSS.code).toContain("_hover");
		expect(toYumCSS.code).not.toContain("&:hover");

		const toPanda = runAdapterMigration(toYumCSS.code, {
			from: "yumcss",
			to: "panda",
			file: "Card.tsx",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});
		expect(toPanda.converted).toBe(1);
		expect(toPanda.skipped).toBe(0);
		expect(toPanda.residuals).toEqual([]);
		expect(toPanda.code).toContain('import { css } from "styled-system/css";');
		expect(toPanda.code).toContain("css({");

		const dynamicPalette = runAdapterMigration(
			'import { css } from "styled-system/css";\nconst card = css({ colorPalette: palette });',
			{
				from: "panda",
				to: "yumcss",
				file: "Palette.tsx",
				mode: "safe",
				adapterRegistry: catalog.registry,
			},
		);
		expect(dynamicPalette.skipped).toBe(1);
		expect(dynamicPalette.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "dynamic",
					hint: "colorPalette requires a statically known value for this target",
				}),
			]),
		);
		expect(dynamicPalette.code).toContain("colorPalette: palette");
		expect(dynamicPalette.code).not.toContain("css.vars");

		const conditionalPalette = runAdapterMigration(
			'import { css } from "styled-system/css";\n' +
				'const card = css({ colorPalette: enabled ? "blue" : "red" });',
			{
				from: "panda",
				to: "yumcss",
				file: "ConditionalPalette.tsx",
				mode: "safe",
				adapterRegistry: catalog.registry,
			},
		);
		expect(conditionalPalette.skipped).toBe(0);
		expect(conditionalPalette.residuals).toEqual([]);
		expect(conditionalPalette.code).toContain("css.class");
		expect(conditionalPalette.code).toContain('colorPalette: enabled ? "blue" : "red"');
		expect(conditionalPalette.code).not.toContain("css.vars");
	});

	test("reports unsupported Panda stylesheet rules by semantic kind", () => {
		const catalog = createBuiltinCodemodCatalog();
		const result = runAdapterMigration(
			'import { global } from "@emotion/react";\nglobal({ body: { color: "red" } })',
			{
				from: "emotion",
				to: "panda",
				file: "Global.tsx",
				mode: "safe",
				adapterRegistry: catalog.registry,
			},
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "capability",
					hint: expect.stringContaining("global-rules"),
				}),
			]),
		);
		expect(result.code).toContain('global({ body: { color: "red" } })');
		expect(result.code).not.toContain("adapter capability mismatch");
	});

	test("projects Tailwind classes through the semantic boundary in both directions", () => {
		const catalog = createBuiltinCodemodCatalog();
		const toYumCSS = runAdapterMigration(
			'export const Card = () => <div className="[display:flex] [padding:1rem]" />;',
			{
				from: "tailwind",
				to: "yumcss",
				file: "Card.tsx",
				mode: "safe",
				adapterRegistry: catalog.registry,
			},
		);
		expect(toYumCSS.converted).toBe(1);
		expect(toYumCSS.skipped).toBe(0);
		expect(toYumCSS.residuals).toEqual([]);
		expect(toYumCSS.code).toContain("css.class");
		expect(toYumCSS.code).toContain("className={");

		const toTailwind = runAdapterMigration(
			'import { createUnsafeCss } from "yumcss/unsafe/css";\n' +
				"const css = createUnsafeCss();\n" +
				'export const card = css.class({ display: "flex", padding: "1rem" });',
			{
				from: "yumcss",
				to: "tailwind",
				file: "Card.tsx",
				mode: "safe",
				adapterRegistry: catalog.registry,
			},
		);
		expect(toTailwind.converted).toBe(1);
		expect(toTailwind.skipped).toBe(0);
		expect(toTailwind.residuals).toEqual([]);
		expect(toTailwind.code).toContain("[display:flex] [padding:1rem]");
	});

	test("normalizes Emotion numeric declarations to their authored CSS units", () => {
		const source =
			'import { css } from "@emotion/css";\n' +
			"const card = css({ padding: 2, opacity: 0.5, lineHeight: 1.2, '--offset': 2, margin: 0 });";
		const adapter = getCodemodAdapter(CodemodAdapterId.Emotion)!;
		const parsed = adapter.parse(source, {
			file: "Card.tsx",
			source,
			config: { adapter: CodemodAdapterId.Emotion, files: [], values: {} },
		});
		const declarations = parsed.matches[0]?.program.declarations ?? [];
		const values = declarations.map(({ property, value }) => ({
			property,
			value: value.kind === StyleValueKindTag.Literal ? value.value : value.kind,
		}));

		expect(parsed.matches).toHaveLength(1);
		expect(parsed.residuals).toEqual([]);
		expect(values).toMatchInlineSnapshot(`
			[
			  {
			    "property": "padding",
			    "value": "2px",
			  },
			  {
			    "property": "opacity",
			    "value": 0.5,
			  },
			  {
			    "property": "lineHeight",
			    "value": 1.2,
			  },
			  {
			    "property": "--offset",
			    "value": 2,
			  },
			  {
			    "property": "margin",
			    "value": 0,
			  },
			]
		`);

		const migration = runAdapterMigration(source, {
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.YumCSS,
			file: "Card.tsx",
			mode: "safe",
		});
		expect(migration.converted).toBe(1);
		expect(migration.skipped).toBe(0);
		expect(migration.residuals).toEqual([]);
		expect(migration.validations.every((validation) => validation.valid)).toBe(true);
		expect(migration.code).toContain('padding: "2px"');
	});

	test("preserves Vanilla Extract numeric CSS lengths through Emotion", () => {
		const source =
			'import { style } from "@vanilla-extract/css";\n' +
			"export const card = style({ padding: 2, opacity: 0.5 });";
		const adapter = getCodemodAdapter(CodemodAdapterId.VanillaExtract)!;
		const parsed = adapter.parse(source, {
			file: "styles.css.ts",
			source,
			config: { adapter: CodemodAdapterId.VanillaExtract, files: [], values: {} },
			targetId: CodemodAdapterId.Emotion,
		});
		const values = parsed.matches[0]?.program.rules.flatMap((rule) =>
			rule.declarations.map(({ property, value }) => ({
				property,
				value: value.kind === StyleValueKindTag.Literal ? value.value : value.kind,
			})),
		);

		expect(parsed.matches).toHaveLength(1);
		expect(parsed.residuals).toEqual([]);
		expect(values).toMatchInlineSnapshot(`
			[
			  {
			    "property": "padding",
			    "value": "2px",
			  },
			  {
			    "property": "opacity",
			    "value": 0.5,
			  },
			]
		`);

		const migration = runAdapterMigration(source, {
			from: CodemodAdapterId.VanillaExtract,
			to: CodemodAdapterId.Emotion,
			file: "styles.css.ts",
			mode: "safe",
		});
		expect(migration.converted).toBe(1);
		expect(migration.skipped).toBe(0);
		expect(migration.residuals).toEqual([]);
		expect(migration.validations.every((validation) => validation.valid)).toBe(true);
		expect(migration.code).toContain('padding: "2px"');
	});

	test("normalizes CSS object numeric lengths from Aphrodite, Compiled, and Treat", () => {
		const cases = [
			{
				adapter: CodemodAdapterId.Aphrodite,
				file: "styles.ts",
				source:
					'import { StyleSheet } from "aphrodite";\n' +
					"export const styles = StyleSheet.create({ card: { padding: 2, lineHeight: 1.2, opacity: 0.5 } });",
			},
			{
				adapter: CodemodAdapterId.Compiled,
				file: "Card.tsx",
				source:
					'import { css } from "@compiled/react";\n' +
					"export const card = css({ padding: 2, lineHeight: 1.2, opacity: 0.5 });",
			},
			{
				adapter: CodemodAdapterId.Treat,
				file: "styles.treat.ts",
				source:
					'import { style } from "treat";\n' +
					"export const card = style({ padding: 2, lineHeight: 1.2, opacity: 0.5 });",
			},
		] as const;
		const projections = cases.map(({ adapter: adapterId, file, source }) => {
			const adapter = getCodemodAdapter(adapterId)!;
			const parsed = adapter.parse(source, {
				file,
				source,
				config: { adapter: adapterId, files: [], values: {} },
				targetId: CodemodAdapterId.Emotion,
			});
			const declarations = parsed.matches.flatMap(({ program }) =>
				program.rules.length > 0
					? program.rules.flatMap((rule) => rule.declarations)
					: program.declarations,
			);
			const values = declarations.map(({ property, value }) => ({
				property,
				value: value.kind === StyleValueKindTag.Literal ? value.value : value.kind,
			}));

			expect(parsed.matches).toHaveLength(1);
			expect(parsed.residuals).toEqual([]);
			expect(values).toEqual([
				{ property: "padding", value: "2px" },
				{ property: "lineHeight", value: 1.2 },
				{ property: "opacity", value: 0.5 },
			]);

			const migration = runAdapterMigration(source, {
				from: adapterId,
				to: CodemodAdapterId.Emotion,
				file,
				mode: "safe",
			});
			expect(migration.converted).toBe(1);
			expect(migration.skipped).toBe(0);
			expect(migration.residuals).toEqual([]);
			expect(migration.validations).toHaveLength(1);
			expect(migration.validations.every((validation) => validation.valid)).toBe(true);
			return { adapter: adapterId, values };
		});

		expect(projections).toMatchInlineSnapshot(`
			[
			  {
			    "adapter": "aphrodite",
			    "values": [
			      {
			        "property": "padding",
			        "value": "2px",
			      },
			      {
			        "property": "lineHeight",
			        "value": 1.2,
			      },
			      {
			        "property": "opacity",
			        "value": 0.5,
			      },
			    ],
			  },
			  {
			    "adapter": "compiled",
			    "values": [
			      {
			        "property": "padding",
			        "value": "2px",
			      },
			      {
			        "property": "lineHeight",
			        "value": 1.2,
			      },
			      {
			        "property": "opacity",
			        "value": 0.5,
			      },
			    ],
			  },
			  {
			    "adapter": "treat",
			    "values": [
			      {
			        "property": "padding",
			        "value": "2px",
			      },
			      {
			        "property": "lineHeight",
			        "value": 1.2,
			      },
			      {
			        "property": "opacity",
			        "value": 0.5,
			      },
			    ],
			  },
			]
		`);
	});

	test("lowers React Native density-independent lengths to web CSS pixels", () => {
		const source =
			'import { StyleSheet } from "react-native";\n' +
			"export const styles = StyleSheet.create({ card: { padding: 2, lineHeight: 20, opacity: 0.5 } });";
		const adapter = getCodemodAdapter(CodemodAdapterId.ReactNative)!;
		const parsed = adapter.parse(source, {
			file: "Card.tsx",
			source,
			config: { adapter: CodemodAdapterId.ReactNative, files: [], values: {} },
			targetId: CodemodAdapterId.Emotion,
		});
		const values = parsed.matches[0]?.program.rules.flatMap((rule) =>
			rule.declarations.map(({ property, value }) => ({
				property,
				value: value.kind === StyleValueKindTag.Literal ? value.value : value.kind,
			})),
		);

		expect(parsed.matches).toHaveLength(1);
		expect(parsed.residuals).toEqual([]);
		expect(values).toMatchInlineSnapshot(`
			[
			  {
			    "property": "padding",
			    "value": "2px",
			  },
			  {
			    "property": "lineHeight",
			    "value": "20px",
			  },
			  {
			    "property": "opacity",
			    "value": 0.5,
			  },
			]
		`);

		const migration = runAdapterMigration(source, {
			from: CodemodAdapterId.ReactNative,
			to: CodemodAdapterId.Emotion,
			file: "Card.tsx",
			mode: "safe",
		});
		expect(migration.converted).toBe(1);
		expect(migration.skipped).toBe(0);
		expect(migration.residuals).toEqual([]);
		expect(migration.validations.every((validation) => validation.valid)).toBe(true);
		expect(migration.code).toContain('padding: "2px"');
		expect(migration.code).toContain('lineHeight: "20px"');

		const reverse = runAdapterMigration(migration.code, {
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.ReactNative,
			file: "Card.tsx",
			mode: "safe",
		});
		expect(reverse.converted).toBe(1);
		expect(reverse.skipped).toBe(0);
		expect(reverse.residuals).toEqual([]);
		expect(reverse.validations.every((validation) => validation.valid)).toBe(true);
		expect(reverse.code).toContain('"padding": 2');
		expect(reverse.code).toContain('"lineHeight": 20');
	});

	test("keeps an unknown Tailwind utility source-preserving", () => {
		const catalog = createBuiltinCodemodCatalog();
		const result = runAdapterMigration('<div className="project-only-utility" />', {
			from: "tailwind",
			to: "yumcss",
			file: "Card.tsx",
			mode: "safe",
			adapterRegistry: catalog.registry,
		});
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "unknown-utility" })]),
		);
		expect(result.code).toContain("project-only-utility");
	});

	test("never turns an unresolved semantic residual into an empty partial conversion", () => {
		const catalog = createBuiltinCodemodCatalog();
		const result = runAdapterMigration('<div className="project-only-utility" />', {
			from: "tailwind",
			to: "yumcss",
			file: "Card.tsx",
			mode: "partial",
			adapterRegistry: catalog.registry,
		});
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.code).toContain("project-only-utility");
		expect(result.code).toContain("parse-residual");
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "unknown-utility" })]),
		);
	});

	test("detects Emotion automatic JSX css props from project configuration", () => {
		const emotion = getCodemodAdapter("emotion")!;
		const detection = emotion.detect({
			file: "/project/site/components/Container.tsx",
			root: "/project",
			source: 'export const Container = () => <div css={{ color: "red" }} />;',
			readFile: (file) =>
				file === "/project/site/.babelrc.js"
					? "module.exports = { presets: [], plugins: [], importSource: '@emotion/react' }"
					: undefined,
		});
		expect(detection).toMatchObject({ matched: true, confidence: 0.95 });
		expect(detection.evidence).toContain("config:/project/site/.babelrc.js");
	});

	test("resolves imported static media keys for automatic Emotion css props", () => {
		const result = runAdapterMigration(
			'import { mediaQueries } from "../util";\n' +
				'export const Container = () => <div css={{ margin: "0 auto", [mediaQueries.mdUp]: { maxWidth: 1132 } }} />;',
			{
				from: "emotion",
				to: "yumcss",
				file: "components/Container.tsx",
				root: "/project/site",
				mode: "safe",
				readFile: (file) => {
					if (file === "/project/site/.babelrc.js") return "importSource: '@emotion/react'";
					if (file === "/project/site/util.ts")
						return 'export const mediaQueries = { mdUp: "@media (min-width: 768px)" };';
					return undefined;
				},
			},
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"@media (min-width: 768px)"');
	});

	test("inlines imported Emotion theme constants through re-export barrels", () => {
		const result = runAdapterMigration(
			'import { colors } from "../util";\n' +
				"export const Card = () => <div css={{ color: colors.pink, border: `1px solid ${colors.grayBorder}` }} />;",
			{
				from: "emotion",
				to: "yumcss",
				file: "components/Card.tsx",
				root: "/project/site",
				mode: "safe",
				readFile: (file) => {
					if (file === "/project/site/.babelrc.js") return "importSource: '@emotion/react'";
					if (file === "/project/site/util.ts") return "export * from './style-constants';";
					if (file === "/project/site/style-constants.ts")
						return 'export const colors = { pink: "#D26AC2", grayBorder: "#d2d2d2" };';
					return undefined;
				},
			},
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('color: "#D26AC2"');
		expect(result.code).toContain('border: "1px solid #d2d2d2"');
	});

	test("removes static Emotion Global host usage after target extraction", () => {
		const result = runAdapterMigration(
			'import { Global, css } from "@emotion/react";\n' +
				'const globalCss = css({ a: { color: "red" } });\n' +
				"export const GlobalStyles = () => <Global styles={globalCss} />;",
			{ from: "emotion", to: "yumcss", file: "GlobalStyles.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("<></>");
		expect(result.code).not.toContain("<Global");
		expect(result.code).not.toContain("@emotion/react");
	});

	test("migrates Bamboo object styles with conditions", () => {
		const result = runAdapterMigration(
			'import { css } from "styled-system/css";\nconst button = css({ color: "red", "&:hover": { color: "blue" }, "@media (min-width: 40rem)": { color: "green" } });',
			{ from: "bamboo", to: "emotion", file: "Button.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { css } from "@emotion/css";');
		expect(result.code).toContain('"&:hover"');
		expect(result.code).toContain('"@media (min-width: 40rem)"');
	});

	test("migrates Next-yak css and styled template lanes", () => {
		const css = runAdapterMigration(
			'import { css } from "next-yak";\nconst card = css`color: red; &:hover { color: blue; }`;',
			{ from: "next-yak", to: "emotion", file: "Card.tsx", mode: "safe" },
		);
		expect(css.converted).toBe(1);
		expect(css.skipped).toBe(0);
		expect(css.code).toContain('css({ color: "red"');
		expect(css.code).toContain('"&:hover"');

		const component = runAdapterMigration(
			'import { styled } from "next-yak";\nconst Card = styled.button`color: red;`;',
			{ from: "next-yak", to: "styled-components", file: "Card.tsx", mode: "safe" },
		);
		expect(component.converted).toBe(1);
		expect(component.skipped).toBe(0);
		expect(component.code).toContain("styled.button({");
	});

	test("reports Next-yak runtime interpolations instead of dropping them", () => {
		const result = runAdapterMigration(
			'import { styled } from "next-yak";\nconst Card = styled.button`color: ${({ theme }) => theme.color};`;',
			{ from: "next-yak", to: "emotion", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals.some((residual) => residual.kind === SwapResidualKindTag.Dynamic)).toBe(
			true,
		);
	});

	test("lowers named style maps to target class maps when the target owns that strategy", () => {
		const result = runAdapterMigration(
			'import { createUseStyles } from "react-jss";\n' +
				"const useStyles = createUseStyles({ button: { color: 'red' } });",
			{
				from: "jss",
				to: "emotion",
				file: "styles.ts",
				mode: "safe",
			},
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('{ "button": css({ color: "red" }) }');
	});

	test("lowers Next-yak JSX css hosts with dynamic nested rules through the runtime fallback", () => {
		const result = runAdapterMigration(
			'import { css } from "next-yak";\n' +
				'const desktop = "@media (min-width: 992px)";\n' +
				'const variant = "primary";\n' +
				'const App = () => <button css={css`color: red; ${desktop} { font-size: 14px; } ${() => variant === "primary" && css`color: blue;`}`}/>;',
			{
				from: "next-yak",
				to: "yumcss",
				file: "App.tsx",
				mode: "safe",
				semantic: { source: { file: "App.tsx", framework: "react" } },
			},
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { createRuntimeCss } from "yumcss/css/runtime";');
		expect(result.code).toContain("runtimeCss.sheet.register");
		expect(result.code).toContain("className=");
		expect(result.code).not.toContain('from "next-yak"');
	});

	test("migrates Linaria static CSS templates and preserves styled subjects", () => {
		const css = runAdapterMigration(
			'import { css } from "@linaria/core";\nconst card = css`color: red; background-color: blue;`;',
			{ from: "linaria", to: "emotion", file: "Card.tsx", mode: "safe" },
		);
		expect(css.converted).toBe(1);
		expect(css.code).toContain('css({ color: "red", backgroundColor: "blue" })');
		expect(css.code).not.toContain("@linaria/core");

		const component = runAdapterMigration(
			'import { styled } from "@linaria/react";\nconst Card = styled.button`color: red;`;',
			{ from: "linaria", to: "styled-components", file: "Card.tsx", mode: "safe" },
		);
		expect(component.converted).toBe(1);
		expect(component.code).toContain("styled.button({");
	});

	test("keeps StyleX ancestor conditions attached to the styled element", () => {
		const result = runAdapterMigration(
			'import * as stylex from "@stylexjs/stylex";\n' +
				"const styles = stylex.create({ code: { paddingBlock: { default: 3, [stylex.when.ancestor(':where(pre)')]: 8 } } });",
			{ from: "stylex", to: "yumcss", file: "mdx.tsx", mode: "safe" },
		);

		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.validations[0]?.valid).toBe(true);
		expect(result.code).toContain('":where(.pw-default-marker:where(pre) *) &"');
	});

	test("preserves styled component subjects when targeting Emotion", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\nexport default styled.div({ color: "red" });',
			{ from: "styled-components", to: "emotion", file: "View.js", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import styled from "@emotion/styled";');
		expect(result.code).toContain('styled.div({ color: "red" })');
		expect(result.code).not.toContain('from "styled-components"');
	});

	test("parses and lowers function-valued styled subjects through the shared call parser", () => {
		const source =
			'import styled from "styled-components";\n' +
			"const Card = styled.div((props) => ({ color: props.color, padding: '1rem' }));";
		const parsed = getCodemodAdapter("styled-components")!.parse(source, {
			file: "Card.tsx",
			source,
			config: { adapter: "styled-components", files: [], values: {} },
		});
		expect(parsed.residuals).toEqual([]);
		expect(parsed.matches).toHaveLength(1);
		expect(parsed.matches[0]?.program.source).toMatchObject({
			pattern: "styled-function",
			subject: "styled.div",
		});
		expect(parsed.matches[0]?.program.declarations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					property: "color",
					value: expect.objectContaining({ kind: "dynamic" }),
				}),
			]),
		);

		const result = runAdapterMigration(source, {
			from: "styled-components",
			to: "emotion",
			file: "Card.tsx",
			mode: "safe",
		});
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("styled.div({");
		expect(result.code).toContain("props.color");
	});

	test("preserves an unbalanced function style as a parse residual", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\nconst Card = styled.div((props) => ({ color: props.color });',
			{ from: "styled-components", to: "emotion", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "parse" })]),
		);
		expect(result.code).toContain("styled.div");
	});

	test("wraps a standalone styled intrinsic default export for React", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\nexport default styled.div({ color: "red" });',
			{
				from: "styled-components",
				to: "yumcss",
				file: "View.tsx",
				mode: "safe",
				semantic: { source: { file: "View.js", framework: "react" } },
			},
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('__yumcssForwardRef<React.ComponentRef<"div">');
		expect(result.code).toContain("ref={ref}");
		expect(result.code).toContain(
			"runtimeCss.props(style, attrs.className, props.className).className",
		);
		expect(result.code).toMatchInlineSnapshot(`
			"import { forwardRef as __yumcssForwardRef } from "react";
			import { createRuntimeCss } from "yumcss/css/runtime";
			import { defaultPreset } from "yumcss/preset/default";
			import type * as React from "react";
			const runtimeCss = createRuntimeCss(defaultPreset);
			export default __yumcssForwardRef<React.ComponentRef<"div">, { readonly as?: React.ElementType; readonly className?: string; readonly style?: React.CSSProperties; readonly children?: React.ReactNode; readonly [key: string]: unknown }>((props: { readonly as?: React.ElementType; readonly className?: string; readonly style?: React.CSSProperties; readonly children?: React.ReactNode; readonly [key: string]: unknown }, ref) => { const style = runtimeCss.vars({ color: "red" }); const attrs = {}; const ResolvedComponent = attrs.as ?? props.as ?? "div"; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = Object.fromEntries([...Object.entries(rest), ...Object.entries(attrsProps)].filter(([key]) => !key.startsWith("$"))); return <ResolvedComponent {...forwarded} ref={ref} className={runtimeCss.props(style, attrs.className, props.className).className} style={{ ...props.style, ...style.style, ...attrs.style }} />; });"
		`);
		expect(result.code).not.toContain('from "yumcss/cx"');
		expect(result.code).not.toContain('from "styled-components"');
	});

	test("registers JSS style maps and keeps their named-rule boundary explicit", () => {
		const adapter = getCodemodAdapter("jss")!;
		const parsed = adapter.parse("createUseStyles({ button: { color: 'red' } })", {
			file: "styles.ts",
			source: "",
			config: { adapter: "jss", files: [], values: {} },
		});
		expect(parsed.matches).toHaveLength(1);
		expect(parsed.matches[0]?.program.declarations).toEqual([]);
		expect(parsed.matches[0]?.program.rules).toEqual(
			expect.arrayContaining([expect.objectContaining({ name: "button", kind: "style" })]),
		);
		const emitted = adapter.emit(parsed.matches[0]!.program, {
			file: "styles.ts",
			config: { adapter: "jss", files: [], values: {} },
			mode: "safe",
			index: 0,
		});
		expect(emitted.text).toContain("createUseStyles({");

		const result = runAdapterMigration(
			'import { createUseStyles } from "react-jss";\nconst useStyles = createUseStyles({ button: { color: "red" } });',
			{ from: "jss", to: "yumcss", file: "styles.ts", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('const useStyles = { "button": css.class({ color: "red" }) };');
	});

	test("projects JSS attached sheet class maps into direct YumCSS classes", () => {
		const result = runAdapterMigration(
			'import jss from "jss";\n' +
				'const sheet = jss.createStyleSheet({ button: { color: "red" } }).attach();\n' +
				"export const view = <button className={sheet.classes.button} />;",
			{ from: "jss", to: "yumcss", file: "styles.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('const sheet = { "button": css.class({ color: "red" }) };');
		expect(result.code).toContain("className={sheet.button}");
		expect(result.code).not.toContain(".attach()");
		expect(result.code).not.toContain(".classes");
	});

	test("lowers Aphrodite font-face arrays into runtime semantic rules", () => {
		const result = runAdapterMigration(
			'import { StyleSheet } from "aphrodite";\n' +
				"const styles = StyleSheet.create({ fonts: { fontFamily: [{ fontFamily: 'Inter', src: 'url(inter.woff2)' }] } });",
			{ from: "aphrodite", to: "yumcss", file: "fonts.js", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("registerSemanticRules");
		expect(result.code).toContain('kind: "font-face"');
		expect(result.code).toContain('property: "fontFamily"');
	});

	test("projects Aphrodite css calls onto lowered class maps", () => {
		const result = runAdapterMigration(
			'import { StyleSheet, css } from "aphrodite";\n' +
				'const styles = StyleSheet.create({ button: { color: "red" } });\n' +
				"export const view = <button className={css(styles.button)} />;",
			{ from: "aphrodite", to: "yumcss", file: "styles.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("className={styles.button}");
		expect(result.code).not.toContain("css(styles.button)");
	});

	test("migrates an Emotion object into styled-components with selectors and dynamics", () => {
		const source = `import { css } from "@emotion/css";\nconst card = css({ color: theme.foreground, "&:hover": { color: "red" } });`;
		const result = runAdapterMigration(source, {
			from: "emotion",
			to: "styled-components",
			file: "Card.tsx",
			mode: "safe",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.code).toContain('import styled from "styled-components";');
		expect(result.code).toContain("styled.div({");
		expect(result.code).toContain("theme.foreground");
		expect(result.code).toContain('"&:hover"');
		expect(result.reports[0]?.convertible).toBe(true);
		expect(result.validations[0]?.valid).toBe(true);
		expect(result.validations[0]?.lossiness).toBe("lossless");
	});

	test("preserves styled subjects and validates authored keyframe names", () => {
		const styled = runAdapterMigration(
			`import styled, { keyframes } from "styled-components";\nconst Card = styled(BaseButton)({ color: "red" });\nconst fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });`,
			{ from: "styled-components", to: "styled-components", file: "Card.tsx", mode: "safe" },
		);
		expect(styled.code).toContain("styled(BaseButton)({");
		expect(styled.validations.every((validation) => validation.valid)).toBe(true);

		const keyframes = runAdapterMigration(
			`import { keyframes } from "@emotion/css";\nconst fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });`,
			{ from: "emotion", to: "styled-components", file: "animation.ts", mode: "safe" },
		);
		expect(keyframes.validations[0]?.valid).toBe(true);
		expect(keyframes.code).toContain("keyframes({");
	});

	test("treats same-adapter migration as an identity operation", () => {
		const source =
			'import { styled } from "solid-styled-components";\n' +
			"const Card = styled.div`color: red;`;";
		const result = runAdapterMigration(source, {
			from: "solid-styled",
			to: "solid-styled",
			file: "Card.tsx",
			mode: "safe",
		});
		expect(result.code).toBe(source);
		expect(result.changed).toBe(false);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
	});

	test("lowers solid-styled prop callbacks with TS return annotations", () => {
		// Source: solidjs/solid-styled-components test/test.spec.tsx — each
		// interpolation destructures its own props with a TS return type.
		const source =
			'import { styled } from "solid-styled-components";\n' +
			'const Div = styled("div")<{ bold: boolean; border: number; color: string }>`\n' +
			"  color: steelblue;\n" +
			'  border: ${({ border = 1, color = "gainsboro" }): string => `${border}px solid ${color}`};\n' +
			'  font-weight: ${({ bold = false }): string | number => (bold ? "bold" : 100)};\n' +
			"`;\n" +
			'export const App = () => <Div bold={true} border={1} color="whitesmoke" />;';
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.SolidStyled,
			to: CodemodAdapterId.YumCSS,
			file: "Div.tsx",
			mode: "safe",
		});
		expect(result.residuals).toEqual([]);
		expect(result.converted).toBe(1);
		expect(result.code).not.toContain("solid-styled-components");
		expect(result.validations.every((validation) => validation.valid)).toBe(true);
		expect(result.code).toContain('import { Dynamic } from "solid-js/web";');
		expect(result.code).toMatchInlineSnapshot(`
			"import { Dynamic } from "solid-js/web";
			import { createRuntimeCss } from "yumcss/css/runtime";
			import { defaultPreset } from "yumcss/preset/default";
			import type { JSX } from "solid-js";
			const runtimeCss = createRuntimeCss(defaultPreset);
			const Div = (props: { readonly as?: string | ((props: Record<string, unknown>) => JSX.Element); readonly class?: string; readonly style?: JSX.CSSProperties; readonly children?: JSX.Element; readonly [key: string]: unknown }) => { const style = runtimeCss.vars({ color: "steelblue", border: (({ border = 1, color = "gainsboro" }) => \`\${border}px solid \${color}\`)(props), fontWeight: (({ bold = false }) => (bold ? "bold" : 100))(props) }); const attrs = {}; const ResolvedComponent = attrs.as ?? props.as ?? "div"; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = { ...rest, ...attrsProps }; return <Dynamic component={ResolvedComponent} {...forwarded} class={runtimeCss.props(style, attrs.class, props.class).className} style={{ ...props.style, ...style.style, ...attrs.style }} />; };
			export const App = () => <Div bold={true} border={1} color="whitesmoke" />;"
		`);
	});

	test("does not cross statement boundaries when pairing tagged-template calls", () => {
		// Shape from the goober reference corpus: an object-form call whose
		// statement ends before any backtick appears, plus an unrelated later
		// template. Neither parser may swallow the other's payload.
		const adapter = getCodemodAdapter("goober")!;
		const source = [
			'import { css } from "goober";',
			'const btn = css({ color: "red" });',
			"const title = css`",
			"  font-size: 12px;",
			"`;",
		].join("\n");
		const parsed = adapter.parse(source, {
			file: "app.tsx",
			source,
			config: { adapter: "goober", files: [], values: {} },
		});
		expect(parsed.matches.map((match) => match.sourceText)).toEqual([
			'css({ color: "red" })',
			"css`\n  font-size: 12px;\n`",
		]);
		expect(parsed.residuals).toEqual([]);
		expect(parsed.matches.flatMap((match) => match.program.residuals)).toEqual([]);
	});

	test("keeps a function-valued template residual scoped to the interpolation", () => {
		const adapter = getCodemodAdapter("goober")!;
		const source = [
			'import { css } from "goober";',
			"const btn = css`color: red;`;",
			"const themed = css`color: ${({ theme }): string => theme.fg};`;",
		].join("\n");
		const parsed = adapter.parse(source, {
			file: "app.tsx",
			source,
			config: { adapter: "goober", files: [], values: {} },
		});
		const dyn = parsed.matches
			.flatMap((match) => match.program.residuals)
			.find((residual) => residual.kind === StyleProgramResidualKindTag.Dynamic);
		expect(dyn?.text).toBe("${({ theme }): string => theme.fg}");
	});

	test("emits a self-contained yumcss runtime binding and consolidates imports", () => {
		const result = runAdapterMigration(
			`import { css, keyframes } from "@emotion/css";\nconst card = css({ color: "red" });\nconst fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });`,
			{ from: "emotion", to: "yumcss", file: "styles.ts", mode: "safe" },
		);
		expect(result.code).not.toContain("@emotion/css");
		expect(result.code).toContain('import { createRuntimeCss } from "yumcss/css/runtime";');
		expect(result.code).toContain("const runtimeCss = createRuntimeCss(defaultPreset);");
		expect(result.code).toContain('runtimeCss.sheet.registerSemanticRules([{ kind: "keyframes"');
		expect(result.code).toContain('{ kind: "style", selector: "from"');
	});

	test("preserves global rule semantics through the runtime sheet boundary", () => {
		const result = runAdapterMigration(
			'import { globalCss } from "@stitches/react";\n' +
				"const reset = globalCss({ body: { margin: 0 } });",
			{ from: "stitches", to: "yumcss", file: "globals.ts", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('kind: "global"');
		expect(result.code).toContain('selector: "body"');
		expect(result.code).toContain("createRuntimeCss");
	});

	test("cleans source imports when the module shares a line with migrated code", () => {
		const result = runAdapterMigration(
			`import { css } from "@emotion/css"; const card = css({ color: "red" });`,
			{ from: "emotion", to: "styled-components", file: "styles.ts", mode: "safe" },
		);
		expect(result.code).not.toContain("@emotion/css");
		expect(result.code).toContain('import styled from "styled-components";');
	});

	test("preserves styled component semantics when lowering to Emotion", () => {
		const result = runAdapterMigration(
			`import styled from "styled-components"; const Card = styled.button({ color: "red" });`,
			{ from: "styled-components", to: "emotion", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import styled from "@emotion/styled";');
		expect(result.code).toContain("styled.button");
	});

	test("uses MUI's native styled component projection instead of a class string", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "mui", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { styled } from "@mui/system";');
		expect(result.code).toContain('styled("div")({ color: "red" })');
		expect(result.code).toContain("<Card />");
		expect(result.code).not.toContain("className={Card}");
	});

	test("projects a static React styled subject to Solid's styled component host", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red", padding: "1rem" });\n' +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "solid-styled", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { styled } from "solid-styled-components";');
		expect(result.code).toContain('styled("div")(() => ({ "color": "red", "padding": "1rem" }))');
		expect(result.code).toContain("<Card />");
		expect(result.code).not.toContain('from "styled-components"');
	});

	test("keeps free dynamic React styled values source-preserving for Solid", () => {
		const source =
			'import styled from "styled-components";\n' +
			"const Card = styled.div({ color: theme.foreground });\n" +
			'export const App = () => <Card color="red" />;';
		const result = runAdapterMigration(source, {
			from: "styled-components",
			to: "solid-styled",
			file: "Card.tsx",
			mode: "safe",
		});
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "capability" }),
				expect.objectContaining({ kind: "host-framework" }),
			]),
		);
		expect(result.code).toContain('from "styled-components"');
		expect(result.code).toContain("styled.div({ color: theme.foreground })");
		expect(result.code).toContain("yumcss:migrate-skip");
	});

	test("projects a static React styled subject to Vue's styled component host", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red", padding: "1rem" });\n' +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "vue-styled", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import styled from "vue-styled-components";');
		expect(result.code).toContain("styled.div`color: red; padding: 1rem;`");
		expect(result.code).toContain("<Card />");
		expect(result.code).not.toContain('from "styled-components"');
	});

	test("keeps free dynamic React styled values source-preserving for Vue", () => {
		const source =
			'import styled from "styled-components";\n' +
			"const Card = styled.div({ color: theme.foreground });\n" +
			'export const App = () => <Card color="red" />;';
		const result = runAdapterMigration(source, {
			from: "styled-components",
			to: "vue-styled",
			file: "Card.tsx",
			mode: "safe",
		});
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "capability" }),
				expect.objectContaining({ kind: "host-framework" }),
			]),
		);
		expect(result.code).toContain('from "styled-components"');
		expect(result.code).toContain("styled.div({ color: theme.foreground })");
		expect(result.code).toContain("yumcss:migrate-skip");
	});

	test.each([
		[CodemodAdapterId.SolidStyled, 'import { styled } from "solid-styled-components";'],
		[CodemodAdapterId.VueStyled, 'import styled from "vue-styled-components";'],
	] as const)("preserves callback-valued styled subjects for %s", (target, targetImport) => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div((props) => ({ color: props.color }));\n" +
				'export const App = () => <Card color="red" />;',
			{
				from: CodemodAdapterId.StyledComponents,
				to: target,
				file: "Card.tsx",
				mode: "safe",
			},
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(targetImport);
		if (target === CodemodAdapterId.SolidStyled)
			expect(result.code).toContain('styled("div")((props) => ({ "color": props.color }))');
		else
			expect(result.code).toContain(
				'styled("div", { "color": null })`color: ${(props) => props.color};`',
			);
		expect(result.code).toContain('<Card color="red" />');
		expect(result.code).not.toContain('from "styled-components"');
	});

	test.each([
		[
			"next-yak",
			"App.tsx",
			'import { styled } from "next-yak";\nconst Card = styled.div`color: red; padding: 1rem;`;',
			'classAttribute: "className", filteredPropPrefixes: [], attrs: {}, joinClass: cx',
		],
		[
			"solid-styled",
			"App.tsx",
			'import { styled } from "solid-styled-components";\nconst Card = styled.div`color: red; padding: 1rem;`;',
			'classAttribute: "class", filteredPropPrefixes: [], attrs: {}, joinClass: cx',
		],
	] as const)(
		"statically extracts standalone %s subjects for YumCSS",
		(_id, file, source, marker) => {
			const result = runAdapterMigration(source, { from: _id, to: "yumcss", file, mode: "safe" });
			expect(result.converted).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).toContain("css.class");
			expect(result.code).toContain("const __yumcssSlot =");
			expect(result.code).toContain(marker);
			expect(result.code).not.toContain("styled-components");
			expect(result.code).not.toContain("createRuntimeCss");
		},
	);

	test("keeps Vue standalone component imports inside script setup", () => {
		const result = runAdapterMigration(
			"<script setup>\n" +
				'import styled from "vue-styled-components";\n' +
				"const Card = styled.div`color: red; padding: 1rem;`;\n" +
				"</script>",
			{ from: "vue-styled", to: "yumcss", file: "Card.vue", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("defineComponent");
		expect(result.code).toContain('import { createUnsafeCss } from "yumcss/unsafe/css";');
		expect(result.code.indexOf("<script setup>")).toBeLessThan(
			result.code.indexOf('import { defineComponent, h } from "vue";'),
		);
		expect(result.code).not.toMatch(/^import .*vue.*\n<script setup>/);
		expect(result.code).not.toContain("vue-styled-components");
	});

	test("wraps an unused Vue styled subject for a static class target", () => {
		const result = runAdapterMigration(
			"<script setup>\n" +
				'import styled from "vue-styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				"</script>",
			{ from: "vue-styled", to: "goober", file: "Card.vue", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { defineComponent, h } from "vue";');
		expect(result.code).toContain("defineComponent");
		expect(result.code).toContain('h("div"');
		expect(result.code).not.toContain("vue-styled-components");
	});

	test("preserves a bare YumCSS binding when MUI has no sx host", () => {
		const result = runAdapterMigration(
			'import { css } from "yumcss/css";\nconst card = css.class({ color: "red" });',
			{ from: "yumcss", to: "mui", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "host-framework",
					hint: expect.stringContaining("MUI sx output requires a MUI-owned component"),
				}),
			]),
		);
		expect(result.code).toContain("yumcss:migrate-skip");
		expect(result.code).toContain('css.class({ color: "red" })');
	});

	test("projects a YumCSS class binding onto MUI's sx host prop", () => {
		const result = runAdapterMigration(
			'import { Box } from "@mui/material";\n' +
				'import { css } from "yumcss/css";\n' +
				'const card = css.class({ color: "red" });\n' +
				"export const App = () => <Box className={card} />;",
			{ from: "yumcss", to: "mui", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('const card = { color: "red" }');
		expect(result.code).toContain("<Box sx={card} />");
		expect(result.code).not.toContain("className={card}");
		expect(result.code).not.toContain('from "yumcss/css"');
	});

	test("does not project a Solid host onto MUI's React-only sx contract", () => {
		const result = runAdapterMigration(
			'import { createSignal } from "solid-js";\n' +
				'import { css } from "yumcss/css";\n' +
				'const card = css.class({ color: "red" });\n' +
				"export const App = () => <Box class={card} />;",
			{ from: "yumcss", to: "mui", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "host-framework",
					hint: expect.stringContaining("MUI-owned component"),
				}),
			]),
		);
		expect(result.code).toContain("yumcss:migrate-skip");
		expect(result.code).toContain('from "yumcss/css"');
	});

	test.each(["stitches"] as const)(
		"keeps component-valued target %s out of className projections",
		(target) => {
			const result = runAdapterMigration(
				'import styled from "styled-components";\n' +
					'const Card = styled.div({ color: "red" });\n' +
					"export const App = () => <Card />;",
				{ from: "styled-components", to: target, file: "Card.tsx", mode: "safe" },
			);
			expect(result.converted).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).toContain("<Card />");
			expect(result.code).not.toContain("className={Card}");
		},
	);

	test("projects an intrinsic styled subject into a StyleX host", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "stylex", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(
			'const __CardStyle = stylex.create({ style: { color: "red" } }).style',
		);
		expect(result.code).toContain("const Card = (props) =>");
		expect(result.code).toContain("stylex.props(__CardStyle)");
		expect(result.code).toContain("props.className");
		expect(result.code).toContain("<Card />");
		expect(result.code).not.toContain("styled-components");
	});

	test.each(["bamboo", "tailwind", "unocss"] as const)(
		"lowers a discarded static styled subject to the target class carrier for %s",
		(target) => {
			const result = runAdapterMigration(
				'import styled from "styled-components"; styled.div({ color: "red" });',
				{
					from: "styled-components",
					to: target,
					file: "styles.tsx",
					mode: "safe",
					adapterRegistry: fixtureAdapterRegistry,
				},
			);
			expect(result.converted).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).not.toContain("yumcss:migrate-skip");
			expect(result.code).not.toContain('from "styled-components"');
		},
	);

	test("uses the shared static custom-property carrier for Bamboo theme values", () => {
		const result = runAdapterMigration(
			'import { css } from "yumcss/css";\n' +
				"const card = css.class({ color: theme.foreground });\n" +
				"export const App = () => <Box className={card} />;",
			{ from: "yumcss", to: "bamboo", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("var(--yumcss-dynamic-");
		expect(result.code).toContain("String(theme.foreground)");
	});

	test("preserves a function-valued styled subject when Vanilla Extract needs a separate module", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div((props) => ({ color: props.color }));\n" +
				'export const App = () => <Card color="red" />;',
			{ from: "styled-components", to: "vanilla-extract", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('from "./Card.styles.css.ts"');
		expect(result.code).toContain("String(((props) => props.color)(props))");
		expect(result.code).toContain('<Card color="red" />');
		expect(result.generatedFiles).toEqual([
			expect.objectContaining({
				path: "Card.styles.css.ts",
				content: expect.stringContaining("var(--yumcss-dynamic-"),
			}),
		]);
		expect(result.generatedFiles.map(({ path, content }) => ({ path, content })))
			.toMatchInlineSnapshot(`
				[
				  {
				    "content": "import { style } from "@vanilla-extract/css";
				export const __yumcssCardStyles = style({ color: "var(--yumcss-dynamic-hiipfm)" });
				",
				    "path": "Card.styles.css.ts",
				  },
				]
			`);
	});

	test("keeps a function-valued subject residual on a target without a function carrier", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div((props) => ({ color: props.color }));\n" +
				'export const App = () => <Card color="red" />;',
			{ from: "styled-components", to: "stylex", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: expect.stringMatching(/function|capability/) }),
			]),
		);
		expect(result.code).toContain("styled.div");
	});

	test("does not discard a static styled subject passed as a value", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components"; const result = use(styled.div({ color: "red" }));',
			{ from: "styled-components", to: "tailwind", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "capability" })]),
		);
		expect(result.code).toContain("styled.div");
	});

	test("emits a JSS class carrier for a static YumCSS React host", () => {
		const result = runAdapterMigration(
			'import { css } from "yumcss/css";\n' +
				'const card = css.class({ color: "red" });\n' +
				"export const App = () => <Box className={card} />;",
			{ from: "yumcss", to: "jss", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import jss from "jss";');
		expect(result.code).toContain(
			'jss.createStyleSheet({ style: { color: "red" } }).attach().classes.style',
		);
		expect(result.code).toContain("<Box className={card} />");
	});

	test("preserves a static styled component export with a JSS class wrapper", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "jss", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("jss.createStyleSheet");
		expect(result.code).toContain("__yumcssCardForwardRef");
		expect(result.code).toContain('props.as ?? props.forwardedAs ?? "div"');
		expect(result.code).toContain("ref={ref}");
		expect(result.code).toContain("export const App = () => <Card />;");
		expect(result.code).not.toContain("<div className={Card} />");
		expect(result.code).not.toContain("styled-components");
	});

	test("emits Aphrodite's class carrier for a static YumCSS React host", () => {
		const result = runAdapterMigration(
			'import { css } from "yumcss/css";\n' +
				'const card = css.class({ color: "red" });\n' +
				"export const App = () => <Box className={card} />;",
			{ from: "yumcss", to: "aphrodite", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { StyleSheet, css } from "aphrodite";');
		expect(result.code).toContain('css(StyleSheet.create({ style: { "color": "red" } }).style)');
		expect(result.code).toContain("<Box className={card} />");
	});

	test("preserves a static styled component export with an Aphrodite class wrapper", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "aphrodite", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("StyleSheet.create");
		expect(result.code).toContain("__yumcssCardForwardRef");
		expect(result.code).toContain('props.as ?? props.forwardedAs ?? "div"');
		expect(result.code).toContain("ref={ref}");
		expect(result.code).toContain("export const App = () => <Card />;");
		expect(result.code).not.toContain("<div className={Card} />");
		expect(result.code).not.toContain("styled-components");
	});

	test.each([
		["aphrodite", "StyleSheet.create", 'import { StyleSheet, css } from "aphrodite";'],
		["chakra-ui", 'css={{ color: "red" }}', 'import { chakra } from "@chakra-ui/react";'],
		["goober", "css", 'import { css } from "goober";'],
	] as const)(
		"wraps an unused styled subject when the target only exposes a class carrier (%s)",
		(target, carrier, targetImport) => {
			const result = runAdapterMigration(
				'import styled from "styled-components";\nconst Card = styled.div({ color: "red" });',
				{
					from: "styled-components",
					to: target,
					file: "Card.tsx",
					mode: "safe",
				},
			);
			expect(result.converted).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).toContain(carrier);
			expect(result.code).toContain(targetImport);
			if (target === "chakra-ui")
				expect(result.code).toContain("const Card = (props) => <chakra.div");
			else {
				expect(result.code).toContain('props.as ?? props.forwardedAs ?? "div"');
				expect(result.code).toContain("ref={ref}");
				expect(result.code).toContain("props.className");
			}
			if (target === "chakra-ui") expect(result.code).toContain('css={{ color: "red" }}');
			expect(result.code).not.toContain("styled-components");
		},
	);

	test("preserves component semantics when Vanilla Extract would require a style sidecar", () => {
		const source =
			'import styled from "styled-components";\nconst Card = styled.div({ color: "red" });';
		const result = runAdapterMigration(source, {
			from: "styled-components",
			to: "vanilla-extract",
			file: "Card.css.ts",
			mode: "safe",
		});

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual([
			expect.objectContaining({
				kind: "component",
				text: "Card",
				hint: expect.stringContaining("separate .css.ts style artifact"),
			}),
		]);
		expect(result.code).toContain('const Card = styled.div({ color: "red" });');
		expect(result.code).not.toContain('from "@vanilla-extract/css"');
		expect(result.code).toMatchInlineSnapshot(`
			"import styled from "styled-components";
			// yumcss:migrate-skip (route: styled-components -> vanilla-extract | lowering-residual: component)
			const Card = styled.div({ color: "red" });"
		`);
	});

	test("projects a styled subject to Mantine's valid React style prop", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "mantine", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(
			'const Card = (props) => <div {...props} style={{ ...{ color: "red" }, ...props.style }} />;',
		);
		expect(result.code).not.toContain('from "@mantine/core"');
		expect(result.code).not.toContain("style({");
	});

	test("emits Style9's class carrier for a static YumCSS React host", () => {
		const result = runAdapterMigration(
			'import { css } from "yumcss/css";\n' +
				'const card = css.class({ color: "red" });\n' +
				"export const App = () => <Box className={card} />;",
			{ from: "yumcss", to: "style9", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import style9 from "style9";');
		expect(result.code).toContain('style9(style9.create({ style: { "color": "red" } }).style)');
		expect(result.code).toContain("<Box className={card} />");
	});

	test("projects a static YumCSS class binding onto a React Native style prop", () => {
		const result = runAdapterMigration(
			'import { View } from "react-native";\n' +
				'import { css } from "yumcss/css";\n' +
				'const card = css.class({ color: "red", padding: 2 });\n' +
				"export const App = () => <View className={card} />;",
			{ from: "yumcss", to: "react-native", file: "App.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { StyleSheet } from "react-native";');
		expect(result.code).toContain("StyleSheet.create");
		expect(result.code).toContain("<View style={card} />");
		expect(result.code).not.toContain('from "yumcss/css"');
	});

	test.each([
		[CodemodAdapterId.ChakraUi, "@chakra-ui/react", "<View"],
		[CodemodAdapterId.Mui, "@mui/material", "<View"],
		[CodemodAdapterId.Mantine, "@mantine/core", "<View"],
		[CodemodAdapterId.Tailwind, "tailwindcss", "<View"],
		[CodemodAdapterId.UnoCSS, "className", "<View"],
	] as const)("projects static %s React hosts to React Native", (sourceAdapter, removed, host) => {
		const fixture = {
			[CodemodAdapterId.ChakraUi]:
				'import { Box } from "@chakra-ui/react"; <Box css={{ backgroundColor: "tomato" }} />',
			[CodemodAdapterId.Mui]: 'import { Box } from "@mui/material"; <Box sx={{ color: "red" }} />',
			[CodemodAdapterId.Mantine]: 'import { Box } from "@mantine/core"; <Box c="red" />',
			[CodemodAdapterId.Tailwind]: '<div className="[display:flex] [padding:1rem]" />',
			[CodemodAdapterId.UnoCSS]: '<div className="[display:flex] [align-items:center]" />',
		}[sourceAdapter];
		const result = runAdapterMigration(fixture, {
			from: sourceAdapter,
			adapterRegistry: fixtureAdapterRegistry,
			to: CodemodAdapterId.ReactNative,
			file: "App.tsx",
			mode: "safe",
		});
		expect(result.converted, `${sourceAdapter} was not converted`).toBe(1);
		expect(result.skipped, `${sourceAdapter} was skipped`).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(host);
		expect(result.code).toContain("StyleSheet.create");
		expect(result.code).not.toContain(removed);
		expect(result.code).toContain("style={StyleSheet.create");
		if (sourceAdapter === CodemodAdapterId.Tailwind) {
			expect(result.code).toContain('"padding": 16');
			expect(result.code).not.toContain("1rem");
		}
	});

	test("keeps unsupported React host shapes source-preserving for React Native", () => {
		const result = runAdapterMigration(
			'import { css } from "yumcss/css";\n' +
				'const card = css.class({ color: "red" });\n' +
				"export const App = () => <button className={card} />;",
			{ from: CodemodAdapterId.YumCSS, to: CodemodAdapterId.ReactNative, file: "App.tsx" },
		);
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "host-framework" })]),
		);
		expect(result.code).toContain("className={card}");
		expect(result.code).toContain('from "yumcss/css"');
	});

	test("does not overwrite an existing React style prop during React Native conversion", () => {
		const source =
			'import { css } from "yumcss/css";\n' +
			'const card = css.class({ color: "red" });\n' +
			"export const App = () => <div className={card} style={{ opacity: 1 }} />;";
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.YumCSS,
			to: CodemodAdapterId.ReactNative,
			file: "App.tsx",
		});
		expect(result.skipped).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "host-framework" })]),
		);
		expect(result.code).toContain("className={card}");
		expect(result.code).toContain("style={{ opacity: 1 }}");
		expect(result.code).not.toContain("StyleSheet.create");
	});

	test("imports a React Native style map into YumCSS without losing the style lookup", () => {
		const result = runAdapterMigration(
			'import { StyleSheet } from "react-native";\n' +
				'const styles = StyleSheet.create({ card: { backgroundColor: "red", padding: 2 } });\n' +
				"export const App = () => <View style={styles.card} />;",
			{ from: "react-native", to: "yumcss", file: "App.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { createUnsafeCss } from "yumcss/unsafe/css";');
		expect(result.code).toContain(
			'const styles = { "card": css.class({ backgroundColor: "red", padding: "2px" }) };',
		);
		expect(result.code).toContain("styles.card");
		expect(result.code).not.toContain("StyleSheet.create");
	});

	test("does not apply a React Native style-prop rewrite to ordinary React JSX", () => {
		const result = runAdapterMigration(
			'import React from "react";\n' +
				'import { css } from "yumcss/css";\n' +
				'const card = css.class({ color: "red" });\n' +
				"export const App = () => <View className={card} />;",
			{ from: "yumcss", to: "react-native", file: "App.tsx", mode: "safe" },
		);
		expect(
			result.residuals.some(
				(residual) =>
					residual.hint?.includes("react-native has no host representation for react") ?? false,
			),
		).toBe(true);
		expect(result.code).toContain("className={card}");
		expect(result.code).toContain('from "yumcss/css"');
	});

	test("projects a static styled intrinsic into a React Native style carrier", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ backgroundColor: "red" });\n' +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "react-native", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("StyleSheet.create");
		expect(result.code).toContain("<View");
		expect(result.code).toContain("style={[style, props.style]}");
		expect(result.code).toMatch(
			/\)\(StyleSheet\.create\(\{ style: \{ "backgroundColor": "red" \} \}\)\.style\)/u,
		);
		expect(result.code).toMatchInlineSnapshot(`
			"import { forwardRef as __yumcssForwardRef, type ComponentRef } from "react";
			import { StyleSheet, View, type ViewProps } from "react-native";
			const Card = ((style: NonNullable<ViewProps["style"]>) => __yumcssForwardRef<ComponentRef<typeof View>, ViewProps>((props, ref) => <View {...props} ref={ref} style={[style, props.style]} />))(StyleSheet.create({ style: { "backgroundColor": "red" } }).style);
			export const App = () => <Card />;"
		`);
		expect(result.code).not.toContain('from "styled-components"');
		expect(result.code).not.toContain("className={Card}");
	});

	test("preserves a static styled component export with a Style9 class wrapper", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "style9", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("style9.create");
		expect(result.code).toContain("__yumcssCardForwardRef");
		expect(result.code).toContain('props.as ?? props.forwardedAs ?? "div"');
		expect(result.code).toContain("ref={ref}");
		expect(result.code).toContain("export const App = () => <Card />;");
		expect(result.code).not.toContain("<div className={Card} />");
		expect(result.code).not.toContain("styled-components");
	});

	test("normalizes CSS dimensions before validating a StyleX target", () => {
		const result = runAdapterMigration(
			'import { StyleSheet } from "aphrodite";\n' +
				'const styles = StyleSheet.create({ card: { color: "red", padding: 16 } });',
			{ from: "aphrodite", to: "stylex", file: "styles.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.validations[0]?.valid).toBe(true);
		expect(result.code).toContain('padding: "16px"');
	});

	test.each(["mui", "tokenami"] as const)(
		"normalizes Mantine property aliases before cross-adapter validation (%s)",
		(target) => {
			const source =
				'import { Box } from "@mantine/core";\n' +
				'export function Card() { return <Box c="red" p="16px" />; }';
			const result = runAdapterMigration(source, {
				from: "mantine",
				to: target,
				file: "Card.tsx",
				mode: "safe",
			});
			if (target === "mui") {
				expect(result.converted).toBe(0);
				expect(result.skipped).toBe(1);
				expect(result.residuals).toEqual(
					expect.arrayContaining([expect.objectContaining({ kind: "host-framework" })]),
				);
				expect(result.code.replace(/^\/\/ yumcss:migrate-skip[^\r\n]*\r?\n/gmu, "")).toBe(source);
				return;
			}
			expect(result.converted).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.validations[0]?.valid).toBe(true);
			expect(result.code).toContain("padding");
		},
	);

	test("rewrites intrinsic styled component JSX uses when lowering to YumCSS", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red" });\n' +
				'export const App = () => <Card data-testid="card" />;',
			{ from: "styled-components", to: "yumcss", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('const Card = css.class({ color: "red" })');
		expect(result.code).toContain('<div data-testid="card" className={Card} />');
		expect(result.code).not.toContain('from "styled-components"');
	});

	test("keeps the static styled lane free of a runtime style carrier", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				'const Card = styled.div({ color: "red", padding: "1rem" });\n' +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "yumcss", file: "Card.tsx", mode: "safe" },
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('css.class({ color: "red", padding: "1rem" })');
		expect(result.code).not.toContain("css.vars(");
		expect(result.code).not.toContain("createRuntimeCss");
	});

	test("isolates runtime fallback to dynamic styled values and retains its dependency", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div({ color: (props) => props.color });\n" +
				'export const App = () => <Card color="red" />;',
			{ from: "styled-components", to: "yumcss", file: "Card.tsx", mode: "safe" },
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("runtimeCss.vars(");
		expect(result.code).toContain("createRuntimeCss");
		expect(
			result.dependencies.some((dependency) =>
				dependency.packages.some(
					(item) => item.name === "yumcss" && item.kind === AdapterDependencyKindTag.Runtime,
				),
			),
		).toBe(true);
	});

	test("keeps configured static and runtime CSS bindings distinct", () => {
		const result = runAdapterMigration(
			'import { css as appCss } from "./yumcss/css";\n' +
				'import { css } from "next-yak";\n' +
				'const desktop = "@media (min-width: 992px)";\n' +
				'const staticClass = appCss.class({ color: "red" });\n' +
				"export const App = () => <button className={staticClass} css={css`color: red; ${desktop} { color: blue; }`} />;",
			{
				from: "next-yak",
				to: "yumcss",
				file: "src/App.tsx",
				mode: "safe",
				project: {
					cssModule: "src/yumcss/css.ts",
					runtimeCssModule: "src/yumcss/runtime.ts",
					runtimeCssBinding: "runtimeCss",
				},
				semantic: { source: { file: "src/App.tsx", framework: "react" } },
			},
		);

		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('import { css as appCss } from "./yumcss/css";');
		expect(result.code).toContain('import { runtimeCss } from "./yumcss/runtime";');
		expect(result.code).not.toContain('import { css } from "./yumcss/runtime";');
		expect(result.code).not.toContain("const css = createRuntimeCss");
	});

	test("loads package/config evidence and migrates static tagged templates", () => {
		const adapter = getCodemodAdapter("emotion")!;
		const config = adapter.loadConfig({
			file: "Card.tsx",
			root: "/project",
			source: "",
			readFile: (file) =>
				file.endsWith("package.json")
					? JSON.stringify({ dependencies: { "@emotion/css": "1.0.0" } })
					: undefined,
		});
		expect(config.files).toEqual(["/project/package.json"]);
		expect(config.values.packageJson).toMatchObject({ dependencies: { "@emotion/css": "1.0.0" } });

		const result = runAdapterMigration(
			'import { css } from "@emotion/css";\nconst card = css`color: red; background-color: blue;`;',
			{ from: "emotion", to: "yumcss", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.code).toContain('css.class({ color: "red", backgroundColor: "blue" })');
	});

	test("uses the default project reader and reports unsupported rule kinds", () => {
		const config = getCodemodAdapter("emotion")!.loadConfig({
			file: "Card.tsx",
			root: process.cwd(),
			source: "",
		});
		expect(config.files).toContain(`${process.cwd()}/package.json`);

		const result = runAdapterMigration(
			'import { fontFace } from "@vanilla-extract/css";\nfontFace({ fontFamily: "Inter" });',
			{ from: "vanilla-extract", to: "emotion", file: "fonts.css.ts", mode: "safe" },
		);
		expect(result.skipped).toBe(1);
		expect(
			result.residuals.some((residual) => residual.kind === StyleProgramResidualKindTag.Capability),
		).toBe(true);
	});

	test("keeps component interpolations as explicit host residuals in safe mode", () => {
		const result = runAdapterMigration("const Card = styled.div`color: ${theme.foreground};`;", {
			from: "styled-components",
			to: "yumcss",
			file: "Card.tsx",
			mode: "safe",
		});
		expect(result.skipped).toBe(1);
		expect(result.residuals.some((residual) => residual.kind === SwapResidualKindTag.Dynamic)).toBe(
			true,
		);
	});

	test("lowers dynamic intrinsic styled components into class and style carriers", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div({ color: theme.foreground });\n" +
				'export const App = () => <Card data-testid="card" />;',
			{ from: "styled-components", to: "yumcss", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.vars({ color: theme.foreground })");
		expect(result.code).toContain('<div data-testid="card" className={Card.class}');
		expect(result.code).toContain("style={Card.style}");
	});

	test("lowers styled template theme interpolations when the host is intrinsic", () => {
		const result = runAdapterMigration(
			'import styled from "styled-components";\n' +
				"const Card = styled.div`color: ${theme.foreground};`;\n" +
				"export const App = () => <Card />;",
			{ from: "styled-components", to: "yumcss", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.vars({ color: theme.foreground })");
		expect(result.code).toContain("<div className={Card.class} style={Card.style} />");
	});

	test("lowers StyleX groups through the static props host", () => {
		const result = runAdapterMigration(
			'import * as stylex from "@stylexjs/stylex";\n' +
				"const styles = stylex.create({ card: { color: colors.foreground } });\n" +
				"export const App = () => <div {...stylex.props(styles.card)} />;",
			{ from: "stylex", to: "yumcss", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.vars({ color: colors.foreground })");
		expect(result.code).toContain("css.props(styles.card)");
		expect(result.code).not.toContain("createRuntimeCss");
		expect(result.code).toContain('from "yumcss/unsafe/css"');
	});

	test("passes an existing host class through the static props host", () => {
		const result = runAdapterMigration(
			'import * as stylex from "@stylexjs/stylex";\n' +
				"const styles = stylex.create({ card: { color: colors.foreground } });\n" +
				'export const App = () => <div {...stylex.props(styles.card)} className="custom-card" />;',
			{ from: "stylex", to: "yumcss", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('className={css.props(styles.card, "custom-card").className}');
		expect(result.code).not.toContain("[css.props(styles.card).className");
	});

	test("projects a YumCSS class binding through StyleX props on a React host", () => {
		const result = runAdapterMigration(
			'import { css } from "yumcss/css";\n' +
				'const card = css.class({ color: "red" });\n' +
				"export const App = () => <Box className={card} />;",
			{ from: "yumcss", to: "stylex", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('stylex.create({ style: { color: "red" } }).style');
		expect(result.code).toContain("<Box {...stylex.props(card)} />");
		expect(result.code).not.toContain("className={card}");
		expect(result.code).not.toContain('from "yumcss/css"');
	});

	test("reports StyleX host projection when a non-React framework is explicit", () => {
		const result = runAdapterMigration(
			'import { css } from "yumcss/css";\n' +
				'const card = css.class({ color: "red" });\n' +
				"export const App = () => <Box class={card} />;",
			{
				from: "yumcss",
				to: "stylex",
				file: "Card.tsx",
				mode: "safe",
				semantic: { source: { framework: "solid" } },
			},
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "host-framework",
					hint: expect.stringContaining("stylex has no host representation for solid"),
				}),
			]),
		);
		expect(result.code).toContain("yumcss:migrate-skip");
		expect(result.code).toContain('from "yumcss/css"');
	});

	test("lowers inline dynamic tagged templates through the host carrier", () => {
		const result = runAdapterMigration(
			'import { css } from "@linaria/core";\n' +
				"export const App = () => <strong className={css`color: ${theme.foreground};`} />;",
			{ from: "linaria", to: "yumcss", file: "App.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("className={css.vars({ color: theme.foreground }).class}");
	});

	test("lowers Stitches variants into the existing YumCSS recipe contract", () => {
		const result = runAdapterMigration(
			'import { createStitches } from "@stitches/react";\n' +
				"const { css } = createStitches();\n" +
				'const Button = css({ fontSize: "100%", variants: { shade: { red: { color: "Crimson" } } } });\n' +
				'const value = Button({ shade: "red" });',
			{ from: "stitches", to: "yumcss", file: "button.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("createRecipe(css");
		expect(result.code).toContain('"shade": { "red"');
		expect(result.code).toContain('Button({ shade: "red" })');
	});

	test("removes the complete Stitches bootstrap when SSR bindings are destructured", () => {
		const result = runAdapterMigration(
			'import { createStitches } from "@stitches/react";\n' +
				'export const { css, getCssText } = createStitches({ theme: { colors: { blue: "blue" } } });\n' +
				'export const card = css({ color: "$colors$blue" });\n',
			{ from: "stitches", to: "yumcss", file: "styles.ts", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("createStitches");
		expect(result.code).not.toContain("getCssText");
		expect(result.code).not.toContain("@stitches/react");
	});

	test("rewrites Vanilla Extract variable declarations for the runtime target", () => {
		const result = runAdapterMigration(
			'import { style, createVar, fallbackVar } from "@vanilla-extract/css";\n' +
				"const color = createVar();\n" +
				'export const card = style({ color, vars: { [color]: fallbackVar(color, "red") } });',
			{ from: "vanilla-extract", to: "yumcss", file: "card.css.ts", mode: "safe" },
		);
		expect(result.converted).toBe(2);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain("yumcss:migrate-skip");
		expect(result.code).not.toContain('from "@vanilla-extract/css"');
		expect(result.code).toContain('const color = "--pw-color";');
		expect(result.code).toContain('__yumcssFallbackVar(color, "red")');
	});

	test("lowers dynamic values into YumCSS vars and rewrites the host carrier", () => {
		const result = runAdapterMigration(
			'import { css } from "@emotion/css";\n' +
				"const card = css({ color: theme.foreground });\n" +
				"export const App = () => <div className={card} />;",
			{ from: "emotion", to: "yumcss", file: "Card.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.vars({ color: theme.foreground })");
		expect(result.code).toContain("className={card.class}");
		expect(result.code).toContain("style={card.style}");
	});

	test("does not parse adapter-looking text inside comments or strings", () => {
		const source = [
			`const example = "css({ color: 'red' })";`,
			`// styled.div({ color: "red" })`,
			`const card = css({ color: "red" });`,
		].join("\n");
		const parsed = getCodemodAdapter("emotion")!.parse(source, {
			file: "Card.tsx",
			source,
			config: { adapter: "emotion", files: [], values: {} },
		});
		expect(parsed.matches).toHaveLength(1);
		expect(parsed.matches[0]?.sourceText).toContain(`css({ color: "red" })`);
	});

	test("keeps vanilla-extract dynamic values unchanged for an identity migration", () => {
		const source = `import { style } from "@vanilla-extract/css";\nconst card = style({ color: theme.foreground });`;
		const result = runAdapterMigration(source, {
			from: "vanilla-extract",
			to: "vanilla-extract",
			file: "Card.css.ts",
		});

		expect(result.code).toBe(source);
		expect(result.changed).toBe(false);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
	});

	test("lowers JSS named rules and imperative application into YumCSS classes", () => {
		const source = [
			'import jss from "jss";',
			"const styles = { button: { color: 'red' } };",
			"const sheet = jss.createStyleSheet(styles);",
			"sheet.getRule('button').applyTo(button);",
		].join("\n");
		const result = runAdapterMigration(source, {
			from: "jss",
			to: "yumcss",
			file: "styles.js",
			mode: "safe",
		});
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).not.toContain('import jss from "jss";');
		expect(result.code).toContain('const sheet = { "button": css.class({ color: "red" }) }');
		expect(result.code).not.toContain("css.group");
		expect(result.code).toContain("button!.classList.add(sheet.button)");
	});

	test("exposes a direct parser/emitter path for Stitches and keyframes", () => {
		const adapter = getCodemodAdapter("stitches")!;
		const parsed = adapter.parse(
			`const fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });`,
			{
				file: "animation.ts",
				source: "",
				config: { adapter: "stitches", files: [], values: {} },
			},
		);
		const match = parsed.matches[0]!;
		expect(match.program.rules[0]?.kind).toBe("keyframes");
		const emitted = adapter.emit(match.program, {
			file: "animation.ts",
			config: { adapter: "stitches", files: [], values: {} },
			mode: "safe",
			index: 0,
		});
		expect(emitted.text).toContain("keyframes(");
		expect(emitted.residuals).toEqual([]);
	});

	test("lowers named JSS rules into a static UnoCSS lookup map", () => {
		const result = runAdapterMigration(
			'import { createUseStyles } from "react-jss";\n' +
				'const styles = createUseStyles({ button: { color: "red", padding: "1rem" } });',
			{
				from: "jss",
				to: "unocss",
				file: "styles.ts",
				mode: "safe",
				adapterRegistry: fixtureAdapterRegistry,
			},
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"button": "[color:red] [padding:1rem]"');
		expect(result.code).not.toContain("react-jss");
	});

	test("lifts global and font-face APIs into rule-level nodes", () => {
		const stitches = getCodemodAdapter("stitches")!;
		const global = stitches.parse(
			`globalCss({ body: { margin: 0 }, "button:hover": { color: "red" } });`,
			{ file: "global.ts", source: "", config: { adapter: "stitches", files: [], values: {} } },
		);
		expect(global.matches[0]?.program.rules.map((rule) => rule.kind)).toEqual(["global", "global"]);
		expect(global.matches[0]?.program.rules[1]?.selector).toBe("button:hover");

		const vanilla = getCodemodAdapter("vanilla-extract")!;
		const font = vanilla.parse(
			`const face = fontFace({ fontFamily: "Inter", src: "url(inter.woff2)" });`,
			{
				file: "fonts.css.ts",
				source: "",
				config: { adapter: "vanilla-extract", files: [], values: {} },
			},
		);
		expect(font.matches[0]?.program.rules[0]?.kind).toBe("font-face");
	});

	test("unwraps vanilla-extract selectors containers into selector conditions", () => {
		const vanilla = getCodemodAdapter("vanilla-extract")!;
		const parsed = vanilla.parse(
			`style({ color: "red", selectors: { "&:hover": { color: "blue" } } });`,
			{
				file: "card.css.ts",
				source: "",
				config: { adapter: "vanilla-extract", files: [], values: {} },
			},
		);
		expect(parsed.matches[0]?.program.residuals).toEqual([]);
		expect(parsed.matches[0]?.program.declarations[1]?.conditions[0]).toMatchObject({
			kind: "selector",
			name: "&:hover",
		});
	});

	test("round-trips an ordered multi-selector global program across adapters", () => {
		for (const target of ["emotion", "styled-components", "vanilla-extract", "stitches"] as const) {
			const result = runAdapterMigration(
				`import { globalCss } from "@stitches/react";\n` +
					`globalCss({ body: { margin: 0 }, button: { color: "red" } });`,
				{
					from: "stitches",
					to: target,
					file: target === "vanilla-extract" ? "global.css.ts" : "global.ts",
					mode: "safe",
				},
			);
			if (target === "stitches") {
				expect(result.changed).toBe(false);
				expect(result.code).toContain("globalCss");
				continue;
			}
			expect(result.converted).toBe(1);
			expect(result.skipped).toBe(0);
			expect(result.residuals).toEqual([]);
			expect(result.code).toContain("body");
			expect(result.code).toContain("button");
		}
	});

	test("retains Vanilla Extract globalStyle selectors during target validation", () => {
		const result = runAdapterMigration(
			'import { globalCss } from "@stitches/react";\n' +
				'globalCss({ body: { margin: 0 }, button: { color: "red" } });',
			{ from: "stitches", to: "vanilla-extract", file: "global.css.ts", mode: "safe" },
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('globalStyle("body"');
		expect(result.code).toContain('globalStyle("button"');
	});

	test("parses Solid Styled css object calls without treating generic template types as styles", () => {
		const adapter = getCodemodAdapter("solid-styled")!;
		const source =
			'import { css } from "solid-styled-components";\n' +
			'export const card = css({ color: "red", padding: "1rem" });';
		const parsed = adapter.parse(source, {
			file: "Card.tsx",
			source,
			config: { adapter: "solid-styled", files: [], values: {} },
		});

		expect(parsed.matches).toHaveLength(1);
		expect(parsed.matches[0]?.program.declarations.map(({ property }) => property)).toEqual([
			"color",
			"padding",
		]);
		expect(parsed.residuals).toEqual([]);
		expect(parsed.matches.map(({ sourceText }) => sourceText)).toMatchInlineSnapshot(`
			[
			  "css({ color: "red", padding: "1rem" })",
			]
		`);
	});

	test("matches complete tagged templates with nested expressions and preserves nested rules", () => {
		const adapter = getCodemodAdapter("solid-styled")!;
		const source =
			'const Card = styled("div")<{ border: number }>`\n' +
			"  color: red;\n" +
			'  border: ${({ border = 1, color = "gainsboro" }): string => `${border}px solid ${color}`};\n' +
			"  &:hover { color: blue; }\n" +
			"`;";
		const parsed = adapter.parse(source, {
			file: "Card.tsx",
			source,
			config: { adapter: "solid-styled", files: [], values: {} },
		});
		expect(parsed.matches).toHaveLength(1);
		expect(parsed.matches[0]?.program.rules[0]?.children).toHaveLength(1);
		const borderValue = parsed.matches[0]?.program.rules[0]?.declarations.find(
			(declaration) => declaration.property === "border",
		)?.value;
		expect(borderValue).toMatchObject({
			kind: StyleValueKindTag.Dynamic,
			expressionKind: StyleDynamicExpressionKind.Function,
		});
		expect(
			borderValue?.kind === StyleValueKindTag.Dynamic &&
				borderValue.expression.startsWith("({ border = 1"),
		).toBe(true);
		expect(
			parsed.residuals.some((residual) => residual.kind === StyleProgramResidualKindTag.Parse),
		).toBe(false);
	});

	test("normalizes plain nested template selectors as descendants", () => {
		const adapter = getCodemodAdapter("vue-styled")!;
		const source = "const Card = styled.div`color: red; h1 { color: white; }`;";
		const parsed = adapter.parse(source, {
			file: "Card.vue",
			source,
			config: { adapter: "vue-styled", files: [], values: {} },
		});
		expect(parsed.matches[0]?.program.rules[0]?.children[0]?.selector).toBe("& h1");
	});

	test("keeps template keyframes as keyframe rules", () => {
		const adapter = getCodemodAdapter("styled-components")!;
		const source = "const fade = keyframes`0%, 100% { opacity: 0; } 50% { opacity: 1; }`;";
		const parsed = adapter.parse(source, {
			file: "animation.ts",
			source,
			config: { adapter: "styled-components", files: [], values: {} },
		});
		expect(parsed.matches[0]?.program.rules[0]?.kind).toBe("keyframes");
		expect(parsed.matches[0]?.program.rules[0]?.children.map((child) => child.selector)).toEqual([
			"0%, 100%",
			"50%",
		]);
	});

	test("wraps function-valued Solid and Vue styles with host runtime context", () => {
		const solidSource =
			'import { styled } from "solid-styled-components";\n' +
			"const Card = styled.div`color: ${(props) => props.color};`;";
		const solidAdapter = getCodemodAdapter(CodemodAdapterId.SolidStyled)!;
		const parsedSolid = solidAdapter.parse(solidSource, {
			file: "Card.tsx",
			source: solidSource,
			config: { adapter: CodemodAdapterId.SolidStyled, files: [], values: {} },
			semantic: { source: { file: "Card.tsx", framework: BuiltinHostFramework.Solid } },
		});
		expect(parsedSolid.matches).toHaveLength(1);
		expect(parsedSolid.matches[0]?.program.source).toMatchObject({
			subject: "styled.div",
			framework: BuiltinHostFramework.Solid,
		});
		expect(parsedSolid.matches[0]?.program.residuals).toEqual([]);
		expect(parsedSolid.matches[0]?.program.declarations[0]?.value).toMatchObject({
			kind: StyleValueKindTag.Dynamic,
			expression: "(props) => props.color",
			expressionKind: StyleDynamicExpressionKind.Function,
		});
		const solid = runAdapterMigration(solidSource, {
			from: "solid-styled",
			to: "yumcss",
			file: "Card.tsx",
			mode: "safe",
			semantic: { source: { file: "Card.tsx", framework: "solid" } },
		});
		expect(solid.converted).toBe(1);
		expect(solid.residuals).toEqual([]);
		expect(solid.code).toContain("css.vars({ color: ((props) => props.color)(props) })");
		expect(solid.code).toContain("css.props(staticClass, dynamic,");
		expect(solid.code).toContain("props.class).className");
		expect(solid.code).not.toContain('from "yumcss/cx"');
		expect(solid.code).toContain("props.class");
		expect(solid.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			const Card = (() => { const staticClass = ""; const component = (props) => {  const dynamic = css.vars({ color: ((props) => props.color)(props) }); const attrs = {}; const Component = attrs.as ?? props.as ?? "div"; const { as: _as, ...rest } = props; const { as: _attrsAs, ...attrsProps } = attrs; const forwarded = { ...rest, ...attrsProps }; return <Component {...forwarded} class={css.props(staticClass, dynamic, "pw-1fn70s4", attrs.class, props.class).className} style={{ ...props.style, ...dynamic.style, ...attrs.style }} />; }; component.__yumcssClassName = "pw-1fn70s4"; return component; })();"
		`);

		const vueSource =
			"<script setup>\n" +
			'import styled from "vue-styled-components";\n' +
			'const Card = styled("div", { color: String })`color: ${(props) => props.color};`;\n' +
			"</script>";
		const vueAdapter = getCodemodAdapter(CodemodAdapterId.VueStyled)!;
		const parsedVue = vueAdapter.parse(vueSource, {
			file: "Card.vue",
			source: vueSource,
			config: { adapter: CodemodAdapterId.VueStyled, files: [], values: {} },
			semantic: { source: { file: "Card.vue", framework: BuiltinHostFramework.Vue } },
		});
		expect(parsedVue.matches).toHaveLength(1);
		expect(parsedVue.matches[0]?.program.source).toMatchObject({
			subject: 'styled("div", { color: String })',
			framework: BuiltinHostFramework.Vue,
		});
		expect(intrinsicTagForSubject('styled("div", { color: String })')).toBe("div");
		expect(parsedVue.matches[0]?.program.residuals).toEqual([]);
		expect(parsedVue.matches[0]?.program.declarations[0]?.value).toMatchObject({
			kind: StyleValueKindTag.Dynamic,
			expression: "(props) => props.color",
			expressionKind: StyleDynamicExpressionKind.Function,
		});
		const vue = runAdapterMigration(vueSource, {
			from: "vue-styled",
			to: "yumcss",
			file: "Card.vue",
			mode: "safe",
			semantic: { source: { file: "Card.vue", framework: "vue" } },
		});
		expect(vue.converted).toBe(1);
		expect(vue.residuals).toEqual([]);
		expect(vue.code).toContain("const props = computed(() => ({ ..._props, ...rawAttrs }));");
		expect(vue.code).toContain("((props) => props.color)(props.value)");
		expect(vue.code).toContain('import { computed, defineComponent, h } from "vue";');
		expect(vue.code).toContain("props: { color: String }");
		expect(vue.code).toContain('h("div", { ...rawAttrs');
		expect(vue.code).toContain("style: [style.value.style, props.value.style]");
		expect(vue.code).not.toContain("styledAttrs");
		expect(vue.code).not.toContain("runtimeCss.group");
		expect(vue.code).toMatchInlineSnapshot(`
			"<script setup>
			import { computed, defineComponent, h } from "vue";
			import { createRuntimeCss } from "yumcss/css/runtime";
			import { defaultPreset } from "yumcss/preset/default";
			const runtimeCss = createRuntimeCss(defaultPreset);

			const Card = defineComponent({ props: { color: String }, inheritAttrs: false, setup(_props, { attrs: rawAttrs, slots }) { const props = computed(() => ({ ..._props, ...rawAttrs })); const style = computed(() => runtimeCss.vars({ color: ((props) => props.color)(props.value) })); return () => h("div", { ...rawAttrs, ...{}, class: [style.value.class, props.value.class], style: [style.value.style, props.value.style] }, slots.default?.()); } });
			</script>"
		`);
	});

	test("uses YumCSS's native function carrier for static StyleX groups", () => {
		const result = runAdapterMigration(
			'import stylex from "@stylexjs/stylex";\n' +
				"const styles = stylex.create({ offset: (value) => ({ paddingLeft: value }) });",
			{
				from: "stylex",
				to: "yumcss",
				file: "styles.ts",
				mode: "safe",
			},
		);
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.group");
		expect(result.code).toContain("(value) =>");
	});

	test("lowers Solid function-call styles and custom component subjects", () => {
		const result = runAdapterMigration(
			'import { styled } from "solid-styled-components";\n' +
				'const Base = styled("div")`color: red;`;\n' +
				"const Card = styled(Base)<{ color: string }>(({ color }) => ({ color }));\n" +
				'export const App = () => <Card color="blue" />;',
			{
				from: "solid-styled",
				to: "yumcss",
				file: "Card.tsx",
				mode: "safe",
				semantic: { source: { file: "Card.tsx", framework: "solid" } },
			},
		);
		expect(result.converted).toBe(2);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain(
			"const Card = runtimeCss.group({ color: ({ color }) => color });",
		);
		expect(result.code).not.toContain("class={cx((props) =>");
	});

	test("lowers Chakra, MUI, and Mantine host style props to canonical elements", async () => {
		const chakra = await migrateConfiguredChakra(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box bg="tomato" p="16px" _hover={{ bg: "blue" }} data-kind="card" />;',
			"App.tsx",
		);
		expect(chakra.converted).toBe(1);
		expect(chakra.skipped).toBe(0);
		expect(chakra.residuals).toEqual([]);
		expect(chakra.code).not.toContain('import { Box } from "@chakra-ui/react";');
		expect(chakra.code).toContain('<div data-kind="card"');
		expect(chakra.code).toContain('className={css.class({ background: "tomato", padding: "16px"');
		expect(chakra.code).toContain("_hover");
		expect(chakra.code).not.toContain('"&:hover"');

		const intrinsicOverride = await migrateConfiguredChakra(
			'import { Box, Heading } from "@chakra-ui/react";\n' +
				'export const App = () => <Box as="aside" p="4"><Heading as="h1" color="red.200">Title</Heading></Box>;',
			"Intrinsic.tsx",
		);
		expect(intrinsicOverride.residuals).toEqual([]);
		expect(intrinsicOverride.code).toContain("<aside className={css.class({");
		expect(intrinsicOverride.code).toContain("<h1 className={css.class({");
		expect(intrinsicOverride.code).not.toContain('as="aside"');
		expect(intrinsicOverride.code).not.toContain('as="h1"');

		const merged = await migrateConfiguredChakra(
			'import { Box } from "@chakra-ui/react";\nexport const App = () => <Box className="existing" bg="tomato" />;',
			"App.tsx",
		);
		expect(merged.code).toContain(
			'className={css.props(css.class({ background: "tomato" }), "existing").className}',
		);

		const spread = await migrateConfiguredChakra(
			'import { Box } from "@chakra-ui/react";\n' +
				'const Card = (props: any) => <Box className="local" bg="tomato" {...props} />;',
			"Card.tsx",
		);
		expect(spread.residuals).toEqual([]);
		expect(spread.code).toContain(
			'className={css.props(css.class({ background: "tomato" }), "local", props?.className).className}',
		);
		expect(spread.code.indexOf("props} />")).toBeLessThan(
			spread.code.indexOf("className={css.props(css.class"),
		);

		const componentSpread = await migrateConfiguredChakra(
			'import { Box } from "@chakra-ui/react";\n' +
				'const Notice = (props: any) => <Box {...props} display="inline-flex" />;\n' +
				'const App = () => <Notice mt="3" />;',
			"Notice.tsx",
		);
		expect(componentSpread.residuals).toEqual([]);
		expect(componentSpread.code).toContain(
			'className={css.props(css.class({ display: "inline-flex" }), props?.className).className}',
		);

		const appOwnedComponent = await migrateConfiguredChakra(
			'import { Box } from "@chakra-ui/react";\n' +
				'import { Button } from "#ui/button";\n' +
				'export const App = () => <><Button size="sm" variant="solid" /><Box p="4" /></>;',
			"App.tsx",
		);
		expect(appOwnedComponent.code).toContain('import { Button } from "#ui/button";');
		expect(appOwnedComponent.code).toContain('<Button size="sm" variant="solid" />');
		expect(appOwnedComponent.code).not.toContain('<button size="sm" variant="solid"');
		expect(appOwnedComponent.code).toContain("<div className={css.class({");

		const separator = await migrateConfiguredChakra(
			'import { HStack, StackSeparator } from "@chakra-ui/react";\n' +
				"export const App = () => <HStack gap={12} separator={<StackSeparator />} />;",
			"Separator.tsx",
		);
		expect(separator.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "component", text: "StackSeparator" }),
			]),
		);
		expect(separator.code).toContain("gap={12}");
		expect(separator.code).not.toContain("className={");
		expect(routeEvidence(separator)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { HStack, StackSeparator } from "@chakra-ui/react";
			// yumcss:migrate-skip (route: chakra-ui -> yumcss | parse-residual: component | available: named-map, residual)
			export const App = () => <HStack gap={12} separator={<StackSeparator />} />;",
			  "converted": 0,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "named-map",
			        "residual",
			      ],
			      "representation": "residual",
			      "residuals": [],
			    },
			  ],
			  "outcomes": [
			    {
			      "outcome": "residual",
			      "representation": "residual",
			    },
			  ],
			  "residuals": [
			    {
			      "hint": "Chakra host 'StackSeparator' has no verified intrinsic projection",
			      "kind": "component",
			      "preserved": undefined,
			    },
			  ],
			  "skipped": 1,
			  "validations": [],
			}
		`);

		const nextImage = runAdapterMigration(
			'import { Box } from "@chakra-ui/react";\n' +
				'import Image from "next/image";\n' +
				'export const App = () => <Box><Image fill src="/hero.png" alt="Hero" objectFit="cover" /></Box>;',
			{ from: "chakra-ui", to: "yumcss", file: "Image.tsx", mode: "safe" },
		);
		expect(nextImage.residuals).toEqual([]);
		expect(nextImage.code).toContain("fill");
		expect(nextImage.code).not.toContain("className={css.class({ fill: true");

		const palette = await migrateConfiguredChakra(
			'import { VStack, Text } from "@chakra-ui/react";\n' +
				'export const App = ({ color }) => <VStack colorPalette={color}><Text color="colorPalette.fg">Label</Text></VStack>;',
			"Palette.tsx",
		);
		expect(palette.skipped).toBeGreaterThan(0);
		expect(palette.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "dynamic",
					hint: "colorPalette requires a statically known value for this target",
				}),
			]),
		);
		expect(palette.code).toContain("colorPalette={color}");
		expect(palette.code).not.toContain("css.vars({ colorPalette: color");
		expect(palette.code).toContain('color="colorPalette.fg"');
		expect(palette.code).toContain("<VStack colorPalette={color}");
		expect(palette.code).toContain('<Text color="colorPalette.fg">');
		expect(palette.code).not.toContain("<p className");
		expect(palette.converted).toBe(0);
		expect(routeEvidence(palette)).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "code": "import { VStack, Text } from "@chakra-ui/react";
			// yumcss:migrate-skip (route: chakra-ui -> yumcss | lowering-residual: dynamic | available: named-map, target-native, residual)
			// yumcss:migrate-skip (route: chakra-ui -> yumcss | lowering-residual: emission-empty, token-values | available: static, named-map, residual)
			export const App = ({ color }) => <VStack colorPalette={color}><Text color="colorPalette.fg">Label</Text></VStack>;",
			  "converted": 0,
			  "generatedFiles": [],
			  "loweringPlans": [
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "named-map",
			        "target-native",
			        "residual",
			      ],
			      "representation": "residual",
			      "residuals": [
			        {
			          "hint": "colorPalette requires a statically known value for this target",
			          "kind": "dynamic",
			        },
			      ],
			    },
			    {
			      "applied": [],
			      "availableRepresentations": [
			        "static",
			        "named-map",
			        "residual",
			      ],
			      "representation": "static",
			      "residuals": [],
			    },
			  ],
			  "outcomes": [
			    {
			      "outcome": "residual",
			      "representation": "residual",
			    },
			    {
			      "outcome": "residual",
			      "representation": "static",
			    },
			  ],
			  "residuals": [
			    {
			      "hint": "colorPalette requires a statically known value for this target",
			      "kind": "dynamic",
			      "preserved": undefined,
			    },
			    {
			      "hint": "target adapter produced no representable output",
			      "kind": "emission-empty",
			      "preserved": undefined,
			    },
			    {
			      "hint": "source token colorPalette.fg has no verified target value",
			      "kind": "token-values",
			      "preserved": undefined,
			    },
			  ],
			  "skipped": 2,
			  "validations": [],
			}
		`);

		const staticPalette = await migrateConfiguredChakra(
			'import { Box } from "@chakra-ui/react";\n' +
				'export const App = () => <Box colorPalette="blue" />;',
			"StaticPalette.tsx",
		);
		expect(staticPalette.residuals).toEqual([]);
		expect(staticPalette.code).toContain('css.class({ colorPalette: "blue" })');

		const conditionalPalette = await migrateConfiguredChakra(
			'import { Box } from "@chakra-ui/react";\n' +
				'export const App = ({ enabled }) => <Box colorPalette={enabled ? "blue" : "red"} />;',
			"ConditionalPalette.tsx",
		);
		expect(conditionalPalette.skipped).toBe(0);
		expect(conditionalPalette.residuals).toEqual([]);
		expect(conditionalPalette.code).toContain('colorPalette: enabled ? "blue" : "red"');
		expect(conditionalPalette.code).not.toContain("css.vars");

		const mui = runAdapterMigration(
			'import { Box } from "@mui/material";\nexport const App = () => <Box sx={{ m: 2, p: 1, color: "red" }} />;',
			{ from: "mui", to: "yumcss", file: "App.tsx", mode: "safe" },
		);
		expect(mui.converted).toBe(1);
		expect(mui.skipped).toBe(0);
		expect(mui.residuals).toEqual([]);
		expect(mui.code).not.toContain('import { Box } from "@mui/material";');
		expect(mui.code).toContain("<div");
		expect(mui.code).toContain('margin: "16px"');
		expect(mui.code).toContain('padding: "8px"');

		const mantine = runAdapterMigration(
			'import { Box } from "@mantine/core";\nexport const App = () => <Box c="red" bg="#fff" mx="16px" />;',
			{ from: "mantine", to: "yumcss", file: "App.tsx", mode: "safe" },
		);
		expect(mantine.converted).toBe(1);
		expect(mantine.skipped).toBe(0);
		expect(mantine.residuals).toEqual([]);
		expect(mantine.code).not.toContain('import { Box } from "@mantine/core";');
		expect(mantine.code).toContain("<div");
		expect(mantine.code).toContain('color: "red"');
		expect(mantine.code).toContain('backgroundColor: "#fff"');
	});

	test("keeps callback-valued host styles as explicit residuals", () => {
		const result = runAdapterMigration(
			'import { Box } from "@mui/material";\nexport const App = ({ theme }) => <Box sx={(theme) => ({ color: theme.palette.primary.main })} />;',
			{ from: "mui", to: "yumcss", file: "App.tsx", mode: "safe" },
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(
			result.residuals.some(
				(residual) =>
					residual.kind === StyleProgramResidualKindTag.RuntimeContext &&
					residual.hint?.includes("MUI sx callbacks require effective theme evaluation") === true,
			),
		).toBe(true);
		expect(result.code).toContain("yumcss:migrate-skip");
	});
});
