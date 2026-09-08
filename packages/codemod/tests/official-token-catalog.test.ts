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
import type { StyleDeclaration } from "../src/swap/semantic-ir.ts";

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
			"css.class({ color: "brand.500" })"
		`);
		const preserve = (adapter: StyleAdapter) =>
			adapter.tokenPolicy!.preserve(literalProgram, {
				...context,
				config: { adapter: adapter.id, files: [], values: {}, tokenCatalog: catalog },
				mode: "safe",
				index: 0,
			});
		expect(preserve(createMuiAdapter({ moduleLoader: null })).declarations[0]?.value).toMatchObject(
			{
				authored: "brand.500",
				kind: "token",
			},
		);
		expect(
			preserve(createMantineAdapter({ moduleLoader: null })).declarations[0]?.value,
		).toMatchObject({ authored: "var(--mantine-color-brand-500)", kind: "token" });
		const stitches = adapters.get(CodemodAdapterId.Stitches);
		expect(stitches?.tokenPolicy).toBeDefined();
		expect(preserve(stitches! as StyleAdapter).declarations[0]?.value).toMatchObject({
			authored: "$colors$brand$500",
			kind: "token",
		});
	});

	test("preserves color tokens when the declaration uses the CSS background property", () => {
		const catalog = TokenCatalog.fromGroups({ colors: { brand: "#123456" } })?.contract;
		const adapter = createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.Pandwind);
		expect(adapter?.tokenPolicy).toBeDefined();
		const program = styleProgramFromRules([
			{
				kind: "style",
				conditions: [],
				declarations: [
					{ conditions: [], property: "background", value: { kind: "literal", value: "#123456" } },
				],
				children: [],
				order: 0,
			},
		]);
		const config = {
			adapter: CodemodAdapterId.Pandwind,
			files: [],
			values: {},
			tokenCatalog: catalog,
		};
		const emitContext = { ...context, config, mode: "safe" as const, index: 0 };
		const preserved = adapter!.tokenPolicy!.preserve(program, emitContext);

		expect(preserved.declarations[0]?.value).toMatchObject({
			kind: "token",
			ref: "brand",
			resolved: "#123456",
		});
		expect(adapter!.emit(preserved, emitContext).text).toContain('background: "brand"');
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
								tokens: { colors: { $brand: "#123456" } },
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
		expect(result.code).toContain('color: "brand"');
		expect(result.code).not.toContain('color: "#123456"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();

			export const card = css.class({ color: "brand" });"
		`);
	});

	test("recovers Tailwind token names from namespaced CSS variables", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage() {
				return {
					__unstable__loadDesignSystem: async () => ({
						theme: {
							entries: () => [
								["--color-blue-500", { value: "#3b82f6" }],
								["--color-white", { value: "#fff" }],
							],
						},
						getClassList: () => [["bg-blue-500"], ["text-white"]],
						candidatesToCss: (candidates: readonly string[]) =>
							candidates.map((candidate) =>
								candidate === "bg-blue-500"
									? ".bg-blue-500{background-color:var(--color-blue-500)}"
									: ".text-white{color:var(--color-white)}",
							),
					}),
				} as never;
			},
			async importFile() {
				return undefined;
			},
		};
		const adapter = createTailwindAdapter({ moduleLoader: loader });
		const target = createPandwindAdapter({ moduleLoader: loader });
		const result = await runAdapterMigrationAsync(
			'import "./styles.css";\nexport const card = <div className="bg-blue-500 text-white" />;',
			{
				from: CodemodAdapterId.Tailwind,
				to: CodemodAdapterId.Pandwind,
				file: "src/Card.tsx",
				root: "/project",
				readFile: (file) =>
					file === "/project/src/styles.css" ? '@import "tailwindcss";' : undefined,
				listFiles: () => ["/project/src/styles.css", "/project/src/Card.tsx"],
				moduleLoader: loader,
				adapterRegistry: createStyleAdapterRegistry([adapter, target]),
				project: { cssModule: "pandwind/css.ts" },
			},
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('backgroundColor: "blue-500"');
		expect(result.code).toContain('color: "white"');
		expect(result.code).not.toContain("var(--color-blue-500)");
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

	test("remaps source token IR values through class target catalogs", () => {
		const tokenCatalog = TokenCatalog.fromGroups({
			colors: { "brand.500": "#123456" },
		})?.contract;
		const sourceTokenProgram = styleProgramFromRules([
			{
				kind: "style",
				conditions: [],
				declarations: [
					{
						conditions: [],
						property: "color",
						value: {
							kind: "token",
							ref: "source.brand",
							authored: "source.brand",
							resolved: "#123456",
						},
					},
				],
				children: [],
				order: 0,
			},
		]);
		const emit = (adapter: StyleAdapter) =>
			adapter.emit(sourceTokenProgram, {
				...context,
				config: { adapter: adapter.id, files: [], values: {}, tokenCatalog },
				mode: "safe",
				index: 0,
			});

		expect(emit(createTailwindAdapter({ moduleLoader: null })).text).toBe('"text-brand-500"');
		expect(emit(createUnoCssAdapter({ moduleLoader: null })).text).toBe('"text-brand-500"');
	});

	test("selects only officially verified Tailwind property-aware candidates", () => {
		const adapter = createTailwindAdapter({ moduleLoader: null });
		const resolver = {
			resolve: (token: string) => {
				if (token === "p-[1rem]")
					return [
						{ conditions: [], property: "padding", value: { kind: "literal", value: "1rem" } },
					];
				if (token === "text-[red]")
					return [
						{ conditions: [], property: "fontSize", value: { kind: "literal", value: "red" } },
					];
				return undefined;
			},
		};
		const emit = (property: string, value: string) =>
			adapter.emit(
				styleProgramFromRules([
					{
						kind: "style",
						conditions: [],
						declarations: [{ conditions: [], property, value: { kind: "literal", value } }],
						children: [],
						order: 0,
					},
				]),
				{
					...context,
					config: {
						adapter: adapter.id,
						files: [],
						values: { tailwindResolver: resolver },
					},
					mode: "safe",
					index: 0,
				},
			);

		const padding = emit("padding", "1rem");
		const color = emit("color", "red");
		expect(padding.text).toBe('"p-[1rem]"');
		expect(padding.emissionDecisions).toMatchObject([
			{
				representation: "property-aware",
				reason: "verified-property-aware",
				verified: true,
			},
		]);
		expect(color.text).toBe('"[color:red]"');
		expect(color.emissionDecisions).toMatchObject([
			{
				representation: "arbitrary-property",
				reason: "canonical-css-mismatch",
				verified: false,
			},
		]);
	});

	test("uses the official Tailwind candidate catalog for custom utilities", () => {
		const adapter = createTailwindAdapter({ moduleLoader: null });
		const resolver = {
			candidates: () => ["btn-brand", "text-brand"],
			resolve: (token: string) =>
				token === "btn-brand"
					? [
							{
								conditions: [],
								property: "backgroundColor",
								value: { kind: "literal" as const, value: "#123456" },
							},
						]
					: undefined,
		};
		const result = adapter.emit(
			styleProgramFromRules([
				{
					kind: "style",
					conditions: [],
					declarations: [
						{
							conditions: [],
							property: "backgroundColor",
							value: { kind: "literal", value: "#123456" },
						},
					],
					children: [],
					order: 0,
				},
			]),
			{
				...context,
				config: { adapter: adapter.id, files: [], values: { tailwindResolver: resolver } },
				mode: "safe",
				index: 0,
			},
		);

		expect(result.text).toBe('"btn-brand"');
		expect(result.emissionDecisions).toMatchObject([
			{
				candidate: "btn-brand",
				representation: "token",
				verified: true,
				reason: "exact-token",
			},
		]);
	});

	test("covers verified Tailwind utility families, logical sides, and fallback values", () => {
		const adapter = createTailwindAdapter({ moduleLoader: null });
		const hover = { kind: "pseudo" as const, name: "hover" };
		const verified: Readonly<Record<string, StyleDeclaration>> = {
			"m-[-1rem]": {
				conditions: [],
				property: "margin",
				value: { kind: "literal", value: "-1rem" },
			},
			"gap-x-[2rem]": {
				conditions: [],
				property: "columnGap",
				value: { kind: "literal", value: "2rem" },
			},
			"bg-[rebeccapurple]": {
				conditions: [],
				property: "backgroundColor",
				value: { kind: "literal", value: "rebeccapurple" },
			},
			"rounded-ss-[8px]": {
				conditions: [],
				property: "borderStartStartRadius",
				value: { kind: "literal", value: "8px" },
			},
			"w-[37px]": { conditions: [], property: "width", value: { kind: "literal", value: "37px" } },
			"hover:ps-[1rem]": {
				conditions: [hover],
				property: "paddingInlineStart",
				value: { kind: "literal", value: "1rem" },
			},
		};
		const result = adapter.emit(
			styleProgramFromRules([
				{
					kind: "style",
					conditions: [],
					declarations: [
						...Object.values(verified),
						{ conditions: [], property: "--brand", value: { kind: "literal", value: "red" } },
					],
					children: [],
					order: 0,
				},
			]),
			{
				...context,
				config: {
					adapter: adapter.id,
					files: [],
					values: {
						tailwindResolver: { resolve: (token: string) => verified[token] && [verified[token]] },
					},
				},
				mode: "safe",
				index: 0,
			},
		);

		expect(result.text).toBe(
			'"[--brand:red] m-[-1rem] bg-[rebeccapurple] rounded-ss-[8px] gap-x-[2rem] hover:ps-[1rem] w-[37px]"',
		);
		expect(result.emissionDecisions).toHaveLength(7);
		expect(result.emissionDecisions?.filter((decision) => decision.verified)).toHaveLength(6);
		expect(
			result.emissionDecisions?.some(
				(decision) => decision.reason === "custom-property" && !decision.verified,
			),
		).toBe(true);
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
						typography: { h1: { fontSize: "3rem", fontWeight: 700, lineHeight: 1.2 } },
						shadows: { card: "0 1px 2px #0003" },
						zIndex: { modal: 1300 },
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
		const source =
			'<Box sx={{ p: 2, color: "brand.main", borderRadius: 2, fontSize: "typography.h1.fontSize", boxShadow: "card", zIndex: "modal" }} />';
		const parsed = adapter.parse(source, { ...context, source, config: config! });

		expect(config?.values.officialConfigPackage).toBe("@mui/system");
		expect(config?.tokenCatalog?.groups).toMatchInlineSnapshot(`
			{
			  "colors": {
			    "brand.main": "#123456",
			  },
			  "fontSizes": {
			    "h1": "3rem",
			  },
			  "fontWeights": {
			    "h1": "700",
			  },
			  "lineHeights": {
			    "h1": "1.2",
			  },
			  "radii": {
			    "base": "6",
			  },
			  "shadows": {
			    "card": "0 1px 2px #0003",
			  },
			  "zIndices": {
			    "modal": "1300",
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
			    "property": "boxShadow",
			    "value": {
			      "kind": "literal",
			      "value": "0 1px 2px #0003",
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
			      "value": "3rem",
			    },
			  },
			  {
			    "conditions": [],
			    "property": "zIndex",
			    "value": {
			      "kind": "literal",
			      "value": 1300,
			    },
			  },
			]
		`);
		expect(parsed.matches[0]?.program.declarations.map(({ property }) => property)).toEqual([
			"padding",
			"borderRadius",
			"boxShadow",
			"color",
			"fontSize",
			"zIndex",
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
						radius: { card: "10px" },
						shadows: { card: "0 1px 2px #0003" },
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
		const source = '<Box c="brand.0" p="card" fz="hero" radius="card" shadow="card" />';
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
			  "radii": {
			    "card": "10px",
			  },
			  "shadows": {
			    "card": "0 1px 2px #0003",
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
			    "property": "borderRadius",
			    "value": {
			      "kind": "literal",
			      "value": "10px",
			    },
			  },
			  {
			    "conditions": [],
			    "property": "boxShadow",
			    "value": {
			      "kind": "literal",
			      "value": "0 1px 2px #0003",
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
			"borderRadius",
			"boxShadow",
			"color",
			"fontSize",
		]);
	});
});
