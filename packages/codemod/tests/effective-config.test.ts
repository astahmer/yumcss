import { describe, expect, test } from "vitest";
import {
	createChakraAdapter,
	createPandaAdapter,
	createTokenamiAdapter,
} from "../src/swap/index.ts";
import { loadPandaTheme } from "../src/swap/adapters/panda/theme.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";

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
		expect(theme.tokenCatalog?.groups).toMatchInlineSnapshot(`
			{
			  "colors": {
			    "brand": "#123456",
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

	test("loads Chakra systems from discovered theme modules and preserves custom conditions", async () => {
		const system = {
			$$chakra: true as const,
			_config: {
				conditions: { midnight: "[data-theme=midnight] &" },
				theme: { tokens: { colors: { brand: { "500": { value: "#123456" } } } } },
			},
			token: { var: (path: string) => `var(--chakra-${path.replaceAll(".", "-")})` },
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
