import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createChakraAdapter,
	createMantineAdapter,
	createMuiAdapter,
	createPandaAdapter,
	createTailwindAdapter,
	createTokenamiAdapter,
	createUnoCssAdapter,
	createBuiltinCodemodCatalog,
	createPandwindAdapter,
	createStyleAdapterRegistry,
	runAdapterMigrationAsync,
} from "../src/swap/index.ts";
import { TokenCatalog } from "../src/swap/tokens.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";
import type { StyleAdapter } from "../src/swap/adapter-contract.ts";
import { styleProgramFromRules } from "../src/swap/semantic-ir.ts";

const context = {
	file: "src/App.tsx",
	source: "",
	root: "/project",
};

const literalProgram = styleProgramFromRules([
	{
		kind: "style",
		conditions: [],
		declarations: [
			{ conditions: [], property: "color", value: { kind: "literal", value: "#123456" } },
		],
		children: [],
		order: 0,
	},
]);

describe("official custom-token loaders", () => {
	test("normalizes nested config values and rejects ambiguous matches", () => {
		const catalog = TokenCatalog.fromNested({
			colors: {
				brand: { 500: { value: "#123456" } },
				duplicate: { value: "#123456" },
			},
			spacing: { card: { value: "17px" }, numeric: { value: 4 } },
			radii: { responsive: { value: { base: "2px", _dark: "4px" } } },
		});

		expect(catalog?.findUnique(["spacing"], "17px")).toMatchInlineSnapshot(`
			{
			  "authored": "card",
			  "group": "spacing",
			  "key": "card",
			  "ref": "card",
			  "resolved": "17px",
			}
		`);
		expect(catalog?.findUnique(["colors"], "#123456")).toBeUndefined();
		expect(catalog?.findUnique(["spacing"], "4")).toMatchInlineSnapshot(`
			{
			  "authored": "numeric",
			  "group": "spacing",
			  "key": "numeric",
			  "ref": "numeric",
			  "resolved": "4",
			}
		`);
		expect(catalog?.findUnique(["radii"], "2px")).toBeUndefined();
	});

	test("loads Chakra custom tokens from the official merged system config", async () => {
		const system = {
			$$chakra: true as const,
			_config: {
				theme: { tokens: { colors: { brand: { "500": { value: "#123456" } } } } },
			},
			token: { var: (path: string) => `var(--chakra-${path.replaceAll(".", "-")})` },
		};
		const loader: ProjectModuleLoader = {
			async importPackage() {
				return { isValidSystem: (value: unknown) => value === system } as never;
			},
			async importFile() {
				return { default: system } as never;
			},
		};
		const config = await createChakraAdapter({ moduleLoader: loader }).loadConfigAsync?.(context);

		expect(config?.tokenCatalog?.groups).toMatchInlineSnapshot(`
			{
			  "colors": {
			    "brand.500": "#123456",
			  },
			}
		`);
		const source = '<Box color="brand.500" />';
		const parsed = createChakraAdapter({ moduleLoader: loader }).parse(source, {
			...context,
			source,
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

	test("loads Tailwind theme variables through the official design-system package", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage() {
				return {
					__unstable__loadDesignSystem: async () => ({
						theme: {
							entries: () =>
								new Map([
									["--color-brand", { value: "#123456" }],
									["--spacing-card", { value: "17px" }],
								]),
						},
						candidatesToCss: () => [],
					}),
				} as never;
			},
			async importFile() {
				return undefined;
			},
		};
		const config = await createTailwindAdapter({ moduleLoader: loader }).loadConfigAsync?.({
			...context,
			listFiles: () => ["/project/tailwind.css"],
			readFile: (file: string) =>
				file.endsWith("tailwind.css") ? '@import "tailwindcss";' : undefined,
		});

		expect(config?.tokenCatalog?.groups).toMatchInlineSnapshot(`
			{
			  "colors": {
			    "brand": "#123456",
			  },
			  "spacing": {
			    "card": "17px",
			  },
			}
		`);
	});

	test("uses the official Panda theme while parsing custom token references", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				return packageName === "@pandacss/config"
					? ({
							loadConfig: async () => ({
								config: {
									theme: {
										tokens: {
											colors: { brand: { "500": { value: "#123456" } } },
										},
									},
								},
							}),
						} as never)
					: undefined;
			},
			async importFile() {
				return undefined;
			},
		};
		const adapter = createPandaAdapter({ moduleLoader: loader });
		const config = await adapter.loadConfigAsync?.({
			...context,
			readFile: (file) => (file.endsWith("panda.config.ts") ? "export default {}" : undefined),
		});
		const source =
			'import { css } from "styled-system/css"; const card = css({ color: "brand.500" });';
		const parsed = adapter.parse(source, {
			...context,
			source,
			config: config!,
		});

		expect(config?.values.officialConfigPackage).toBe("@pandacss/config");
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
		expect(parsed.matches[0]?.program).toMatchInlineSnapshot(`
			{
			  "canonicalization": undefined,
			  "compositions": [],
			  "declarations": [
			    {
			      "conditions": [],
			      "property": "color",
			      "value": {
			        "authored": "brand.500",
			        "kind": "token",
			        "ref": "brand.500",
			        "resolved": "#123456",
			      },
			    },
			  ],
			  "emissionHints": [],
			  "plugins": [],
			  "residuals": [],
			  "rules": [
			    {
			      "children": [],
			      "conditions": [],
			      "declarations": [
			        {
			          "conditions": [],
			          "property": "color",
			          "value": {
			            "authored": "brand.500",
			            "kind": "token",
			            "ref": "brand.500",
			            "resolved": "#123456",
			          },
			        },
			      ],
			      "kind": "style",
			      "order": 0,
			      "source": {
			        "adapter": "panda",
			        "end": 81,
			        "file": "src/App.tsx",
			        "start": 54,
			      },
			    },
			  ],
			  "runtime": undefined,
			  "schema": "pandwind.style-program/4",
			  "source": {
			    "adapter": "panda",
			    "end": 81,
			    "file": "src/App.tsx",
			    "pattern": "css",
			    "start": 54,
			  },
			  "sourceMap": [
			    {
			      "adapter": "panda",
			      "end": 81,
			      "file": "src/App.tsx",
			      "start": 54,
			    },
			  ],
			  "themes": [],
			}
		`);
	});

	test("loads UnoCSS theme values through the official config and generator packages", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				if (packageName === "@unocss/config")
					return {
						loadConfig: async () => ({
							config: { theme: { colors: { brand: "#123456" }, spacing: { card: "17px" } } },
							sources: [],
						}),
					} as never;
				return {
					createGenerator: async () => ({
						generate: async () => ({ css: ".text-brand{color:#123456}" }),
					}),
				} as never;
			},
			async importFile() {
				return undefined;
			},
		};
		const config = await createUnoCssAdapter({ moduleLoader: loader }).loadConfigAsync?.(context);

		expect(config?.tokenCatalog?.groups).toMatchInlineSnapshot(`
			{
			  "colors": {
			    "brand": "#123456",
			  },
			  "spacing": {
			    "card": "17px",
			  },
			}
		`);
	});

	test("loads Tokenami token maps from its official config package", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage() {
				return { createConfig: (value: unknown) => value } as never;
			},
			async importFile() {
				return { default: { tokens: { colors: { brand: { value: "#123456" } } } } } as never;
			},
		};
		const config = await createTokenamiAdapter({ moduleLoader: loader }).loadConfigAsync?.(context);

		expect(config?.tokenCatalog?.groups).toMatchInlineSnapshot(`
			{
			  "colors": {
			    "brand": "#123456",
			  },
			}
		`);
	});

	test("lets object targets preserve their own native token paths", () => {
		const catalog = TokenCatalog.fromGroups({
			colors: { "brand.500": "#123456" },
		})?.contract;
		const adapters = createBuiltinCodemodCatalog().registry;
		const emit = (id: CodemodAdapterId) => {
			const adapter = adapters.get(id);
			expect(adapter?.tokenPolicy).toBeDefined();
			const config = { adapter: id, files: [], values: {}, tokenCatalog: catalog };
			const emitContext = { ...context, config, mode: "safe" as const, index: 0 };
			const program = adapter!.tokenPolicy!.preserve(literalProgram, emitContext);
			return adapter!.emit(program, emitContext).text;
		};

		expect(emit(CodemodAdapterId.ChakraUi)).toMatchInlineSnapshot(`
			"defaultSystem.css({ color: "brand.500" })"
		`);
		expect(emit(CodemodAdapterId.Panda)).toMatchInlineSnapshot(`
			"css({ color: "brand.500" })"
		`);
		expect(emit(CodemodAdapterId.Pandwind)).toMatchInlineSnapshot(`
			"css.class({ color: "$brand-500" })"
		`);
	});

	test("reuses generated Pandwind preset tokens during an async migration", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage() {
				return undefined;
			},
			async importFile(file) {
				return file === "/project/src/preset.ts"
					? ({
							customPreset: {
								tokens: { colors: { brand: { "500": "#123456" } } },
							},
						} as never)
					: undefined;
			},
		};
		const builtin = createBuiltinCodemodCatalog();
		const target = createPandwindAdapter({ moduleLoader: loader });
		const registry = createStyleAdapterRegistry([
			builtin.registry.get(CodemodAdapterId.Emotion)!,
			target,
		]);
		const source =
			'import { css } from "@emotion/css";\nexport const card = css({ color: "#123456" });';
		const result = await runAdapterMigrationAsync(source, {
			from: CodemodAdapterId.Emotion,
			to: CodemodAdapterId.Pandwind,
			file: "src/Card.tsx",
			root: "/project",
			readFile: (file) => {
				if (file === "/project/src/pandwind.interop.json")
					return JSON.stringify({ generatedFrom: { bridge: "bridge.ts" } });
				if (file === "/project/src/bridge.ts")
					return 'import { customPreset } from "./preset"; export const bridge = { preset: customPreset };';
				return undefined;
			},
			adapterRegistry: registry,
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.validations.every((validation) => validation.valid)).toBe(true);
		expect(result.code).toContain('color: "$brand-500"');
		expect(result.code).not.toContain('color: "#123456"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "$brand-500" });"
		`);
	});

	test("reports an explicit residual when generated Pandwind preset loading fails", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage() {
				return undefined;
			},
			async importFile() {
				return undefined;
			},
		};
		const builtin = createBuiltinCodemodCatalog();
		const registry = createStyleAdapterRegistry([
			builtin.registry.get(CodemodAdapterId.Emotion)!,
			createPandwindAdapter({ moduleLoader: loader }),
		]);
		const result = await runAdapterMigrationAsync(
			'import { css } from "@emotion/css"; css({ color: "red" });',
			{
				from: CodemodAdapterId.Emotion,
				to: CodemodAdapterId.Pandwind,
				file: "src/Card.tsx",
				root: "/project",
				readFile: (file) => {
					if (file === "/project/src/pandwind.interop.json")
						return JSON.stringify({ generatedFrom: { bridge: "bridge.ts" } });
					if (file === "/project/src/bridge.ts") return "export const bridge = {};";
					return undefined;
				},
				adapterRegistry: registry,
			},
		);

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toMatchInlineSnapshot(`
		[
		  {
		    "hint": "Pandwind interop loading failed: generated bridge does not expose a loadable preset",
		    "kind": "configuration",
		    "text": "Pandwind generated design-system metadata",
		  },
		]
		`);
	});

	test("lets class targets preserve verified custom utility names", () => {
		const tokenCatalog = TokenCatalog.fromGroups({
			colors: { "brand.500": "#123456" },
		})?.contract;
		const emit = (adapter: StyleAdapter) =>
			adapter.emit(literalProgram, {
				...context,
				config: { adapter: adapter.id, files: [], values: {}, tokenCatalog },
				mode: "safe",
				index: 0,
			}).text;

		const tailwind = emit(createTailwindAdapter({ moduleLoader: null }));
		const uno = emit(createUnoCssAdapter({ moduleLoader: null }));
		expect(tailwind).toBe('"text-brand-500"');
		expect(uno).toBe('"text-brand-500"');
		expect(JSON.parse(tailwind)).toMatchInlineSnapshot(`"text-brand-500"`);
		expect(JSON.parse(uno)).toMatchInlineSnapshot(`"text-brand-500"`);
	});

	test("derives Chakra shorthand and property vocabulary from the official system", async () => {
		const system = {
			$$chakra: true as const,
			_config: {
				theme: { tokens: { spacing: { card: { value: "13px" } } } },
			},
			properties: new Set(["css", "customSpacing"]),
			utility: { shorthands: new Map([["customSpacing", "padding"]]) },
			token: { var: (path: string) => `var(--chakra-${path.replaceAll(".", "-")})` },
		};
		const loader: ProjectModuleLoader = {
			async importPackage() {
				return { isValidSystem: (value: unknown) => value === system } as never;
			},
			async importFile() {
				return { default: system } as never;
			},
		};
		const adapter = createChakraAdapter({ moduleLoader: loader });
		const config = await adapter.loadConfigAsync?.({
			...context,
			file: "src/App.tsx",
			readFile: () => "export default {}",
			listFiles: () => ["/project/src/theme.ts"],
		});
		const source = '<Box customSpacing="card" />';
		const parsed = adapter.parse(source, { ...context, source, config: config! });

		expect(config?.values.officialConfigPackage).toBe("@chakra-ui/react");
		expect(parsed.matches).toHaveLength(1);
		expect(parsed.matches[0]?.program.declarations).toMatchInlineSnapshot(`
			[
			  {
			    "conditions": [],
			    "property": "padding",
			    "value": {
			      "authored": "card",
			      "kind": "token",
			      "ref": "card",
			      "resolved": "13px",
			    },
			  },
			]
		`);
		expect(parsed.matches[0]?.program.declarations[0]?.property).toBe("padding");
	});

	test("uses the official MUI theme for custom spacing, palette, and radius values", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				return packageName === "@mui/system"
					? ({
							createTheme: (config: Record<string, unknown>) => ({
								...config,
								spacing: (factor: number) => `${factor * 5}px`,
							}),
						} as never)
					: undefined;
			},
			async importFile() {
				return {
					default: {
						palette: { brand: { main: "#123456" } },
						shape: { borderRadius: 6 },
					},
				} as never;
			},
		};
		const adapter = createMuiAdapter({ moduleLoader: loader });
		const config = await adapter.loadConfigAsync?.({
			...context,
			file: "src/App.tsx",
			readFile: () => "export default {}",
			listFiles: () => ["/project/src/theme.ts"],
		});
		const source = '<Box sx={{ p: 2, color: "brand.main", borderRadius: 2 }} />';
		const parsed = adapter.parse(source, { ...context, source, config: config! });

		expect(config?.values.officialConfigPackage).toBe("@mui/system");
		expect(config?.tokenCatalog?.groups).toMatchInlineSnapshot(`
			{
			  "colors": {
			    "brand.main": "#123456",
			  },
			  "radii": {
			    "": "6",
			  },
			}
		`);
		expect(parsed.matches[0]?.program.declarations).toMatchInlineSnapshot(`
			[
			  {
			    "conditions": [],
			    "property": "padding",
			    "value": {
			      "kind": "literal",
			      "value": "10px",
			    },
			  },
			  {
			    "conditions": [],
			    "property": "borderRadius",
			    "value": {
			      "kind": "literal",
			      "value": "12px",
			    },
			  },
			  {
			    "conditions": [],
			    "property": "color",
			    "value": {
			      "kind": "literal",
			      "value": "#123456",
			    },
			  },
			]
		`);
		expect(parsed.matches[0]?.program.declarations.map(({ property }) => property)).toEqual([
			"padding",
			"borderRadius",
			"color",
		]);
	});

	test("uses the official Mantine theme for custom colors, spacing, and typography", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage() {
				return { createTheme: (config: Record<string, unknown>) => config } as never;
			},
			async importFile() {
				return {
					default: {
						colors: { brand: ["#123456"] },
						spacing: { card: "13px" },
						fontSizes: { hero: "2rem" },
					},
				} as never;
			},
		};
		const adapter = createMantineAdapter({ moduleLoader: loader });
		const config = await adapter.loadConfigAsync?.({
			...context,
			file: "src/App.tsx",
			readFile: () => "export default {}",
			listFiles: () => ["/project/src/theme.ts"],
		});
		const source = '<Box c="brand.0" p="card" fz="hero" />';
		const parsed = adapter.parse(source, { ...context, source, config: config! });

		expect(config?.values.officialConfigPackage).toBe("@mantine/core");
		expect(config?.tokenCatalog?.groups).toMatchInlineSnapshot(`
			{
			  "colors": {
			    "brand.0": "#123456",
			  },
			  "fontSizes": {
			    "hero": "2rem",
			  },
			  "spacing": {
			    "card": "13px",
			  },
			}
		`);
		expect(parsed.matches[0]?.program.declarations).toMatchInlineSnapshot(`
			[
			  {
			    "conditions": [],
			    "property": "padding",
			    "value": {
			      "kind": "literal",
			      "value": "13px",
			    },
			  },
			  {
			    "conditions": [],
			    "property": "color",
			    "value": {
			      "kind": "literal",
			      "value": "#123456",
			    },
			  },
			  {
			    "conditions": [],
			    "property": "fontSize",
			    "value": {
			      "kind": "literal",
			      "value": "2rem",
			    },
			  },
			]
		`);
		expect(parsed.matches[0]?.program.declarations.map(({ property }) => property)).toEqual([
			"padding",
			"color",
			"fontSize",
		]);
	});
});
