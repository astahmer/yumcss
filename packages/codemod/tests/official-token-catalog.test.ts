import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createChakraAdapter,
	createTailwindAdapter,
	createTokenamiAdapter,
	createUnoCssAdapter,
	createBuiltinCodemodCatalog,
} from "../src/swap/index.ts";
import { TokenCatalog } from "../src/swap/tokens.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";
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
			spacing: { card: { value: "17px" } },
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
	});

	test("loads Chakra custom tokens from the official merged system config", async () => {
		const system = {
			$$chakra: true as const,
			_config: {
				theme: { tokens: { colors: { brand: { "500": { value: "#123456" } } } } },
			},
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
	});
});
