import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createPandaAdapter,
	createPandwindAdapter,
	createStyleAdapterRegistry,
	createUnoCssAdapter,
	createUnoCssResolverFromCss,
	runAdapterMigration,
	runAdapterMigrationAsync,
} from "../src/swap/index.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";

const root = "/project";
const file = "src/App.tsx";
const cssFile = `${root}/src/styles.css`;

function createLoader(candidates: string[][], configFile: string): ProjectModuleLoader {
	return {
		async importPackage(packageName) {
			if (packageName === "@unocss/config")
				return {
					loadConfig: async () => ({
						config: {
							theme: { colors: { brand: "#123456" } },
							rules: [
								[/^badge-brand$/, { "border-width": "2px" }],
								["bg-brand", { "background-color": "#123456" }],
							],
							shortcuts: { "shortcut-brand": "bg-brand text-white" },
						},
						sources: [configFile],
					}),
				} as never;
			if (packageName === "@unocss/core")
				return {
					createGenerator: async () => ({
						generate: async (input: readonly string[]) => {
							candidates.push([...input]);
							return {
								css: input
									.map((token) => {
										if (token === "badge-brand") return ".badge-brand{border-width:2px}";
										if (token === "bg-brand") return ".bg-brand{background-color:#123456}";
										if (token === "shortcut-brand")
											return "@media (min-width: 48rem){.shortcut-brand:hover{color:#fff}}";
										if (token === "md:[display:flex]")
											return "@media (min-width: 48rem){.md\\:\\[display\\:flex\\]{display:flex}}";
										return "";
									})
									.join(""),
							};
						},
					}),
				} as never;
			return undefined;
		},
		async importFile() {
			return undefined;
		},
	};
}

async function migrate(
	source: string,
	projectFiles: Readonly<Record<string, string>>,
	candidates: string[][],
) {
	const target = createPandwindAdapter({ moduleLoader: null });
	const configFile = Object.keys(projectFiles).find((candidate) =>
		/(?:^|[\\/])(?:uno|unocss)\.config\.(?:[cm]?js|[cm]?ts)$/u.test(candidate),
	);
	if (configFile === undefined) throw new Error("UnoCSS test project requires a config file");
	return runAdapterMigrationAsync(source, {
		from: CodemodAdapterId.UnoCSS,
		to: CodemodAdapterId.Pandwind,
		file,
		root,
		readFile: (path) => projectFiles[path],
		listFiles: () => Object.keys(projectFiles),
		adapterRegistry: createStyleAdapterRegistry([
			createUnoCssAdapter({ moduleLoader: createLoader(candidates, configFile) }),
			target,
		]),
	});
}

describe("UnoCSS official extraction context", () => {
	test("separates grouped generator selectors and retains functional pseudo arguments", () => {
		const resolver = createUnoCssResolverFromCss(
			".hover\\:red:hover,.red{color:red}.nested:is(.a,.b){color:blue}",
		);
		const context = {
			source: "",
			file,
			config: { adapter: CodemodAdapterId.UnoCSS, files: [], values: {} },
		};
		expect(resolver.resolve("hover:red", context)?.[0]?.conditions).toEqual([
			{ kind: "pseudo", name: "hover" },
		]);
		expect(resolver.resolve("red", context)?.[0]?.conditions).toEqual([]);
		expect(resolver.resolve("nested", context)?.[0]?.conditions).toEqual([
			{ kind: "selector", name: "&:is(.a,.b)", value: "&:is(.a,.b)" },
		]);
	});
	test("preserves utility syntax when the source project config is unavailable", () => {
		const source = '<div className="[display:flex]" />';
		const result = runAdapterMigration(source, {
			from: CodemodAdapterId.UnoCSS,
			to: CodemodAdapterId.Pandwind,
			file,
			mode: "safe",
			readFile: () => undefined,
			adapterRegistry: createStyleAdapterRegistry([
				createUnoCssAdapter({ moduleLoader: null }),
				createPandwindAdapter({ moduleLoader: null }),
			]),
		});

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "unknown-utility",
					text: "[display:flex]",
				}),
			]),
		);
		expect(result.code).toContain(source);
		expect(result.code).toMatchInlineSnapshot(`
			"// pandwind:migrate-skip (route: unocss -> pandwind | parse-residual: unknown-utility | available: named-map, residual)
			<div className="[display:flex]" />"
		`);
	});

	test("feeds static attributes, bindings, and assignments to the official generator", async () => {
		const candidates: string[][] = [];
		const result = await migrate(
			[
				'const classes = "badge-brand";',
				'export const App = () => <div className="badge-brand" data-x={classes} />;',
			].join("\n"),
			{
				[cssFile]: "@theme { --color-brand: #123456; }",
				[`${root}/uno.config.ts`]: "export default {}",
			},
			candidates,
		);

		expect(candidates.flat()).toEqual(expect.arrayContaining(["badge-brand"]));
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('borderWidth: "2px"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			const classes = "badge-brand";
			export const App = () => <div data-x={classes}  className={css.class({ borderWidth: "2px" })}/>;"
		`);
	});

	test("lowers a responsive utility only after the official generator proves its media condition", async () => {
		const candidates: string[][] = [];
		const result = await migrate(
			'<div className="md:[display:flex]" />',
			{ [`${root}/uno.config.ts`]: "export default {}" },
			candidates,
		);

		expect(candidates.flat()).toContain("md:[display:flex]");
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("@media (min-width: 48rem)");
		expect(result.code).toContain('display: "flex"');
		expect(result.validations.every(({ valid }) => valid)).toBe(true);
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			<div className={css.class({ "@media (min-width: 48rem)": { display: "flex" } })}/>"
		`);
	});

	test("resolves project utilities only when the official generator emits them", async () => {
		const candidates: string[][] = [];
		const result = await migrate(
			'export const App = () => <div className={"shortcut-brand bg-brand"} />;',
			{
				[cssFile]: "@theme { --color-brand: #123456; }",
				[`${root}/uno.config.ts`]: "export default {}",
			},
			candidates,
		);

		expect(candidates.flat()).toEqual(expect.arrayContaining(["shortcut-brand", "bg-brand"]));
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("_hover");
		expect(result.code).toContain('"@media (min-width: 48rem)"');
		expect(result.code).toContain('backgroundColor: "#123456"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ backgroundColor: "#123456", "@media (min-width: 48rem)": { _hover: { color: "#fff" } } })}/>;"
		`);
	});

	test("loads the documented unocss.config.mts config filename", async () => {
		const candidates: string[][] = [];
		const result = await migrate(
			'<div className="badge-brand" />',
			{ [`${root}/unocss.config.mts`]: "export default {}" },
			candidates,
		);

		expect(candidates.flat()).toContain("badge-brand");
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			<div className={css.class({ borderWidth: "2px" })}/>"
		`);
	});

	test("preserves utilities that raw project CSS cannot prove", async () => {
		const source = 'export const App = () => <div className="brand bg-brand [display:flex]" />;';
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				if (packageName === "@unocss/config")
					return {
						loadConfig: async () => ({
							config: { presets: [], theme: { colors: { brand: "#123456" } } },
							sources: [],
						}),
					} as never;
				if (packageName === "@unocss/core")
					return {
						createGenerator: async () => ({
							generate: async () => ({ css: "" }),
						}),
					} as never;
				return undefined;
			},
			async importFile() {
				return undefined;
			},
		};
		const uno = createUnoCssAdapter({ moduleLoader: loader });
		const result = await runAdapterMigrationAsync(source, {
			from: CodemodAdapterId.UnoCSS,
			to: CodemodAdapterId.Pandwind,
			file,
			root,
			readFile: (path) =>
				path === cssFile ? "@theme { --color-brand: #123456; } .brand { color: red; }" : undefined,
			listFiles: () => [`${root}/uno.config.ts`, cssFile],
			adapterRegistry: createStyleAdapterRegistry([
				uno,
				createPandwindAdapter({ moduleLoader: null }),
			]),
		});

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "unknown-utility", text: "brand" }),
				expect.objectContaining({ kind: "unknown-utility", text: "bg-brand" }),
				expect.objectContaining({ kind: "unknown-utility", text: "[display:flex]" }),
			]),
		);
		expect(result.code).toContain(source);
		expect(result.code).toMatchInlineSnapshot(`
			"// pandwind:migrate-skip (route: unocss -> pandwind | parse-residual: unknown-utility | available: named-map, residual)
			export const App = () => <div className="brand bg-brand [display:flex]" />;"
		`);
	});

	test("preserves styles when the UnoCSS target has no utility generators", async () => {
		const source =
			'import { css } from "styled-system/css"; export const card = css({ color: "red" });';
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				if (packageName === "@unocss/config")
					return {
						loadConfig: async () => ({
							config: { presets: [], rules: [], shortcuts: {} },
							sources: [],
						}),
					} as never;
				if (packageName === "@unocss/core")
					return {
						createGenerator: async () => ({
							generate: async () => ({ css: "" }),
						}),
					} as never;
				return undefined;
			},
			async importFile() {
				return undefined;
			},
		};
		const result = await runAdapterMigrationAsync(source, {
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.UnoCSS,
			file,
			root,
			listFiles: () => [`${root}/uno.config.ts`],
			adapterRegistry: createStyleAdapterRegistry([
				createPandaAdapter({ moduleLoader: null }),
				createUnoCssAdapter({ moduleLoader: loader }),
			]),
		});

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "configuration",
					hint: expect.stringContaining("no presets, rules, or shortcuts"),
				}),
			]),
		);
		expect(result.code).toContain(source);
		expect(result.code).toMatchInlineSnapshot(`
			"// pandwind:migrate-skip (route: panda -> unocss | lowering-residual: configuration, validation)
			import { css } from "styled-system/css"; export const card = css({ color: "red" });"
		`);
	});

	test("emits an arbitrary target utility only when the official generator proves it", async () => {
		const source =
			'import { css } from "styled-system/css"; export const card = css({ color: "red" });';
		const candidates: string[][] = [];
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				if (packageName === "@unocss/config")
					return {
						loadConfig: async () => ({
							config: { presets: [], rules: [[/^\\[color:red\\]$/u, { color: "red" }]] },
							sources: [`${root}/uno.config.ts`],
						}),
					} as never;
				if (packageName === "@unocss/core")
					return {
						createGenerator: async () => ({
							generate: async (input: readonly string[]) => {
								candidates.push([...input]);
								return {
									css: input
										.filter((token) => token === "[color:red]")
										.map(() => ".\\[color\\:red\\]{color:red}")
										.join(""),
								};
							},
						}),
					} as never;
				return undefined;
			},
			async importFile() {
				return undefined;
			},
		};
		const result = await runAdapterMigrationAsync(source, {
			from: CodemodAdapterId.Panda,
			to: CodemodAdapterId.UnoCSS,
			file,
			root,
			listFiles: () => [`${root}/uno.config.ts`],
			adapterRegistry: createStyleAdapterRegistry([
				createPandaAdapter({ moduleLoader: null }),
				createUnoCssAdapter({ moduleLoader: loader }),
			]),
		});

		expect(candidates.flat()).toContain("[color:red]");
		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("[color:red]");
		expect(result.code).not.toContain("styled-system/css");
		expect(result.validations.every(({ valid }) => valid)).toBe(true);
		expect(result.code).toMatchInlineSnapshot(`" export const card = "[color:red]";"`);
	});
});
