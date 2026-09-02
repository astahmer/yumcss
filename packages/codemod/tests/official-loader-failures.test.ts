import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	StyleProgramResidualKindTag,
	createChakraAdapter,
	createTailwindAdapter,
	createTokenamiAdapter,
	createUnoCssAdapter,
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
					file.endsWith("tokenami.config.ts") ? "export default { tokens: {} }" : undefined,
			},
			{
				id: CodemodAdapterId.ChakraUi,
				adapter: createChakraAdapter({ moduleLoader: unavailableLoader }),
				files: ["/project/src/theme.ts"],
				readFile: (file: string) =>
					file.endsWith("src/theme.ts") ? "export const theme = defineConfig({})" : undefined,
			},
		];

		const results = await Promise.all(
			cases.map(async ({ adapter, files, readFile }) =>
				adapter.loadConfigAsync?.({
					file: "src/App.tsx",
					source: "",
					root: "/project",
					files,
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
			        "hint": "the official @tokenami/config package is unavailable for a discovered config",
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
			]
		`);
		for (const config of results) {
			expect(config?.residuals).toHaveLength(1);
			expect(config?.residuals?.[0]?.kind).toBe(StyleProgramResidualKindTag.Configuration);
		}
	});

	test("does not create a false configuration failure for an adapter with no discovered config", async () => {
		const config = await createUnoCssAdapter({ moduleLoader: unavailableLoader }).loadConfigAsync?.(
			{
				file: "src/App.tsx",
				source: '<div className="flex" />',
				root: "/project",
				listFiles: () => [],
			},
		);

		expect(config?.residuals ?? []).toEqual([]);
		expect(config?.values.officialConfigPackages).toBeUndefined();
	});
});
