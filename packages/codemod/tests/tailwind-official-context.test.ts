import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createPandwindAdapter,
	createStyleAdapterRegistry,
	createTailwindAdapter,
	runAdapterMigrationAsync,
	styleProgramFromSourceObject,
} from "../src/swap/index.ts";
import { createStyleXAdapter } from "../src/swap/adapters/stylex.adapter.ts";
import { parseTailwindCandidateCss } from "../src/swap/adapters/tailwind.adapter.ts";
import compiled from "../src/swap/adapters/compiled.adapter.ts";
import goober from "../src/swap/adapters/goober.adapter.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";

const root = "/project";
const file = "src/App.tsx";
const cssFile = `${root}/src/index.css`;

function files(css = '@import "tailwindcss";') {
	return {
		[cssFile]: css,
	};
}

function loader(): ProjectModuleLoader {
	return {
		async importPackage(packageName) {
			if (packageName !== "@tailwindcss/node") return undefined;
			return {
				__unstable__loadDesignSystem: async () => ({
					candidatesToCss: (candidates: readonly string[]) =>
						candidates.map((candidate) => {
							if (candidate === "tab-4") return "@layer utilities { .tab-4 { tab-size: 4; } }";
							if (candidate === "tab-4!")
								return "@layer utilities { .tab-4\\! { tab-size: 4 !important; } }";
							if (candidate === "hover:tab-4")
								return "@layer utilities { .hover\\:tab-4:hover { tab-size: 4; } }";
							if (candidate === "rtl:rotate-180")
								return '.rtl\\:rotate-180:where([dir="rtl"] *) { rotate: 180deg; }';
							if (candidate === "prose")
								return "@layer utilities { @media (min-width: 48rem) { .prose { max-width: 65ch; } } }";
							if (candidate === "md:[display:flex]")
								return "@layer utilities { @media (width >= 48rem) { .md\\:\\[display\\:flex\\] { display: flex; } } }";
							if (candidate === "theme-tab-4")
								return "@layer utilities { [data-theme=midnight] .theme-tab-4 { tab-size: 4; } }";
							return null;
						}),
					getClassList: () => [["tab-4", {}] as const],
					theme: {
						entries: () => new Map([["--spacing-4", { value: "1rem" }]]),
					},
				}),
			} as never;
		},
		async importFile() {
			return undefined;
		},
	};
}

function migrate(
	source: string,
	projectFiles: Readonly<Record<string, string>>,
	moduleLoader: ProjectModuleLoader = loader(),
) {
	const target = createPandwindAdapter({ moduleLoader: null });
	return runAdapterMigrationAsync(source, {
		from: CodemodAdapterId.Tailwind,
		to: CodemodAdapterId.Pandwind,
		file,
		root,
		readFile: (path) => projectFiles[path],
		listFiles: () => Object.keys(projectFiles),
		adapterRegistry: createStyleAdapterRegistry([createTailwindAdapter({ moduleLoader }), target]),
	});
}

function spacingLoader(): ProjectModuleLoader {
	return {
		async importPackage(packageName) {
			if (packageName !== "@tailwindcss/node") return undefined;
			return {
				__unstable__loadDesignSystem: async () => ({
					candidatesToCss: (candidates: readonly string[]) =>
						candidates.map((candidate) =>
							candidate === "p-4"
								? "@layer utilities { .p-4 { padding: calc(var(--spacing) * 4); } }"
								: null,
						),
					getClassList: () => [["p-4", {}] as const],
					theme: {
						entries: () => new Map([["--spacing", { value: "0.25rem" }]]),
					},
				}),
			} as never;
		},
		async importFile() {
			return undefined;
		},
	};
}

function classicLoader(): ProjectModuleLoader {
	return {
		async importPackage(packageName) {
			if (packageName === "tailwindcss") return { default: () => ({}) } as never;
			if (packageName === "postcss")
				return {
					default: () => ({
						process: async () => ({
							css: String.raw`@layer utilities { .tab-4 { tab-size: 4; } .\!tab-4 { tab-size: 4 !important; } }`,
						}),
					}),
				} as never;
			return undefined;
		},
		async importFile() {
			return { default: { content: ["src/**/*"] } } as never;
		},
	};
}

describe("Tailwind official CSS context", () => {
	test("preserves priority in Compiled and generic object-carrier output", () => {
		const program = styleProgramFromSourceObject('tabSize: "4 !important"');
		const output = {
			compiled: compiled.emit(program, {
				file,
				config: { adapter: CodemodAdapterId.Compiled, files: [], values: {} },
				mode: "safe",
				index: 0,
			}).text,
			goober: goober.emit(program, {
				file,
				config: { adapter: CodemodAdapterId.Goober, files: [], values: {} },
				mode: "safe",
				index: 0,
			}).text,
		};

		expect(output.compiled).toContain('"4 !important"');
		expect(output.goober).toContain('"4 !important"');
		expect(output).toMatchInlineSnapshot(`
			{
			  "compiled": "css({ "tabSize": "4 !important" })",
			  "goober": "css({ "tabSize": "4 !important" })",
			}
		`);
	});

	test("emits an important declaration as a verified Tailwind utility", async () => {
		const adapter = createTailwindAdapter({ moduleLoader: loader() });
		const projectFiles: Readonly<Record<string, string>> = files();
		const config = await adapter.loadConfigAsync?.({
			file,
			root,
			source: "",
			readFile: (path) => projectFiles[path],
			listFiles: () => Object.keys(projectFiles),
		});
		if (config === undefined) throw new Error("Tailwind config did not load");

		const emitted = adapter.emit(styleProgramFromSourceObject('tabSize: "4 !important"'), {
			file,
			config,
			mode: "safe",
			index: 0,
		});

		expect(emitted.residuals).toEqual([]);
		expect(emitted.emissionDecisions).toMatchObject([
			{ candidate: "tab-4!", property: "tabSize", verified: true },
		]);
		expect(JSON.parse(emitted.text)).toMatchInlineSnapshot(`"tab-4!"`);
	});

	test("uses the Tailwind 3 leading important modifier from its loaded project config", async () => {
		const adapter = createTailwindAdapter({ moduleLoader: classicLoader() });
		const projectFiles: Readonly<Record<string, string>> = {
			[`${root}/tailwind.config.cjs`]: "module.exports = {};",
			[`${root}/${file}`]: "",
		};
		const config = await adapter.loadConfigAsync?.({
			file,
			root,
			source: "",
			readFile: (path) => projectFiles[path],
			listFiles: () => Object.keys(projectFiles),
		});
		if (config === undefined) throw new Error("Tailwind 3 config did not load");

		const emitted = adapter.emit(styleProgramFromSourceObject('tabSize: "4 !important"'), {
			file,
			config,
			mode: "safe",
			index: 0,
		});

		expect(config.values.tailwindImportantSyntax).toBe("prefix");
		expect(emitted.residuals).toEqual([]);
		expect(emitted.emissionDecisions).toMatchObject([
			{ candidate: "!tab-4", property: "tabSize", verified: true },
		]);
		expect(JSON.parse(emitted.text)).toMatchInlineSnapshot(`"!tab-4"`);
	});

	test("parses Tailwind 3 leading important utilities into declaration priority", async () => {
		const source = 'export const App = () => <div className="!tab-4" />;';
		const projectFiles: Readonly<Record<string, string>> = {
			[`${root}/tailwind.config.cjs`]: "module.exports = {};",
			[`${root}/${file}`]: source,
		};
		const result = await runAdapterMigrationAsync(source, {
			from: CodemodAdapterId.Tailwind,
			to: CodemodAdapterId.Pandwind,
			file,
			root,
			readFile: (path) => projectFiles[path],
			listFiles: () => Object.keys(projectFiles),
			adapterRegistry: createStyleAdapterRegistry([
				createTailwindAdapter({ moduleLoader: classicLoader() }),
				createPandwindAdapter({ moduleLoader: null }),
			]),
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('tabSize: "4 !important"');
		expect(result.validations[0]).toMatchObject({ valid: true, lossiness: "lossless" });
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ tabSize: "4 !important" })}/>;"
		`);
	});

	test("retains Tailwind's important modifier through the target migration", async () => {
		const result = await migrate('export const App = () => <div className="tab-4!" />;', files());

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.validations[0]).toMatchObject({
			valid: true,
			lossiness: "lossless",
			differences: [],
		});
		expect(result.code).toContain("!important");
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ tabSize: "4 !important" })}/>;"
		`);
	});

	test("keeps important utilities as typed residuals for targets without priority support", async () => {
		const source = 'export const App = () => <div className="tab-4!" />;';
		const projectFiles: Readonly<Record<string, string>> = files();
		const result = await runAdapterMigrationAsync(source, {
			from: CodemodAdapterId.Tailwind,
			to: CodemodAdapterId.StyleX,
			file,
			root,
			readFile: (path) => projectFiles[path],
			listFiles: () => Object.keys(projectFiles),
			adapterRegistry: createStyleAdapterRegistry([
				createTailwindAdapter({ moduleLoader: loader() }),
				createStyleXAdapter(),
			]),
		});

		expect(result.converted).toBe(0);
		expect(result.skipped).toBe(1);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "capability",
					text: '<div className="tab-4!" />',
					hint: expect.stringContaining("important-priority"),
				}),
			]),
		);
		expect(result.code).toContain(source);
	});

	test("parses important as declaration priority in compiled Tailwind CSS", () => {
		expect(parseTailwindCandidateCss(".tab-4\\! { tab-size: 4 !important; }", "tab-4!"))
			.toMatchInlineSnapshot(`
			[
			  {
			    "conditions": [],
			    "important": true,
			    "property": "tabSize",
			    "value": {
			      "kind": "literal",
			      "value": "4",
			    },
			  },
			]
		`);
	});

	test("preserves nested arbitrary selectors as selectors instead of pseudo variants", () => {
		expect(
			parseTailwindCandidateCss(
				".md\\:\\*\\*\\:\\[button\\,a\\]\\:w-full { @media (width >= 48rem) { :is(& *) { &:is(button,a) { width: 100%; } } } }",
				"md:**:[button,a]:w-full",
			),
		).toEqual([
			{
				conditions: [
					{ kind: "media", name: "(width >= 48rem)", value: "(width >= 48rem)" },
					{ kind: "selector", name: ":is(& *)", value: ":is(& *)" },
					{ kind: "selector", name: "&:is(button,a)", value: "&:is(button,a)" },
				],
				property: "width",
				value: { kind: "literal", value: "100%" },
			},
		]);
	});

	test("preserves combined utility and attribute selectors as relative selectors", () => {
		expect(
			parseTailwindCandidateCss(
				'.data-\\[size\\=sm\\]\\:pb-0[data-size="sm"] { padding-bottom: 0px; }',
				"data-[size=sm]:pb-0",
			),
		).toEqual([
			{
				conditions: [{ kind: "selector", name: '&[data-size="sm"]', value: '&[data-size="sm"]' }],
				property: "paddingBottom",
				value: { kind: "literal", value: "0px" },
			},
		]);
	});

	test("discovers a non-standard CSS entry and preserves nested engine semantics", async () => {
		const result = await migrate(
			'export const App = () => <div className="tab-4 hover:tab-4 prose" />;',
			files(`
@import "tailwindcss";
@utility tab-4 { tab-size: 4; }
@plugin "./typography-plugin.js";
`),
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('tabSize: "4"');
		expect(result.code).toContain('maxWidth: "65ch"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ tabSize: "4", _hover: { tabSize: "4" }, "@media (min-width: 48rem)": { maxWidth: "65ch" } })}/>;"
		`);
	});

	test("retains a custom selector variant instead of flattening it", async () => {
		const result = await migrate(
			'export const App = () => <div className="theme-tab-4" />;',
			files(`
@import "tailwindcss";
@custom-variant midnight (&:where([data-theme=midnight] *));
@utility theme-tab-4 { tab-size: 4; }
`),
		);

		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('tabSize: "4"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ "[data-theme=midnight] &": { tabSize: "4" } })}/>;"
		`);
	});

	test("retains Tailwind selector wrappers such as rtl and dark", async () => {
		const result = await migrate(
			'export const App = () => <div className="rtl:rotate-180" />;',
			files(),
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain("_rtl");
		expect(result.code).toContain('rotate: "180deg"');
	});

	test("converts a responsive candidate when the official Tailwind graph proves its media condition", async () => {
		const result = await migrate(
			'export const App = () => <div className="md:[display:flex]" />;',
			files(),
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.validations[0]).toMatchObject({
			valid: true,
			lossiness: "lossless",
			differences: [],
		});
		expect(result.code).toContain('"@media (width >= 48rem)"');
		expect(result.code).not.toContain('className="md:[display:flex]"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "pandwind/unsafe/css";
			const css = createUnsafeCss();
			export const App = () => <div className={css.class({ "@media (width >= 48rem)": { display: "flex" } })}/>;"
		`);
	});

	test("resolves official spacing variables before lowering utilities", async () => {
		const projectFiles: Readonly<Record<string, string>> = files();
		const config = await createTailwindAdapter({ moduleLoader: spacingLoader() }).loadConfigAsync?.(
			{
				file,
				source: "",
				root,
				listFiles: () => [cssFile],
				readFile: (path) => projectFiles[path],
			},
		);
		expect(config?.tokenCatalog?.groups.spacing).toEqual({ "4": "1rem" });
		expect(config?.values.tailwindOfficialApi).toEqual({
			api: "@tailwindcss/node.__unstable__loadDesignSystem",
			status: "verified",
		});

		const result = await migrate(
			'export const App = () => <div className="p-4" />;',
			files(),
			spacingLoader(),
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('padding: "1rem"');
		expect(result.code).not.toContain("var(--spacing)");
		expect(result.code).not.toContain("calc(var(--spacing)");
	});

	test("reports a missing project CSS graph instead of silently using fallback utilities", async () => {
		const result = await migrate('export const App = () => <div className="tab-4" />;', {});

		expect(result.converted).toBe(0);
		expect(result.code).toContain('className="tab-4"');
		expect(result.residuals).toEqual([
			expect.objectContaining({
				kind: "unknown-utility",
				text: "tab-4",
			}),
		]);
	});

	test("reports official engine failures as configuration residuals", async () => {
		const target = createPandwindAdapter({ moduleLoader: null });
		const brokenLoader: ProjectModuleLoader = {
			async importPackage() {
				return {
					__unstable__loadDesignSystem: async () => {
						throw new Error("missing plugin");
					},
				} as never;
			},
			async importFile() {
				return undefined;
			},
		};
		const source = 'export const App = () => <div className="tab-4" />;';
		const projectFiles = files();
		const result = await runAdapterMigrationAsync(source, {
			from: CodemodAdapterId.Tailwind,
			to: CodemodAdapterId.Pandwind,
			file,
			root,
			readFile: (path) => projectFiles[path as keyof typeof projectFiles],
			listFiles: () => [cssFile],
			adapterRegistry: createStyleAdapterRegistry([
				createTailwindAdapter({ moduleLoader: brokenLoader }),
				target,
			]),
		});

		expect(result.converted).toBe(0);
		expect(result.code).toContain("pandwind:migrate-skip (configuration-residual: configuration)");
		expect(result.code).toContain(source);
		expect(result.residuals[0]).toEqual(expect.objectContaining({ kind: "configuration" }));
	});

	test("reports an incompatible official loader shape before invoking it", async () => {
		const projectFiles: Readonly<Record<string, string>> = files();
		const incompatibleLoader: ProjectModuleLoader = {
			async importPackage() {
				return { __unstable__loadDesignSystem: "legacy-api" } as never;
			},
			async importFile() {
				return undefined;
			},
		};
		const config = await createTailwindAdapter({
			moduleLoader: incompatibleLoader,
		}).loadConfigAsync?.({
			file,
			root,
			readFile: (path) => projectFiles[path],
			listFiles: () => [cssFile],
			source: "",
		});

		expect(config?.values.tailwindOfficialApi).toEqual({
			api: "@tailwindcss/node.__unstable__loadDesignSystem",
			status: "incompatible",
			detail:
				"the installed @tailwindcss/node package does not expose the expected loader function",
		});
		expect(config?.residuals).toEqual([
			{
				kind: "configuration",
				text: "Tailwind project configuration",
				hint: "the installed @tailwindcss/node package does not expose the expected loader function",
			},
		]);
	});
});
