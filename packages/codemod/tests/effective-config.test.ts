import { describe, expect, test } from "vitest";
import {
	createChakraAdapter,
	createPandaAdapter,
	createPandwindAdapter,
	createStyleAdapterRegistry,
	createTokenamiAdapter,
	runAdapterMigrationAsync,
} from "../src/swap/index.ts";
import { loadPandaTheme } from "../src/swap/adapters/panda/theme.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";
import { PandaJsxStylePropsModeTag } from "../src/swap/adapters/panda/style-props.ts";

describe("effective ecosystem configuration", () => {
	test("does not invent Panda preset text styles when the official config removes presets", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				if (packageName !== "@pandacss/config") return undefined;
				return {
					loadConfig: async () => ({
						config: {
							presets: [],
							theme: {
								tokens: { colors: { brand: { value: "#123456" } } },
							},
						},
					}),
				} as never;
			},
			async importFile() {
				throw new Error("direct config import must not run");
			},
		};

		const theme = await loadPandaTheme("/project/panda.config.ts", loader);

		expect(theme.textStyles.has("md")).toBe(false);
		expect(theme.utilityCatalog.has("px")).toBe(false);
		expect(theme.utilityCatalog.resolveProperty("px")).toBeUndefined();
		expect(theme.tokenCatalog?.groups).toMatchInlineSnapshot(`
			{
			  "colors": {
			    "brand": "#123456",
			  },
			}
		`);
	});

	test("resolves Panda utility aliases from the effective official config", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				if (packageName !== "@pandacss/config") return undefined;
				return {
					loadConfig: async () => ({
						config: {
							utilities: {
								paddingInline: { property: "paddingX", shorthand: "px" },
								cardInset: { property: "inset", shorthand: "ci" },
							},
						},
					}),
				} as never;
			},
			async importFile() {
				throw new Error("direct config import must not run");
			},
		};

		const theme = await loadPandaTheme("/project/panda.config.ts", loader);

		expect(theme.utilityCatalog.resolveProperty("px")).toBe("paddingX");
		expect(theme.utilityCatalog.resolveProperty("ci")).toBe("inset");
		expect(theme.utilityCatalog.has("notAProjectUtility")).toBe(false);
		expect([...theme.utilityCatalog.propertyAliases.entries()]).toMatchInlineSnapshot(`
			[
			  [
			    "px",
			    "paddingX",
			  ],
			  [
			    "ci",
			    "inset",
			  ],
			]
		`);
	});

	test("extracts custom Panda utilities in the dependency-free fallback", async () => {
		const configPath = "/project/panda.config.ts";
		const theme = await loadPandaTheme(
			configPath,
			{
				async importPackage() {
					return undefined;
				},
				async importFile() {
					return undefined;
				},
			},
			(file) =>
				file === configPath
					? "export default { utilities: { extend: { cardInset: { property: 'inset', shorthand: 'ci' } } } }"
					: undefined,
		);

		expect(theme.utilityCatalog.resolveProperty("ci")).toBe("inset");
		expect(theme.utilityCatalog).toMatchInlineSnapshot(`
			PandaUtilityCatalog {
			  "propertyAliases": Map {
			    "ci" => "inset",
			  },
			  "utilityNames": Set {
			    "cardInset",
			    "ci",
			  },
			}
		`);
	});

	test("keeps the source fallback visible when the official Panda loader fails", async () => {
		const configPath = new URL("./fixtures/panda-fixture-config.ts", import.meta.url).pathname;
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				if (packageName !== "@pandacss/config") return undefined;
				return {
					loadConfig: async () => {
						throw new Error("plugin could not be evaluated");
					},
				} as never;
			},
			async importFile() {
				return undefined;
			},
		};

		const theme = await loadPandaTheme(configPath, loader);

		expect(theme.officialConfigError).toContain("plugin could not be evaluated");
		expect(theme.tokenVars.get("neutral.700")).toBe("--colors-neutral-700");
	});

	test("publishes an explicit adapter residual for an unevaluable Panda project config", async () => {
		const adapter = createPandaAdapter({
			moduleLoader: {
				async importPackage() {
					return {
						loadConfig: async () => {
							throw new Error("custom preset failed");
						},
					} as never;
				},
				async importFile() {
					return undefined;
				},
			},
		});
		const config = await adapter.loadConfigAsync?.({
			file: "src/App.tsx",
			source: "export default {};",
			root: "/project",
			readFile: () => "export default {};",
			listFiles: () => ["/project/panda.config.ts"],
		});

		expect(config?.residuals).toEqual([
			expect.objectContaining({
				kind: "configuration",
				text: "Panda project configuration",
			}),
		]);
	});

	test("resolves Panda JSX props through the official validator and project conditions", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				if (packageName === "@pandacss/config")
					return {
						loadConfig: async () => ({
							config: {
								jsxStyleProps: PandaJsxStylePropsModeTag.All,
								conditions: { _night: "[data-theme=night] &" },
							},
						}),
					} as never;
				if (packageName === "@pandacss/is-valid-prop")
					return { isCssProperty: (value: string) => value === "color" } as never;
				return undefined;
			},
			async importFile() {
				return undefined;
			},
		};

		const theme = await loadPandaTheme("/project/panda.config.ts", loader);

		expect(theme.jsxStyleProps.evidence).toMatchInlineSnapshot(`
			[
			  "official-package",
			]
		`);
		expect(theme.jsxStyleProps.matches("color")).toBe(true);
		expect(theme.jsxStyleProps.matches("_night")).toBe(true);
		expect(theme.jsxStyleProps.matches("notAStyleProp")).toBe(false);
	});

	test("uses generated Panda SystemProperties when the official validator is unavailable", async () => {
		const generated = `
			export interface SystemProperties {
				brandShadow?: string;
			}
			export interface Conditions {
				_night?: string;
			}
		`;
		const theme = await loadPandaTheme(
			"/project/panda.config.ts",
			{
				async importPackage() {
					return undefined;
				},
				async importFile() {
					return undefined;
				},
			},
			(file) => (file.endsWith("styled-system/types/system.d.ts") ? generated : undefined),
		);

		expect(theme.jsxStyleProps.evidence).toMatchInlineSnapshot(`
			[
			  "generated-system",
			]
		`);
		expect(theme.jsxStyleProps.matches("brandShadow")).toBe(true);
		expect(theme.jsxStyleProps.matches("_night")).toBe(true);
		expect(theme.jsxStyleProps.matches("customComponentProp")).toBe(false);
	});

	test("uses generated custom Panda props in the migration, while preserving host props", async () => {
		const generated = `export interface SystemProperties { brandShadow?: string; }`;
		const source = `import { styled } from "styled-system/jsx";
export const Button = () => <styled.button brandShadow="soft" data-testid="button" />;`;
		const result = await runAdapterMigrationAsync(source, {
			from: "panda",
			to: "pandwind",
			file: "src/Button.tsx",
			root: "/project",
			adapterRegistry: createStyleAdapterRegistry([
				createPandaAdapter({
					moduleLoader: {
						async importPackage(packageName) {
							if (packageName === "@pandacss/config")
								return { loadConfig: async () => ({ config: {} }) } as never;
							return undefined;
						},
						async importFile() {
							return undefined;
						},
					},
				}),
				createPandwindAdapter({ moduleLoader: null }),
			]),
			readFile: (file) => {
				if (file.endsWith("panda.config.ts")) return "export default {};";
				if (file.endsWith("styled-system/types/system.d.ts")) return generated;
				return undefined;
			},
			listFiles: () => ["/project/panda.config.ts", "/project/styled-system/types/system.d.ts"],
		});

		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('brandShadow: "soft"');
		expect(result.code).toContain('data-testid="button"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();

			export const Button = () => <button data-testid="button" className={css.class({ brandShadow: "soft" })} />;"
		`);
	});

	test("honors Panda jsxStyleProps none and minimal modes", async () => {
		const load = async (mode: PandaJsxStylePropsModeTag) =>
			loadPandaTheme("/project/panda.config.ts", {
				async importPackage(packageName) {
					if (packageName !== "@pandacss/config") return undefined;
					return { loadConfig: async () => ({ config: { jsxStyleProps: mode } }) } as never;
				},
				async importFile() {
					return undefined;
				},
			});
		const none = await load(PandaJsxStylePropsModeTag.None);
		const minimal = await load(PandaJsxStylePropsModeTag.Minimal);

		expect(none.jsxStyleProps.matches("css")).toBe(false);
		expect(none.jsxStyleProps.matches("color")).toBe(false);
		expect(minimal.jsxStyleProps.matches("css")).toBe(true);
		expect(minimal.jsxStyleProps.matches("color")).toBe(false);
	});

	test("does not invent Panda JSX style props when no effective config is available", () => {
		const adapter = createPandaAdapter();
		const source = 'export const Button = () => <styled.button css={{ color: "red" }} />;';
		const config = adapter.loadConfig({ file: "src/Button.tsx", source, root: "/project" });
		const parsed = adapter.parse(source, {
			file: "src/Button.tsx",
			source,
			root: "/project",
			config,
		});

		expect(parsed.matches).toHaveLength(0);
		expect(parsed.residuals).toEqual([]);
		expect(adapter.officialApi.apis.map(({ name }) => name)).toContain("jsx-style-props");
	});

	test("loads Chakra systems from discovered theme modules and preserves custom conditions", async () => {
		const system = {
			$$chakra: true as const,
			_config: {
				conditions: { midnight: "[data-theme=midnight] &" },
				theme: { tokens: { colors: { brand: { "500": { value: "#123456" } } } } },
			},
			token: { var: (path: string) => `var(--chakra-${path.replaceAll(".", "-")})` },
			isValidProperty: (property: string) => ["css", "_midnight", "color"].includes(property),
		};
		const loader: ProjectModuleLoader = {
			async importPackage() {
				return { isValidSystem: (value: unknown) => value === system } as never;
			},
			async importFile(path) {
				return path.endsWith("src/theme/index.ts") ? ({ default: system } as never) : undefined;
			},
		};
		const adapter = createChakraAdapter({ moduleLoader: loader });
		const config = await adapter.loadConfigAsync?.({
			file: "src/App.tsx",
			source: '<Box css={{ _midnight: { color: "brand.500" } }} />',
			root: "/project",
			readFile: () => "",
			listFiles: () => ["/project/src/theme/index.ts"],
		});
		const parsed = adapter.parse('<Box css={{ _midnight: { color: "brand.500" } }} />', {
			file: "src/App.tsx",
			source: '<Box css={{ _midnight: { color: "brand.500" } }} />',
			root: "/project",
			config: config!,
		});

		expect(config?.files).toContain("/project/src/theme/index.ts");
		const color = parsed.matches[0]?.program.declarations.find(
			(declaration) => declaration.property === "color",
		);
		expect(color).toEqual(
			expect.objectContaining({
				conditions: [
					expect.objectContaining({
						kind: "selector",
						name: "midnight",
						value: "[data-theme=midnight] &",
					}),
				],
			}),
		);
		expect(parsed.matches[0]?.program.declarations).toMatchInlineSnapshot(`
			[
			  {
			    "conditions": [
			      {
			        "kind": "selector",
			        "name": "midnight",
			        "raw": "_midnight",
			        "value": "[data-theme=midnight] &",
			      },
			    ],
			    "property": "color",
			    "value": {
			      "authored": "brand.500",
			      "kind": "token",
			      "ref": "brand.500",
			      "resolved": "#123456",
			    },
			  },
			]
		`);
		expect(parsed.matches[0]?.program).toMatchInlineSnapshot(`
			{
			  "canonicalization": undefined,
			  "compositions": [],
			  "declarations": [
			    {
			      "conditions": [
			        {
			          "kind": "selector",
			          "name": "midnight",
			          "raw": "_midnight",
			          "value": "[data-theme=midnight] &",
			        },
			      ],
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
			          "conditions": [
			            {
			              "kind": "selector",
			              "name": "midnight",
			              "raw": "_midnight",
			              "value": "[data-theme=midnight] &",
			            },
			          ],
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
			        "adapter": "chakra-ui",
			        "file": "src/App.tsx",
			        "hostAttribute": "jsx-style-props",
			        "hostOpenTag": "<Box css={{ _midnight: { color: "brand.500" } }} />",
			        "hostStyleAttributes": [
			          "css={{ _midnight: { color: "brand.500" } }}",
			        ],
			        "start": 0,
			      },
			    },
			  ],
			  "runtime": undefined,
			  "schema": "pandwind.style-program/4",
			  "source": {
			    "adapter": "chakra-ui",
			    "file": "src/App.tsx",
			    "hostAttribute": "jsx-style-props",
			    "hostOpenTag": "<Box css={{ _midnight: { color: "brand.500" } }} />",
			    "hostStyleAttributes": [
			      "css={{ _midnight: { color: "brand.500" } }}",
			    ],
			    "start": 0,
			  },
			  "sourceMap": [
			    {
			      "adapter": "chakra-ui",
			      "file": "src/App.tsx",
			      "hostAttribute": "jsx-style-props",
			      "hostOpenTag": "<Box css={{ _midnight: { color: "brand.500" } }} />",
			      "hostStyleAttributes": [
			        "css={{ _midnight: { color: "brand.500" } }}",
			      ],
			      "start": 0,
			    },
			  ],
			  "themes": [],
			}
		`);
	});

	test("reports a discovered but unloadable Tokenami config instead of using defaults", async () => {
		const adapter = createTokenamiAdapter({
			moduleLoader: {
				async importPackage() {
					return {
						createConfig: () => {
							throw new Error("config import failed");
						},
					} as never;
				},
				async importFile() {
					return undefined;
				},
			},
		});
		const config = await adapter.loadConfigAsync?.({
			file: "src/App.tsx",
			source: "export default {};",
			root: "/project",
			readFile: () => undefined,
			listFiles: () => ["/project/tokenami.config.ts"],
		});

		expect(config?.residuals).toEqual([
			expect.objectContaining({
				kind: "configuration",
				text: "Tokenami project configuration",
			}),
		]);
	});

	test("resolves a deep Panda token alias chain without recursion", async () => {
		const depth = 2_000;
		const colors: Record<string, { value: string }> = {};
		for (let index = 0; index < depth; index++) {
			colors[`level-${index}`] = {
				value: index === depth - 1 ? "#123456" : `{colors.level-${index + 1}}`,
			};
		}
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				if (packageName !== "@pandacss/config") return undefined;
				return {
					loadConfig: async () => ({ config: { presets: [], theme: { tokens: { colors } } } }),
				} as never;
			},
			async importFile() {
				throw new Error("direct config import must not run");
			},
		};

		const theme = await loadPandaTheme("/project/panda.config.ts", loader);

		expect(theme.tokens.colors?.[`level-0`]).toBe("#123456");
	});
});
