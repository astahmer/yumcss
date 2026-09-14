import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createPandwindAdapter,
	createStyleAdapterRegistry,
	createTailwindAdapter,
	runAdapterMigrationAsync,
} from "../src/swap/index.ts";
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
							if (candidate === "hover:tab-4")
								return "@layer utilities { .hover\\:tab-4:hover { tab-size: 4; } }";
							if (candidate === "rtl:rotate-180")
								return '.rtl\\:rotate-180:where([dir="rtl"] *) { rotate: 180deg; }';
							if (candidate === "prose")
								return "@layer utilities { @media (min-width: 48rem) { .prose { max-width: 65ch; } } }";
							if (candidate === "theme-tab-4")
								return "@layer utilities { [data-theme=midnight] .theme-tab-4 { tab-size: 4; } }";
							return null;
						}),
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

describe("Tailwind official CSS context", () => {
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
			"import { createCss } from "pandwind/css";
			const css = createCss();
			const staticClassName1 = css.class({ tabSize: "4", "&:hover": { tabSize: "4" }, "@media (min-width: 48rem)": { maxWidth: "65ch" } });
			export const App = () => <div className={staticClassName1}/>;"
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
			"import { createCss } from "pandwind/css";
			const css = createCss();
			const staticClassName1 = css.class({ "[data-theme=midnight] &": { tabSize: "4" } });
			export const App = () => <div className={staticClassName1}/>;"
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
		expect(result.code).toContain('"&:where([dir=\\"rtl\\"] *)"');
		expect(result.code).toContain('rotate: "180deg"');
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
