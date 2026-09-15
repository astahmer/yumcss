import { describe, expect, test } from "vitest";
import { createPandwindProjectSupport } from "../src/swap/project-bootstrap.ts";
import { CodemodAdapterId, SwapTargetId } from "../src/swap/identifiers.ts";
import { planPandwindNextIntegration } from "../src/swap/host-integration.ts";

const TAILWIND_CODEGEN_TEST_TIMEOUT_MS = 30_000;

describe("Pandwind project bootstrap", () => {
	test("does not bind a generated tw module when no Tailwind graph was emitted", async () => {
		const support = await createPandwindProjectSupport({
			root: "/project",
			sourceAdapter: CodemodAdapterId.Panda,
			targetAdapter: CodemodAdapterId.Pandwind,
			outputDirectory: "pandwind",
			readFile: () => undefined,
			listFiles: () => [],
		});

		expect(support.files.map((file) => file.path)).not.toContain("pandwind/tw.ts");
		expect(support.bindings.twModule).toBeUndefined();
		expect(support.bindings.cssModule).toBe("pandwind/css.ts");
		expect(support.bindings.runtimeCssModule).toBe("pandwind/runtime.ts");
		expect(support.bindings.runtimeCssBinding).toBe("runtimeCss");
		expect(support.files.find((file) => file.path === "pandwind/runtime.ts")?.content).toContain(
			"export const runtimeCss = createRuntimeCss(pandwindPreset);",
		);
		expect(support.files.map((file) => file.path)).not.toContain("pandwind/dss.ts");
		expect(support.files.find((file) => file.path === "pandwind/css.ts")?.content).toContain(
			'import "pandwind:css";',
		);
		expect(support.files.find((file) => file.path === "pandwind/css.ts")?.content).toContain(
			'reference path="./vite-env.d.ts"',
		);
		expect(support.files.find((file) => file.path === "pandwind/vite-env.d.ts")?.content).toContain(
			'declare module "pandwind:css"',
		);
		expect(support.bindings.dssModule).toBeUndefined();
	});

	test("emits a typed app-owned token preset", async () => {
		const support = await createPandwindProjectSupport({
			root: "/project",
			sourceAdapter: CodemodAdapterId.Panda,
			targetAdapter: CodemodAdapterId.Pandwind,
			outputDirectory: "pandwind",
			readFile: () => undefined,
			listFiles: () => [],
		});

		const preset = support.files.find((file) => file.path === "pandwind/preset.ts")?.content;
		expect(preset).toContain('define, type PandwindProperties } from "pandwind/preset"');
		expect(preset).toContain("const conditions = define.conditions({");
		expect(preset).toContain("const appTokens = define.tokens({");
		expect(preset).toContain("const cssConfig: PandwindProperties = {};");
		expect(preset).toContain("config: cssConfig");
		expect(preset).toContain("export const pandwindPreset = define.preset(");
		expect(preset).not.toContain("AnyCssConfig");
		expect(preset).not.toContain("pandwindPreset.tokens");
		expect(preset).toContain("const properties = define.properties({");
		expect(preset).toContain('"display": true');
		expect(preset).not.toContain('"$all": true');
	});

	test("emits configured Panda color palettes in the owned preset", async () => {
		const root = "/project";
		const files = new Map<string, string>([
			[
				`${root}/panda.config.ts`,
				[
					"export default {",
					"\ttheme: {",
					'\t\tcolorPalette: { include: ["blue"] },',
					"\t\ttokens: {",
					"\t\t\tcolors: {",
					"\t\t\t\tblue: {",
					'\t\t\t\t\t500: { value: "#3182ce" },',
					'\t\t\t\t\t700: { value: "#2c5282" },',
					"\t\t\t\t},",
					'\t\t\t\tbutton: { light: { value: "#ffffff" } },',
					"\t\t\t},",
					"\t},",
					"};",
				].join("\n"),
			],
		]);
		const support = await createPandwindProjectSupport({
			root,
			sourceAdapter: CodemodAdapterId.Panda,
			targetAdapter: CodemodAdapterId.Pandwind,
			outputDirectory: "pandwind",
			readFile: (file) => files.get(file),
			listFiles: () => [...files.keys()],
		});

		const preset = support.files.find((file) => file.path === "pandwind/preset.ts")?.content;
		expect(preset).toContain("defineColorPalettes");
		expect(preset).toContain("tokens.defineColorPalettes");
		expect(preset).toContain('"blue": "colors.blue"');
		expect(preset).toContain("\n\t\tcolorPalettes,");
		expect(preset).not.toContain('"button": "colors.button"');
	});

	test("carries source named conditions into the generated preset", async () => {
		const root = "/project";
		const files = new Map<string, string>([
			[
				`${root}/panda.config.ts`,
				[
					"export default {",
					"\tconditions: { extend: { midnight: '[data-theme=midnight] &' } },",
					"};",
				].join("\n"),
			],
		]);
		const support = await createPandwindProjectSupport({
			root,
			sourceAdapter: CodemodAdapterId.Panda,
			targetAdapter: CodemodAdapterId.Pandwind,
			outputDirectory: "pandwind",
			readFile: (file) => files.get(file),
			listFiles: () => [...files.keys()],
		});

		const preset = support.files.find((file) => file.path === "pandwind/preset.ts")?.content;
		expect(preset).toContain('"base": ""');
		expect(preset).toContain('"midnight": "[data-theme=midnight] &"');
		expect(support.bindings.conditionCatalog).toMatchObject({
			midnight: "[data-theme=midnight] &",
		});
	});

	test("canonicalizes built-in condition aliases without changing custom names", async () => {
		const root = "/project";
		const files = new Map<string, string>([
			[
				`${root}/panda.config.ts`,
				[
					"export default {",
					"\tconditions: { extend: { hover: '&:hover', _hover: '&:focus-visible', midnight: '[data-theme=midnight] &' } },",
					"};",
				].join("\n"),
			],
		]);
		const support = await createPandwindProjectSupport({
			root,
			sourceAdapter: CodemodAdapterId.Panda,
			targetAdapter: CodemodAdapterId.Pandwind,
			outputDirectory: "pandwind",
			readFile: (file) => files.get(file),
			listFiles: () => [...files.keys()],
		});

		const preset = support.files.find((file) => file.path === "pandwind/preset.ts")?.content;
		expect(preset).toContain('\n\t"_hover": "&:focus-visible",');
		expect(preset).not.toContain('\n\t"hover":');
		expect(preset).toContain('"midnight": "[data-theme=midnight] &"');
		expect(preset).not.toContain('"_midnight":');
	});

	test("maps generated token groups to the properties that can consume them", async () => {
		const support = await createPandwindProjectSupport({
			root: "/project",
			sourceAdapter: CodemodAdapterId.Tailwind,
			targetAdapter: CodemodAdapterId.Pandwind,
			outputDirectory: "pandwind",
			readFile: (file) =>
				file === "/project/styles.css"
					? "@theme { --color-brand: #123456; --spacing-card: 1rem; }"
					: undefined,
			listFiles: () => ["/project/styles.css"],
		});

		const preset = support.files.find((file) => file.path === "pandwind/preset.ts")?.content;
		expect(preset).toContain('"color": {');
		expect(preset).toContain('"$tokens": "colors"');
		expect(preset).toContain('"$strictness": "inherits"');
		expect(preset).toContain('"padding": {');
		expect(preset).toContain('"$tokens": "spacing"');
		expect(preset).toContain('"brand": "#123456"');
		expect(preset).toContain('"card": "1rem"');
	});

	test("keeps component catalog values in a semantic layer", async () => {
		const support = await createPandwindProjectSupport({
			root: "/project",
			sourceAdapter: CodemodAdapterId.Tailwind,
			targetAdapter: CodemodAdapterId.Pandwind,
			outputDirectory: "pandwind",
			readFile: (file) =>
				file === "/project/styles.css"
					? "@theme { --color-brand: #123456; --color-component-card-border: #654321; }"
					: undefined,
			listFiles: () => ["/project/styles.css"],
		});

		const preset = support.files.find((file) => file.path === "pandwind/preset.ts")?.content;
		expect(preset).toContain("const componentTokens = appTokens.defineSemanticTokens");
		expect(preset).toContain('"raw.component-card-border": "#654321"');
		expect(preset).toContain(
			'"component-card-border": {\n\t\t\t"base": "colors.raw.component-card-border"\n\t\t}',
		);
	});

	test("carries generated target token spellings into the migration metadata", async () => {
		const support = await createPandwindProjectSupport({
			root: "/project",
			sourceAdapter: CodemodAdapterId.Tailwind,
			targetAdapter: CodemodAdapterId.Pandwind,
			outputDirectory: "pandwind",
			readFile: (file) =>
				file === "/project/styles.css"
					? '@import "tailwindcss";\n@theme { --color-brand: #123456; }'
					: undefined,
			listFiles: () => ["/project/styles.css"],
		});

		expect(support.meta?.tokens).toMatchObject({
			colors: { brand: "#123456" },
		});
		expect(support.files.map((file) => file.path)).not.toEqual(
			expect.arrayContaining([
				"pandwind/types.d.ts",
				"pandwind/tw.ts",
				"pandwind/bridge.ts",
				"pandwind/pandwind.interop.json",
				"pandwind/pandwind-theme.css",
			]),
		);
		expect(support.files.map((file) => file.path)).not.toContain("pandwind/cx.ts");
		expect(support.bindings.cxModule).toBeUndefined();
		expect(support.bindings.twModule).toBeUndefined();
	});

	test(
		"removes Tailwind graph directives while preserving authored CSS",
		async () => {
			const support = await createPandwindProjectSupport({
				root: "/project",
				sourceAdapter: CodemodAdapterId.Tailwind,
				targetAdapter: CodemodAdapterId.Pandwind,
				outputDirectory: "pandwind",
				readFile: (file) =>
					file === "/project/styles.css"
						? [
								'@import "tailwindcss";',
								"@theme { --color-brand: #123456; }",
								".authored { color: red; }",
							].join("\n")
						: undefined,
				listFiles: () => ["/project/styles.css"],
			});

			expect(support.fileChanges).toContainEqual({
				path: "styles.css",
				expectedContent: [
					'@import "tailwindcss";',
					"@theme { --color-brand: #123456; }",
					".authored { color: red; }",
				].join("\n"),
				content: "\n\n.authored { color: red; }",
			});
		},
		TAILWIND_CODEGEN_TEST_TIMEOUT_MS,
	);

	test(
		"uses an explicit TypeScript extension in generated Vite config imports",
		async () => {
			const support = await createPandwindProjectSupport({
				root: "/project",
				sourceAdapter: CodemodAdapterId.Tailwind,
				targetAdapter: CodemodAdapterId.Pandwind,
				outputDirectory: "pandwind",
				readFile: (file) => {
					if (file === "/project/styles.css") return '@import "tailwindcss";';
					if (file === "/project/vite.config.ts")
						return [
							'import tailwindcss from "@tailwindcss/vite";',
							'import { defineConfig } from "vite";',
							"export default defineConfig({ plugins: [tailwindcss()] });",
						].join("\n");
					if (file === "/project/tsconfig.json") return '{"compilerOptions":{"strict":true}}';
					return undefined;
				},
				listFiles: () => [
					"/project/styles.css",
					"/project/vite.config.ts",
					"/project/tsconfig.json",
				],
			});

			expect(support.fileChanges).toEqual([
				{
					path: "vite.config.ts",
					expectedContent: [
						'import tailwindcss from "@tailwindcss/vite";',
						'import { defineConfig } from "vite";',
						"export default defineConfig({ plugins: [tailwindcss()] });",
					].join("\n"),
					content: [
						'import { pandwindCssVite } from "pandwind/vite";',
						'import { pandwindPreset } from "./pandwind/preset.ts";',
						'import { defineConfig } from "vite";',
						'export default defineConfig({ plugins: [pandwindCssVite(pandwindPreset, { root: "." })] });',
					].join("\n"),
				},
				{
					path: "tsconfig.json",
					expectedContent: '{"compilerOptions":{"strict":true}}',
					content: '{"compilerOptions":{\n\t"allowImportingTsExtensions": true,"strict":true}}',
				},
			]);
		},
		TAILWIND_CODEGEN_TEST_TIMEOUT_MS,
	);

	test("adds the Pandwind Vite plugin for non-Tailwind sources", async () => {
		const support = await createPandwindProjectSupport({
			root: "/project",
			sourceAdapter: CodemodAdapterId.StyledComponents,
			targetAdapter: CodemodAdapterId.Pandwind,
			outputDirectory: "pandwind",
			readFile: (file) =>
				file === "/project/vite.config.ts"
					? [
							'import { defineConfig } from "vite";',
							"export default defineConfig({ plugins: [] });",
						].join("\n")
					: file === "/project/tsconfig.json"
						? '{"compilerOptions":{"strict":true}}'
						: undefined,
			listFiles: () => ["/project/vite.config.ts", "/project/tsconfig.json"],
		});

		expect(support.fileChanges).toEqual([
			{
				path: "vite.config.ts",
				expectedContent: [
					'import { defineConfig } from "vite";',
					"export default defineConfig({ plugins: [] });",
				].join("\n"),
				content: [
					'import { pandwindCssVite } from "pandwind/vite";',
					'import { pandwindPreset } from "./pandwind/preset.ts";',
					'import { defineConfig } from "vite";',
					'export default defineConfig({ plugins: [pandwindCssVite(pandwindPreset, { root: "." })] });',
				].join("\n"),
			},
			{
				path: "tsconfig.json",
				expectedContent: '{"compilerOptions":{"strict":true}}',
				content: '{"compilerOptions":{\n\t"allowImportingTsExtensions": true,"strict":true}}',
			},
		]);
	});

	test("removes the generated Panda stylesheet import when bootstrapping Pandwind", async () => {
		const root = "/project";
		const files = new Map<string, string>([
			[
				`${root}/src/main.tsx`,
				'import "../styled-system/styles.css";\nexport const App = () => null;\n',
			],
			[`${root}/styled-system/styles.css`, ".panda { color: red; }\n"],
		]);
		const support = await createPandwindProjectSupport({
			root,
			sourceAdapter: CodemodAdapterId.Panda,
			targetAdapter: CodemodAdapterId.Pandwind,
			outputDirectory: "pandwind",
			readFile: (file) => files.get(file),
			listFiles: () => [...files.keys()],
		});
		const change = support.fileChanges.find((candidate) => candidate.path === "src/main.tsx");
		expect(change).toMatchObject({
			content: "\nexport const App = () => null;\n",
			expectedContent: 'import "../styled-system/styles.css";\nexport const App = () => null;\n',
		});
	});

	test("replaces UnoCSS Vite support and removes its virtual stylesheet import", async () => {
		const root = "/project";
		const files = new Map<string, string>([
			[`${root}/src/main.tsx`, 'import "virtual:uno.css";\nexport const App = () => null;\n'],
			[
				`${root}/vite.config.ts`,
				[
					'import UnoCSS from "unocss/vite";',
					'import { defineConfig } from "vite";',
					"export default defineConfig({ plugins: [UnoCSS()] });",
				].join("\n"),
			],
		]);
		const support = await createPandwindProjectSupport({
			root,
			sourceAdapter: CodemodAdapterId.UnoCSS,
			targetAdapter: CodemodAdapterId.Pandwind,
			outputDirectory: "pandwind",
			readFile: (file) => files.get(file),
			listFiles: () => [...files.keys()],
		});

		expect(support.fileChanges).toContainEqual({
			path: "src/main.tsx",
			content: "\nexport const App = () => null;\n",
			expectedContent: 'import "virtual:uno.css";\nexport const App = () => null;\n',
		});
		expect(support.fileChanges.find((change) => change.path === "vite.config.ts")?.content).toBe(
			[
				'import { pandwindCssVite } from "pandwind/vite";',
				'import { pandwindPreset } from "./pandwind/preset.ts";',
				'import { defineConfig } from "vite";',
				'export default defineConfig({ plugins: [pandwindCssVite(pandwindPreset, { root: "." })] });',
			].join("\n"),
		);
	});

	test("uses a file-like virtual stylesheet and wires Next/Webpack", async () => {
		const root = "/project";
		const files = new Map<string, string>([
			[
				`${root}/next.config.mjs`,
				"const config = { images: { remotePatterns: [] } };\nexport default config;\n",
			],
			[
				`${root}/app/layout.tsx`,
				'"use client";\n\nexport default function Layout() { return <html />; }\n',
			],
		]);
		const support = await createPandwindProjectSupport({
			root,
			sourceAdapter: CodemodAdapterId.Panda,
			targetAdapter: SwapTargetId.CssClass,
			outputDirectory: "pandwind",
			readFile: (file) => files.get(file),
			listFiles: () => [...files.keys()],
			packageJson: { dependencies: { next: "15.0.0" } },
		});

		const css = support.files.find((file) => file.path === "pandwind/css.ts")?.content;
		expect(css).toContain('import "pandwind-css.css";');
		expect(css).not.toContain('import "pandwind:css";');
		expect(support.files.map((file) => file.path)).toContain("pandwind/preset.mjs");
		expect(support.fileChanges).toContainEqual({
			path: "next.config.mjs",
			expectedContent:
				"const config = { images: { remotePatterns: [] } };\nexport default config;\n",
			content: expect.stringContaining('import { pandwindWebpackCss } from "pandwind/unplugin";'),
		});
		expect(
			support.fileChanges.find((change) => change.path === "next.config.mjs")?.content,
		).toContain('import { pandwindPreset } from "./pandwind/preset.mjs";');
		expect(
			support.fileChanges.find((change) => change.path === "next.config.mjs")?.content,
		).toContain('virtualId: "pandwind-css.css"');
		expect(support.fileChanges).toContainEqual({
			path: "app/layout.tsx",
			expectedContent: '"use client";\n\nexport default function Layout() { return <html />; }\n',
			content:
				'"use client";\n\nimport "pandwind-css.css";\nexport default function Layout() { return <html />; }\n',
		});
	});

	test("finds wrapped config objects and webpack arrows through the AST", async () => {
		const root = "/project";
		const files = new Map<string, string>([
			[
				`${root}/next.config.ts`,
				[
					'import { defineConfig } from "next";',
					"const options = { images: { remotePatterns: [] }, webpack: (config: any) => {",
					"\tconfig.resolve = config.resolve;",
					"\treturn config;",
					"} };",
					"export default defineConfig(options);",
				].join("\n"),
			],
		]);
		const support = await createPandwindProjectSupport({
			root,
			sourceAdapter: CodemodAdapterId.Panda,
			targetAdapter: SwapTargetId.CssClass,
			outputDirectory: "pandwind",
			readFile: (file) => files.get(file),
			listFiles: () => [...files.keys()],
			packageJson: { dependencies: { next: "15.0.0" } },
		});

		const config = support.fileChanges.find((change) => change.path === "next.config.ts");
		expect(config).toBeDefined();
		expect(config?.content).toContain("config.plugins.push(");
		expect(config?.content).toContain("return config;");
		expect(config?.content.indexOf("config.plugins.push(")).toBeLessThan(
			config?.content.indexOf("return config;") ?? 0,
		);
	});

	test("fails closed for an expression-bodied webpack hook", async () => {
		const root = "/project";
		const files = new Map<string, string>([
			[
				`${root}/next.config.mjs`,
				"export default { webpack: (config) => ({ ...config, plugins: [] }) };\n",
			],
		]);
		const support = await createPandwindProjectSupport({
			root,
			sourceAdapter: CodemodAdapterId.Panda,
			targetAdapter: SwapTargetId.CssClass,
			outputDirectory: "pandwind",
			readFile: (file) => files.get(file),
			listFiles: () => [...files.keys()],
			packageJson: { dependencies: { next: "15.0.0" } },
		});

		expect(support.fileChanges).toHaveLength(0);
		const plan = planPandwindNextIntegration({
			projectRoot: root,
			outputDirectory: "pandwind",
			fileSystem: {
				read: (file) => files.get(file),
				exists: (file) => files.has(file),
			},
			packageJson: { dependencies: { next: "15.0.0" } },
		});
		expect(plan.notes).toContain("could not safely add pandwindWebpackCss to next.config.mjs");
	});
});
