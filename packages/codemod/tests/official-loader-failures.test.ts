import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	StyleProgramResidualKindTag,
	createChakraAdapter,
	createMantineAdapter,
	createMuiAdapter,
	createPandwindAdapter,
	createStyleAdapterRegistry,
	createBuiltinCodemodCatalog,
	createTailwindAdapter,
	createTokenamiAdapter,
	createUnoCssAdapter,
	runAdapterMigrationAsync,
} from "../src/swap/index.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";

const unavailableLoader: ProjectModuleLoader = {
	async importPackage() {
		return undefined;
	},
	async importFile() {
		return undefined;
	},
};

describe("official project-context loaders", () => {
	test("publish a configuration residual when a discovered custom config cannot use its official loader", async () => {
		const cases = [
			{
				id: CodemodAdapterId.Tailwind,
				adapter: createTailwindAdapter({ moduleLoader: unavailableLoader }),
				files: ["/project/styles/tailwind.css"],
				readFile: (file: string) =>
					file.endsWith("tailwind.css")
						? '@import "tailwindcss"; @utility card { color: red; }'
						: undefined,
			},
			{
				id: CodemodAdapterId.UnoCSS,
				adapter: createUnoCssAdapter({ moduleLoader: unavailableLoader }),
				files: ["/project/uno.config.ts"],
				readFile: (file: string) =>
					file.endsWith("uno.config.ts")
						? "export default { shortcuts: { card: 'p-4' } }"
						: undefined,
			},
			{
				id: CodemodAdapterId.Tokenami,
				adapter: createTokenamiAdapter({ moduleLoader: unavailableLoader }),
				files: ["/project/tokenami.config.ts"],
				readFile: (file: string) =>
					file.endsWith("tokenami.config.ts")
						? 'export default { theme: { color: { brand: "#123456" } } }'
						: undefined,
			},
			{
				id: CodemodAdapterId.ChakraUi,
				adapter: createChakraAdapter({ moduleLoader: unavailableLoader }),
				files: ["/project/src/theme.ts"],
				readFile: (file: string) =>
					file.endsWith("src/theme.ts") ? "export const theme = defineConfig({})" : undefined,
			},
			{
				id: CodemodAdapterId.Mui,
				adapter: createMuiAdapter({ moduleLoader: unavailableLoader }),
				files: ["/project/src/theme.ts"],
				readFile: (file: string) =>
					file.endsWith("src/theme.ts") ? "export const theme = createTheme({})" : undefined,
			},
			{
				id: CodemodAdapterId.Mantine,
				adapter: createMantineAdapter({ moduleLoader: unavailableLoader }),
				files: ["/project/src/theme.ts"],
				readFile: (file: string) =>
					file.endsWith("src/theme.ts") ? "export const theme = createTheme({})" : undefined,
			},
		];

		const results = await Promise.all(
			cases.map(async ({ adapter, files, readFile }) =>
				adapter.loadConfigAsync?.({
					file: "src/App.tsx",
					source: "",
					root: "/project",
					readFile,
					listFiles: () => files,
				}),
			),
		);

		expect(
			results.map((config) => ({
				adapter: config?.adapter,
				residuals: config?.residuals,
			})),
		).toMatchInlineSnapshot(`
			[
			  {
			    "adapter": "tailwind",
			    "residuals": [
			      {
			        "hint": "the official @tailwindcss/node loader is unavailable for a discovered Tailwind CSS graph",
			        "kind": "configuration",
			        "text": "Tailwind project configuration",
			      },
			    ],
			  },
			  {
			    "adapter": "unocss",
			    "residuals": [
			      {
			        "hint": "the official UnoCSS config and generator packages are unavailable for a discovered config",
			        "kind": "configuration",
			        "text": "UnoCSS project configuration",
			      },
			    ],
			  },
			  {
			    "adapter": "tokenami",
			    "residuals": [
			      {
			        "hint": "the official @tokenami/css config utility is unavailable for a discovered config",
			        "kind": "configuration",
			        "text": "Tokenami project configuration",
			      },
			    ],
			  },
			  {
			    "adapter": "chakra-ui",
			    "residuals": [
			      {
			        "hint": "the official @chakra-ui/react package is unavailable for a discovered theme module",
			        "kind": "configuration",
			        "text": "Chakra project configuration",
			      },
			    ],
			  },
			  {
			    "adapter": "mui",
			    "residuals": [
			      {
			        "hint": "the official @mui/system or @mui/material package is unavailable for a discovered theme module",
			        "kind": "configuration",
			        "text": "MUI project theme",
			      },
			    ],
			  },
			  {
			    "adapter": "mantine",
			    "residuals": [
			      {
			        "hint": "the official @mantine/core package is unavailable for a discovered theme module",
			        "kind": "configuration",
			        "text": "Mantine project theme",
			      },
			    ],
			  },
			]
		`);
		for (const config of results) {
			expect(config?.residuals).toHaveLength(1);
			expect(config?.residuals?.[0]?.kind).toBe(StyleProgramResidualKindTag.Configuration);
		}
	});

	test("publishes a MUI configuration residual when a discovered theme cannot be evaluated", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				return packageName === "@mui/system"
					? ({ createTheme: (config: Record<string, unknown>) => config } as never)
					: undefined;
			},
			async importFile() {
				return undefined;
			},
		};
		const config = await createMuiAdapter({ moduleLoader: loader }).loadConfigAsync?.({
			file: "src/App.tsx",
			source: "",
			root: "/project",
			readFile: (file) =>
				file.endsWith("/src/theme.ts") ? "export const theme = evaluateTheme()" : undefined,
			listFiles: () => ["/project/src/theme.ts"],
		});

		expect(config?.residuals).toEqual([
			expect.objectContaining({
				kind: "configuration",
				text: "MUI project theme",
				hint: expect.stringContaining("discovered theme module could not be evaluated"),
			}),
		]);
		const source = `import { Box } from "@mui/material";
export const App = () => <Box sx={{ padding: 2 }} />;`;
		const result = await runAdapterMigrationAsync(source, {
			from: CodemodAdapterId.Mui,
			to: CodemodAdapterId.Pandwind,
			file: "src/App.tsx",
			root: "/project",
			readFile: (file) =>
				file.endsWith("/src/theme.ts") ? "export const theme = evaluateTheme()" : undefined,
			listFiles: () => ["/project/src/theme.ts"],
			moduleLoader: loader,
			mode: "safe",
			adapterRegistry: createBuiltinCodemodCatalog(loader).registry,
		});

		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: "configuration",
					text: "MUI project theme",
				}),
			]),
		);
		expect(result.skipped).toBe(1);
		expect(result.code).toContain("pandwind:migrate-skip");
		expect(result.code).toContain("sx={{ padding: 2 }}");
		expect(result.code).toMatchInlineSnapshot(`
			"// pandwind:migrate-skip (configuration-residual: configuration)
			import { Box } from "@mui/material";
			export const App = () => <Box sx={{ padding: 2 }} />;"
		`);
	});

	test("publishes a MUI configuration residual when importing a discovered theme throws", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				return packageName === "@mui/system"
					? ({ createTheme: (config: Record<string, unknown>) => config } as never)
					: undefined;
			},
			async importFile() {
				throw new Error("theme load failed");
			},
		};
		const config = await createMuiAdapter({ moduleLoader: loader }).loadConfigAsync?.({
			file: "src/App.tsx",
			source: "",
			root: "/project",
			readFile: (file) =>
				file.endsWith("/src/theme.ts") ? "export const theme = createTheme({})" : undefined,
			listFiles: () => ["/project/src/theme.ts"],
		});

		expect(config?.residuals).toEqual([
			expect.objectContaining({
				kind: "configuration",
				text: "MUI project theme",
				hint: expect.stringContaining("discovered theme module could not be imported"),
			}),
		]);
	});

	test("preserves a configuration residual when no UnoCSS config is discovered", async () => {
		const config = await createUnoCssAdapter({ moduleLoader: unavailableLoader }).loadConfigAsync?.(
			{
				file: "src/App.tsx",
				source: '<div className="flex" />',
				root: "/project",
				listFiles: () => [],
			},
		);

		expect(config?.residuals).toEqual([
			expect.objectContaining({
				kind: "configuration",
				hint: expect.stringContaining("no uno.config or unocss.config file was found"),
			}),
		]);
		expect(config?.values.officialConfigPackages).toBeUndefined();
	});

	test("marks a stylesheet migration changed when config loading adds a CSS-safe residual", async () => {
		const source = ".card { color: red; }";
		const catalog = createBuiltinCodemodCatalog();
		const authoredCss = catalog.registry.get(CodemodAdapterId.AuthoredCss)!;
		const pandwind = createPandwindAdapter();
		const result = await runAdapterMigrationAsync(source, {
			from: CodemodAdapterId.AuthoredCss,
			to: CodemodAdapterId.Pandwind,
			file: "styles.css",
			adapterRegistry: createStyleAdapterRegistry([
				authoredCss,
				{
					...pandwind,
					async loadConfigAsync(context) {
						return {
							...pandwind.loadConfig(context),
							residuals: [
								{
									kind: StyleProgramResidualKindTag.Configuration,
									text: "Pandwind project configuration",
									hint: "configuration evidence is unavailable",
								},
							],
						};
					},
				},
			]),
			mode: "safe",
		});

		expect(result.changed).toBe(true);
		expect(result.code).toMatch(/^\/\* pandwind:migrate-skip /u);
		expect(result.code).toContain(source);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: StyleProgramResidualKindTag.Configuration }),
			]),
		);
	});
});
