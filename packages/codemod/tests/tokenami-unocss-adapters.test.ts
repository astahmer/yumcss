import { describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createStyleAdapterRegistry,
	runAdapterMigration,
	runAdapterMigrationAsync,
} from "../src/swap/index.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";
import { NODE_PROJECT_MODULE_LOADER } from "../src/swap/project-module-loader.ts";
import { createTokenamiAdapter } from "../src/swap/adapters/tokenami.adapter.ts";
import { TokenCatalog } from "../src/swap/tokens.ts";
import {
	createUnoCssAdapter,
	createUnoCssResolverFromCss,
} from "../src/swap/adapters/unocss.adapter.ts";

describe("Tokenami and UnoCSS semantic adapters", () => {
	test("normalizes Tokenami encoded properties and conditions", () => {
		const adapter = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.Tokenami)!;
		const source =
			"import { css } from '@tokenami/css'; const button = css({ '--hover_bg': 'red', '--px': 2 });";
		const parsed = adapter.parse(source, {
			file: "button.tsx",
			source,
			config: {
				...adapter.loadConfig({ file: "button.tsx", source }),
				values: {
					tokenamiConfig: {
						aliases: { bg: "background-color", px: "padding-inline" },
						grid: "4px",
						properties: { "padding-inline": ["grid"] },
					},
				},
			},
			targetId: CodemodAdapterId.Pandwind,
		});
		const declarations = parsed.matches[0]?.program.declarations ?? [];
		expect(declarations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					property: "backgroundColor",
					value: { kind: "literal", value: "red" },
				}),
				expect.objectContaining({
					property: "paddingInline",
					value: { kind: "literal", value: "calc(2 * 4px)" },
				}),
			]),
		);
		expect(declarations.find((entry) => entry.property === "backgroundColor")?.conditions).toEqual([
			{ kind: "pseudo", name: "hover", raw: "hover" },
		]);
	});

	test("expands property aliases and resolves configured selector and container aliases", () => {
		const adapter = createTokenamiAdapter();
		const source =
			'import { css } from "@tokenami/css"; const card = css({ "--size": "100%", "--{&_p}_color": "red", "--parent-hover_color": "blue", "--md_padding": 2 });';
		const config = adapter.loadConfig({ file: "card.tsx", source });
		const parsed = adapter.parse(source, {
			file: "card.tsx",
			source,
			targetId: CodemodAdapterId.Emotion,
			config: {
				...config,
				values: {
					tokenamiConfig: {
						aliases: { size: ["width", "height"] },
						grid: "5px",
						properties: { padding: ["grid"] },
						responsive: { md: "@container (min-width: 400px)" },
						selectors: {
							"parent-hover": ["@media (hover: hover) and (pointer: fine)", ".parent:hover > &"],
						},
					},
				},
			},
		});
		const declarations = parsed.matches[0]?.program.declarations ?? [];

		expect(declarations.map(({ property }) => property).toSorted()).toEqual([
			"color",
			"color",
			"height",
			"padding",
			"width",
		]);
		expect(
			declarations.filter(({ property }) => property === "width" || property === "height"),
		).toEqual([
			expect.objectContaining({ property: "width", value: { kind: "literal", value: "100%" } }),
			expect.objectContaining({ property: "height", value: { kind: "literal", value: "100%" } }),
		]);
		expect(
			declarations.find((declaration) => declaration.conditions[0]?.raw === "{&_p}")?.conditions,
		).toEqual([{ kind: "selector", name: "{&_p}", value: "& p", raw: "{&_p}" }]);
		expect(
			declarations.find((declaration) => declaration.conditions[0]?.name === "parent-hover")
				?.conditions,
		).toEqual([
			{
				kind: "media",
				name: "parent-hover",
				value: "@media (hover: hover) and (pointer: fine)",
				raw: "parent-hover",
			},
			{
				kind: "selector",
				name: "parent-hover",
				value: ".parent:hover > &",
				raw: "parent-hover",
			},
		]);
		expect(
			declarations.find((declaration) => declaration.conditions[0]?.name === "md")?.conditions,
		).toEqual([
			{
				kind: "container",
				name: "md",
				value: "@container (min-width: 400px)",
				raw: "md",
			},
		]);
		expect(
			declarations.find((declaration) => declaration.conditions[0]?.name === "md")?.value,
		).toEqual({
			kind: "literal",
			value: "calc(2 * 5px)",
		});
		expect(declarations).toMatchInlineSnapshot(`
			[
			  {
			    "conditions": [],
			    "property": "width",
			    "value": {
			      "kind": "literal",
			      "value": "100%",
			    },
			  },
			  {
			    "conditions": [],
			    "property": "height",
			    "value": {
			      "kind": "literal",
			      "value": "100%",
			    },
			  },
			  {
			    "conditions": [
			      {
			        "kind": "selector",
			        "name": "{&_p}",
			        "raw": "{&_p}",
			        "value": "& p",
			      },
			    ],
			    "property": "color",
			    "value": {
			      "kind": "literal",
			      "value": "red",
			    },
			  },
			  {
			    "conditions": [
			      {
			        "kind": "media",
			        "name": "parent-hover",
			        "raw": "parent-hover",
			        "value": "@media (hover: hover) and (pointer: fine)",
			      },
			      {
			        "kind": "selector",
			        "name": "parent-hover",
			        "raw": "parent-hover",
			        "value": ".parent:hover > &",
			      },
			    ],
			    "property": "color",
			    "value": {
			      "kind": "literal",
			      "value": "blue",
			    },
			  },
			  {
			    "conditions": [
			      {
			        "kind": "container",
			        "name": "md",
			        "raw": "md",
			        "value": "@container (min-width: 400px)",
			      },
			    ],
			    "property": "padding",
			    "value": {
			      "kind": "literal",
			      "value": "calc(2 * 5px)",
			    },
			  },
			]
		`);
	});

	test("keeps configured Tokenami theme variables as resolved token values", () => {
		const adapter = createTokenamiAdapter();
		const source =
			'import { css } from "@tokenami/css"; const card = css({ "--color": "var(--color_brand)" });';
		const config = adapter.loadConfig({ file: "card.tsx", source });
		const parsed = adapter.parse(source, {
			file: "card.tsx",
			source,
			targetId: CodemodAdapterId.Pandwind,
			config: {
				...config,
				tokenCatalog: TokenCatalog.fromNested({ color: { brand: "#123456" } })?.contract,
				values: {
					tokenamiConfig: {
						properties: { color: ["color"] },
						theme: { color: { brand: "#123456" } },
					},
				},
			},
		});
		const value = parsed.matches[0]?.program.declarations[0]?.value;

		expect(value).toEqual({
			kind: "token",
			ref: "brand",
			authored: "var(--color_brand)",
			resolved: "#123456",
		});
		expect(value).toMatchInlineSnapshot(`
			{
			  "authored": "var(--color_brand)",
			  "kind": "token",
			  "ref": "brand",
			  "resolved": "#123456",
			}
		`);
	});

	test("rewrites Tokenami static styles through the Pandwind target", () => {
		const source =
			"import { css } from '@tokenami/css'; const button = css({ '--hover_color': 'red' });";
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Tokenami,
			to: CodemodAdapterId.Pandwind,
			file: "button.tsx",
		});
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("css.class");
		expect(result.code).not.toContain("@tokenami/css");
	});

	test("preserves Tokenami compose variants instead of flattening them into declarations", () => {
		const source =
			'import { css } from "@tokenami/css"; const button = css.compose({ "--color": "red", variants: { size: { small: { "--padding": 2 } } } });';
		const adapter = createTokenamiAdapter();
		const config = adapter.loadConfig({ file: "styles.ts", source });
		const parsed = adapter.parse(source, {
			file: "styles.ts",
			source,
			targetId: CodemodAdapterId.Emotion,
			config,
		});
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Tokenami,
			to: CodemodAdapterId.Emotion,
			file: "styles.ts",
		});

		expect(parsed.matches[0]?.program.source?.pattern).toBe("tokenami-compose");
		expect(parsed.matches[0]?.program.residuals).toContainEqual(
			expect.objectContaining({
				kind: "composition",
				text: "css.compose",
				hint: expect.stringContaining("callable API"),
			}),
		);
		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "composition",
					hint: expect.stringContaining("callable API"),
				}),
			]),
		);
		expect(result.residuals.filter(({ kind }) => kind === "configuration")).toHaveLength(1);
		expect(result.code).toContain('variants: { size: { small: { "--padding": 2 } } }');
		expect(result.code).toMatchInlineSnapshot(`
			"// pandwind:migrate-skip (route: tokenami -> emotion | parse-residual: configuration, composition | capability-blocked: named-conditions: named: size | available: named-map, residual)
			import { css } from "@tokenami/css"; const button = css.compose({ "--color": "red", variants: { size: { small: { "--padding": 2 } } } });"
		`);
	});

	test("retains dynamic Tokenami grid values when target arithmetic is not modeled", async () => {
		const source =
			'import { css } from "@tokenami/css"; const amount = getPadding(); export const card = css({ "--padding": amount });';
		const unresolved = runAdapterMigration(source, {
			from: CodemodAdapterId.Tokenami,
			to: CodemodAdapterId.Emotion,
			file: "styles.ts",
		});
		const tokenamiConfig = {
			grid: "4px",
			properties: { padding: ["grid"] },
			theme: {},
		};
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				return packageName === "@tokenami/css"
					? ({ createConfig: () => tokenamiConfig } as never)
					: undefined;
			},
			async importFile() {
				return { default: tokenamiConfig } as never;
			},
		};
		const tokenami = createTokenamiAdapter({ moduleLoader: loader });
		const builtin = createBuiltinCodemodCatalog();
		const registry = createStyleAdapterRegistry(
			builtin.adapters.filter((adapter) => adapter.id !== CodemodAdapterId.Tokenami),
		);
		registry.register(tokenami);
		const sourceConfig = await tokenami.loadConfigAsync?.({
			file: "styles.ts",
			source,
			root: "/project",
			readFile: (file) => (file.endsWith("tokenami.config.ts") ? "export default {}" : undefined),
			listFiles: () => ["/project/tokenami.config.ts"],
		});
		if (sourceConfig === undefined) throw new Error("Tokenami test config did not load");
		const parsed = tokenami.parse(source, {
			file: "styles.ts",
			source,
			targetId: CodemodAdapterId.Emotion,
			config: sourceConfig,
		});
		expect(sourceConfig.values.tokenamiConfig).toMatchObject({
			grid: "4px",
			properties: { padding: ["grid"] },
		});
		expect(parsed.matches[0]?.program.residuals).toContainEqual(
			expect.objectContaining({ kind: "capability", text: "--padding" }),
		);
		const verified = await runAdapterMigrationAsync(source, {
			from: CodemodAdapterId.Tokenami,
			to: CodemodAdapterId.Emotion,
			file: "styles.ts",
			root: "/project",
			readFile: (file) => (file.endsWith("tokenami.config.ts") ? "export default {}" : undefined),
			listFiles: () => ["/project/tokenami.config.ts"],
			adapterRegistry: registry,
		});
		const literal = await runAdapterMigrationAsync(
			source.replace('"--padding": amount', '"--padding": 2'),
			{
				from: CodemodAdapterId.Tokenami,
				to: CodemodAdapterId.Emotion,
				file: "styles.ts",
				root: "/project",
				readFile: (file) => (file.endsWith("tokenami.config.ts") ? "export default {}" : undefined),
				listFiles: () => ["/project/tokenami.config.ts"],
				adapterRegistry: registry,
			},
		);

		expect({
			unresolved: {
				skipped: unresolved.skipped,
				residuals: unresolved.residuals,
				code: unresolved.code,
			},
			verified: { skipped: verified.skipped, residuals: verified.residuals, code: verified.code },
			literal: { skipped: literal.skipped, residuals: literal.residuals, code: literal.code },
		}).toMatchInlineSnapshot(`
			{
			  "literal": {
			    "code": "import { css } from "@emotion/css";
			 const amount = getPadding(); export const card = css({ padding: "calc(2 * 4px)" });",
			    "residuals": [],
			    "skipped": 0,
			  },
			  "unresolved": {
			    "code": "// pandwind:migrate-skip (route: tokenami -> emotion | parse-residual: configuration | available: named-map, target-native, runtime-carrier, residual)
			import { css } from "@tokenami/css"; const amount = getPadding(); export const card = css({ "--padding": amount });",
			    "residuals": [
			      {
			        "hint": "Tokenami dynamic values need official property metadata to detect grid-scaled numeric properties before migration",
			        "kind": "configuration",
			        "text": "--padding",
			      },
			    ],
			    "skipped": 1,
			  },
			  "verified": {
			    "code": "// pandwind:migrate-skip (route: tokenami -> emotion | parse-residual: capability | available: named-map, target-native, runtime-carrier, residual)
			import { css } from "@tokenami/css"; const amount = getPadding(); export const card = css({ "--padding": amount });",
			    "residuals": [
			      {
			        "hint": "Tokenami dynamic grid values need target-runtime arithmetic to preserve the configured grid scale",
			        "kind": "capability",
			        "text": "--padding",
			      },
			    ],
			    "skipped": 1,
			  },
			}
		`);
		expect(unresolved.skipped).toBe(1);
		expect(unresolved.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "configuration", text: "--padding" }),
			]),
		);
		expect(unresolved.code).toContain('"--padding": amount');
		expect(verified.skipped).toBe(1);
		expect(verified.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "capability",
					text: "--padding",
					hint: expect.stringContaining("target-runtime arithmetic"),
				}),
			]),
		);
		expect(verified.code).toContain('"--padding": amount');
		expect(literal.converted).toBe(1);
		expect(literal.skipped).toBe(0);
		expect(literal.residuals).toEqual([]);
		expect(literal.code).toContain('padding: "calc(2 * 4px)"');
	});

	test("captures static Panda recipe variants for Tokenami composition", () => {
		const source =
			'import { cva } from "styled-system/recipes"; export const button = cva({ base: { color: "red" }, variants: { size: { sm: { padding: "2" } } } });';
		const panda = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.Panda);
		if (panda === undefined) throw new Error("Panda adapter is unavailable");
		const config = panda.loadConfig({ file: "styles.ts", source });
		const parsed = panda.parse(source, {
			file: "styles.ts",
			source,
			targetId: CodemodAdapterId.Tokenami,
			config,
		});
		const program = parsed.matches[0]?.program;

		expect(program).toBeDefined();
		expect({
			declarations: program?.declarations,
			rules: program?.rules,
			compositions: program?.compositions,
		}).toMatchInlineSnapshot(`
			{
			  "compositions": [
			    {
			      "kind": "recipe",
			      "reference": "variants",
			    },
			  ],
			  "declarations": [
			    {
			      "conditions": [],
			      "property": "color",
			      "value": {
			        "kind": "literal",
			        "value": "red",
			      },
			    },
			    {
			      "conditions": [
			        {
			          "kind": "named",
			          "name": "size",
			        },
			        {
			          "kind": "named",
			          "name": "sm",
			        },
			      ],
			      "property": "padding",
			      "value": {
			        "kind": "literal",
			        "value": "2",
			      },
			    },
			  ],
			  "rules": [
			    {
			      "children": [],
			      "conditions": [],
			      "declarations": [
			        {
			          "conditions": [],
			          "property": "color",
			          "value": {
			            "kind": "literal",
			            "value": "red",
			          },
			        },
			        {
			          "conditions": [
			            {
			              "kind": "named",
			              "name": "size",
			            },
			            {
			              "kind": "named",
			              "name": "sm",
			            },
			          ],
			          "property": "padding",
			          "value": {
			            "kind": "literal",
			            "value": "2",
			          },
			        },
			      ],
			      "kind": "style",
			      "order": 0,
			      "source": {
			        "adapter": "panda",
			        "end": 144,
			        "file": "styles.ts",
			        "start": 67,
			      },
			    },
			  ],
			}
		`);
	});

	test("emits Tokenami-native properties and selector conditions", () => {
		const source =
			'import { css } from "@emotion/css";\n' +
			'export const card = css({ color: "red", "&:hover": { color: "blue" }, "&[data-state=active]": { color: "green" } });';
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.Tokenami,
			file: "Card.tsx",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"--color": "red"');
		expect(result.code).toContain('"--hover_color": "blue"');
		expect(result.code).toContain('"--{&[data-state=active]}_color": "green"');
		expect(result.code).not.toContain('color: "red"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { css } from "@tokenami/css";
			export const card = css({ "--color": "red", "--hover_color": "blue", "--{&[data-state=active]}_color": "green" });"
		`);
	});

	test("maps a verified media query to the Tokenami responsive alias", async () => {
		const tokenamiConfig = {
			properties: { color: ["color"] },
			responsive: { md: "@media (min-width: 700px)" },
			theme: {},
		};
		const tokenami = createTokenamiAdapter({
			moduleLoader: {
				async importPackage<T>(packageName: string) {
					return packageName === "@tokenami/css"
						? ({
								createConfig: (config: Readonly<Record<string, unknown>>) => ({
									...tokenamiConfig,
									...config,
								}),
							} as T)
						: undefined;
				},
				async importFile<T>() {
					return { default: tokenamiConfig } as T;
				},
			},
		});
		const builtin = createBuiltinCodemodCatalog();
		const registry = createStyleAdapterRegistry(
			builtin.adapters.filter((adapter) => adapter.id !== CodemodAdapterId.Tokenami),
		);
		registry.register(tokenami);
		const result = await runAdapterMigrationAsync(
			'import { css } from "@emotion/css"; export const card = css({ color: "red", "@media (min-width: 700px)": { color: "blue" } });',
			{
				from: CodemodAdapterId.Emotion,
				to: CodemodAdapterId.Tokenami,
				file: "src/card.ts",
				root: "/project",
				readFile: (file) => (file.endsWith("tokenami.config.ts") ? "export default {}" : undefined),
				listFiles: () => ["/project/tokenami.config.ts"],
				adapterRegistry: registry,
			},
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"--md_color": "blue"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { css } from "@tokenami/css";
			 export const card = css({ "--color": "red", "--md_color": "blue" });"
		`);
	});

	test("moves a converted class binding to Tokenami's style-object host", () => {
		const source =
			'import { css } from "@emotion/css";\n' +
			'const card = css({ color: "red" });\n' +
			"export const App = () => <div className={card} />;";
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.Tokenami,
			file: "App.tsx",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("<div style={card} />");
		expect(result.code).not.toContain("className={card}");
		expect(result.code).toMatchInlineSnapshot(`
			"import { css } from "@tokenami/css";
			const card = css({ "--color": "red" });
			export const App = () => <div style={card} />;"
		`);
	});

	test("rewrites Solid class bindings to Tokenami style bindings", () => {
		const source =
			'import { css } from "@emotion/css"; import { createSignal } from "solid-js"; const card = css({ color: "red" }); export const App = () => <div class={card} />;';
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.Tokenami,
			file: "App.tsx",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("<div style={card} />");
		expect(result.code).not.toContain("class={card}");
		expect(result.code).toMatchInlineSnapshot(`
			"import { css } from "@tokenami/css";
			 import { createSignal } from "solid-js"; const card = css({ "--color": "red" }); export const App = () => <div style={card} />;"
		`);
	});

	test("rewrites Vue class bindings to Tokenami style bindings", () => {
		const source =
			'<script setup lang="ts">import { css } from "@emotion/css"; const card = css({ color: "red" });</script>\n<template><div :class="card" /></template>';
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.Tokenami,
			file: "App.vue",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('<div :style="card" />');
		expect(result.code).not.toContain(':class="card"');
		expect(result.code).toMatchInlineSnapshot(`
			"<script setup lang="ts">
			import { css } from "@tokenami/css";
			 const card = css({ "--color": "red" });</script>
			<template><div :style="card" /></template>"
		`);
	});

	test("round-trips pseudo arbitrary utilities between Tokenami and UnoCSS", () => {
		const source =
			"import { css } from '@tokenami/css'; const button = css({ '--hover_color': 'red' });";
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.Tokenami,
			to: CodemodAdapterId.UnoCSS,
			file: "button.tsx",
		});
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"hover:[color:red]"');
	});

	test("uses a project resolver for UnoCSS utilities and preserves host syntax", () => {
		const uno = createUnoCssAdapter({
			resolver: {
				resolve(token) {
					if (token === "brand") {
						return [
							{
								conditions: [],
								property: "color",
								value: { kind: "literal", value: "rebeccapurple" },
							},
						];
					}
					return undefined;
				},
			},
		});
		const catalog = createBuiltinCodemodCatalog();
		const registry = createStyleAdapterRegistry(
			catalog.adapters.filter((adapter) => adapter.id !== CodemodAdapterId.UnoCSS),
		);
		registry.register(uno);
		const source = '<div className="brand" />';
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.UnoCSS,
			to: CodemodAdapterId.Pandwind,
			file: "App.tsx",
			adapterRegistry: registry,
		});
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("className={css.class");
		expect(result.code).toContain("rebeccapurple");
	});

	test("lowers exported standalone UnoCSS utility carriers", () => {
		const uno = createUnoCssAdapter({
			resolver: {
				resolve(token) {
					return token === "text-brand"
						? [
								{
									conditions: [],
									property: "color",
									value: { kind: "literal", value: "rebeccapurple" },
								},
							]
						: undefined;
				},
			},
		});
		const catalog = createBuiltinCodemodCatalog();
		const registry = createStyleAdapterRegistry([
			catalog.registry.get(CodemodAdapterId.Pandwind)!,
			uno,
		]);
		const result = runAdapterMigration('export const card = "text-brand";', {
			from: CodemodAdapterId.UnoCSS,
			to: CodemodAdapterId.Pandwind,
			file: "styles.ts",
			adapterRegistry: registry,
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('css.class({ color: "rebeccapurple" })');
	});

	test("project-aware migration consumes the official UnoCSS loader", async () => {
		const catalog = createBuiltinCodemodCatalog();
		const uno = createUnoCssAdapter({
			moduleLoader: {
				async importPackage(packageName) {
					if (packageName === "@unocss/config")
						return {
							loadConfig: async () => ({
								config: { rules: [["brand", { color: "rebeccapurple" }]] },
							}),
						} as never;
					if (packageName === "@unocss/core")
						return {
							createGenerator: async () => ({
								generate: async () => ({ css: ".brand{color:rebeccapurple}" }),
							}),
						} as never;
					return undefined;
				},
				async importFile() {
					return undefined;
				},
			},
		});
		const registry = createStyleAdapterRegistry([
			uno,
			catalog.registry.get(CodemodAdapterId.Pandwind)!,
		]);
		const result = await runAdapterMigrationAsync('<div className="brand" />', {
			from: CodemodAdapterId.UnoCSS,
			to: CodemodAdapterId.Pandwind,
			file: "App.tsx",
			root: "/project",
			listFiles: () => ["/project/uno.config.ts"],
			adapterRegistry: registry,
		});
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("rebeccapurple");
	});

	test("reports unknown UnoCSS utilities instead of guessing", () => {
		const adapter = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.UnoCSS)!;
		const source = '<div className="project-shortcut" />';
		const parsed = adapter.parse(source, {
			file: "App.tsx",
			source,
			config: adapter.loadConfig({ file: "App.tsx", source }),
		});
		expect(parsed.matches[0]?.program.residuals[0]).toMatchObject({
			kind: "unknown-utility",
			text: "project-shortcut",
		});
	});

	test("accepts declarations from a real UnoCSS-generated CSS artifact", () => {
		const uno = createUnoCssAdapter({
			resolver: createUnoCssResolverFromCss(
				".brand{color:rebeccapurple}.hover\\:brand:hover{color:blue}",
			),
		});
		const parsed = uno.parse('<div className="brand hover:brand" />', {
			file: "App.tsx",
			source: '<div className="brand hover:brand" />',
			config: uno.loadConfig({ file: "App.tsx", source: "" }),
		});
		expect(parsed.matches[0]?.program.residuals).toEqual([]);
		expect(parsed.matches[0]?.program.declarations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					property: "color",
					value: { kind: "literal", value: "rebeccapurple" },
				}),
				expect.objectContaining({ property: "color", value: { kind: "literal", value: "blue" } }),
			]),
		);
	});

	test("materializes UnoCSS opaque color variables for target token matching", () => {
		const resolver = createUnoCssResolverFromCss(
			".bg-brand{--un-bg-opacity:1;background-color:rgb(18 52 86/var(--un-bg-opacity))}",
		);

		expect(resolver.resolve("bg-brand", {} as never)).toEqual([
			expect.objectContaining({
				property: "backgroundColor",
				value: { kind: "literal", value: "#123456" },
			}),
		]);
	});

	test("decodes generated utility selectors without treating theme variables as utilities", () => {
		const resolver = createUnoCssResolverFromCss(
			".hover\\:bg-\\[\\#383838\\]:hover{background-color:#383838}" +
				"@theme inline { --color-foreground: var(--foreground); --color-background: var(--background); }",
		);
		expect(resolver.resolve("hover:bg-[#383838]", {} as never)).toEqual([
			expect.objectContaining({
				property: "backgroundColor",
				conditions: [{ kind: "pseudo", name: "hover" }],
			}),
		]);
		expect(resolver.resolve("bg-foreground", {} as never)).toBeUndefined();
	});

	test("preserves generated parent variants and responsive at-rules", () => {
		const resolver = createUnoCssResolverFromCss(
			".dark .dark\\:bg-black{background-color:#000}" +
				".group:hover .group-hover\\:text-red-500{color:#f00}" +
				"@media (min-width: 640px){.sm\\:items-start{align-items:flex-start}}",
		);

		expect(resolver.resolve("dark:bg-black", {} as never)).toEqual([
			expect.objectContaining({
				conditions: [{ kind: "selector", name: ".dark &", value: ".dark &" }],
			}),
		]);
		expect(resolver.resolve("group-hover:text-red-500", {} as never)).toEqual([
			expect.objectContaining({
				conditions: [{ kind: "selector", name: ".group:hover &", value: ".group:hover &" }],
			}),
		]);
		expect(resolver.resolve("sm:items-start", {} as never)).toEqual([
			expect.objectContaining({
				conditions: [{ kind: "media", name: "(min-width: 640px)", value: "(min-width: 640px)" }],
			}),
		]);
	});

	test("loads Tokenami aliases through its official config package boundary", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				return packageName === "@tokenami/css"
					? ({
							createConfig: (value: unknown) => ({
								...(value as Record<string, unknown>),
								officialNormalized: true,
							}),
						} as never)
					: undefined;
			},
			async importFile() {
				return { default: { aliases: { brand: ["color"] } } } as never;
			},
		};
		const adapter = createTokenamiAdapter({ moduleLoader: loader });
		const config = await adapter.loadConfigAsync?.({
			file: "App.tsx",
			source: "",
			root: "/project",
		});
		expect(config?.values.tokenamiConfig).toMatchObject({
			aliases: { brand: ["color"] },
			officialNormalized: true,
		});
		expect(config?.values.officialConfigPackage).toBe("@tokenami/css");
	});

	test("rejects malformed Tokenami property metadata as a configuration residual", async () => {
		const adapter = createTokenamiAdapter({
			moduleLoader: {
				async importPackage(packageName) {
					return packageName === "@tokenami/css"
						? ({ createConfig: (value: unknown) => value } as never)
						: undefined;
				},
				async importFile() {
					return { default: { grid: 4, properties: { padding: "grid" } } } as never;
				},
			},
		});
		const config = await adapter.loadConfigAsync?.({
			file: "src/card.ts",
			source: "",
			root: "/project",
			listFiles: () => ["/project/tokenami.config.ts"],
		});

		expect(config?.values.tokenamiConfig).toBeUndefined();
		expect(config?.residuals).toMatchInlineSnapshot(`
			[
			  {
			    "hint": "Tokenami configuration was not found or could not be loaded",
			    "kind": "configuration",
			    "text": "Tokenami project configuration",
			  },
			]
		`);
	});

	test("uses official Tokenami defaults when a project has no custom config", async () => {
		const tokenamiConfig = {
			grid: "0.25rem",
			properties: { padding: ["grid"] },
			theme: {},
		};
		const adapter = createTokenamiAdapter({
			moduleLoader: {
				async importPackage<T>(packageName: string) {
					return packageName === "@tokenami/css"
						? ({ createConfig: () => tokenamiConfig } as T)
						: undefined;
				},
				async importFile<T>() {
					return undefined as T | undefined;
				},
			},
		});
		const source = 'import { css } from "@tokenami/css"; const card = css({ "--padding": 2 });';
		const config = await adapter.loadConfigAsync?.({
			file: "src/card.ts",
			source,
			root: "/project",
			listFiles: () => [],
		});
		if (config === undefined) throw new Error("Tokenami official config loader was not available");
		const parsed = adapter.parse(source, {
			file: "src/card.ts",
			source,
			targetId: CodemodAdapterId.Emotion,
			config,
		});
		const value = parsed.matches[0]?.program.declarations[0]?.value;

		expect(parsed.matches[0]?.program.residuals).toEqual([]);
		expect(value).toEqual({ kind: "literal", value: "calc(2 * 0.25rem)" });
		expect(value).toMatchInlineSnapshot(`
			{
			  "kind": "literal",
			  "value": "calc(2 * 0.25rem)",
			}
		`);
	});

	test("uses the installed UnoCSS config and generator for project shortcuts", async () => {
		const root = mkdtempSync(join(process.cwd(), ".tmp-unocss-official-"));
		try {
			writeFileSync(
				join(root, "uno.config.ts"),
				"export default { rules: [['brand', { color: 'rebeccapurple' }]] }",
			);
			const adapter = createUnoCssAdapter({ moduleLoader: NODE_PROJECT_MODULE_LOADER });
			const source = '<div className="brand" />';
			const config = await adapter.loadConfigAsync?.({
				file: "App.tsx",
				source,
				root,
				listFiles: () => [join(root, "uno.config.ts")],
			});
			expect(config?.values.officialConfigPackages).toEqual(["@unocss/config", "@unocss/core"]);
			const parsed = adapter.parse(source, {
				file: "App.tsx",
				source,
				root,
				config: config!,
			});
			expect(parsed.matches[0]?.program.residuals).toEqual([]);
			expect(parsed.matches[0]?.program.declarations).toEqual([
				expect.objectContaining({
					property: "color",
					value: { kind: "literal", value: "rebeccapurple" },
				}),
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reports an official UnoCSS loader failure as a configuration residual", async () => {
		const adapter = createUnoCssAdapter({
			moduleLoader: {
				async importPackage(packageName) {
					if (packageName === "@unocss/config")
						return {
							loadConfig: async () => {
								throw new Error("preset failed to load");
							},
						} as never;
					if (packageName === "@unocss/core")
						return {
							createGenerator: async () => ({ generate: async () => ({ css: "" }) }),
						} as never;
					return undefined;
				},
				async importFile() {
					return undefined;
				},
			},
		});
		const source = '<div className="brand" />';
		const config = await adapter.loadConfigAsync?.({
			file: "App.tsx",
			source,
			root: "/project",
			listFiles: () => ["/project/uno.config.ts"],
		});
		expect(config?.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "configuration", text: "UnoCSS project configuration" }),
			]),
		);
		const parsed = adapter.parse(source, {
			file: "App.tsx",
			source,
			root: "/project",
			config: config!,
		});
		expect(parsed.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "configuration", text: "UnoCSS project configuration" }),
			]),
		);
	});

	test("stops a project migration when official config carries a residual", async () => {
		const adapter = createUnoCssAdapter({
			moduleLoader: {
				async importPackage(packageName) {
					if (packageName === "@unocss/config")
						return {
							loadConfig: async () => {
								throw new Error("preset failed to load");
							},
						} as never;
					if (packageName === "@unocss/core")
						return {
							createGenerator: async () => ({ generate: async () => ({ css: "" }) }),
						} as never;
					return undefined;
				},
				async importFile() {
					return undefined;
				},
			},
		});
		const pandwind = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.Pandwind)!;
		const result = await runAdapterMigrationAsync('<div className="brand" />', {
			from: CodemodAdapterId.UnoCSS,
			to: CodemodAdapterId.Pandwind,
			file: "App.tsx",
			root: "/project",
			listFiles: () => ["/project/uno.config.ts"],
			adapterRegistry: createStyleAdapterRegistry([adapter, pandwind]),
		});
		expect(result.changed).toBe(true);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain('<div className="brand" />');
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "configuration", text: "UnoCSS project configuration" }),
			]),
		);
	});
});
