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
				values: { tokenamiAliases: { bg: "backgroundColor", px: "paddingInline" } },
			},
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
					value: { kind: "literal", value: 2 },
				}),
			]),
		);
		expect(declarations.find((entry) => entry.property === "backgroundColor")?.conditions).toEqual([
			{ kind: "pseudo", name: "hover" },
		]);
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

	test("decodes escaped official utility selectors and CSS theme aliases", () => {
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
		expect(resolver.resolve("bg-foreground", {} as never)).toEqual([
			expect.objectContaining({
				property: "backgroundColor",
				value: { kind: "literal", value: "var(--foreground)" },
			}),
		]);
	});

	test("loads Tokenami aliases through its official config package boundary", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				return packageName === "@tokenami/config"
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
		expect(config?.values.tokenamiAliases).toEqual({ brand: ["color"] });
		expect(config?.values.tokenamiConfig).toMatchObject({ officialNormalized: true });
		expect(config?.values.officialConfigPackage).toBe("@tokenami/config");
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
		const config = await adapter.loadConfigAsync?.({ file: "App.tsx", source, root: "/project" });
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
			adapterRegistry: createStyleAdapterRegistry([adapter, pandwind]),
		});
		expect(result.changed).toBe(false);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "configuration", text: "UnoCSS project configuration" }),
			]),
		);
	});
});
