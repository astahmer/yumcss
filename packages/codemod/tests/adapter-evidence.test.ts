import { describe, expect, test } from "vitest";
import {
	AdapterConfigEvidenceSourceTag,
	AdapterEvidence,
	AdapterEvidenceStatusTag,
	AdapterOfficialApiStatusTag,
	AdapterPluginResolutionTag,
	CodemodAdapterId,
	createPandaAdapter,
	createBuiltinCodemodCatalog,
} from "../src/swap/index.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";

const catalog = createBuiltinCodemodCatalog();

describe("adapter evidence contracts", () => {
	test("every registered adapter publishes a non-empty official API manifest", () => {
		const summaries = catalog.registry.adapters.map((adapter) => ({
			id: adapter.id,
			apiCount: adapter.officialApi.apis.length,
			configCount: adapter.officialApi.configEntrypoints.length,
		}));

		expect(summaries.every(({ apiCount }) => apiCount > 0)).toBe(true);
		expect(summaries).toMatchInlineSnapshot(`
			[
			  {
			    "apiCount": 3,
			    "configCount": 4,
			    "id": "pandwind",
			  },
			  {
			    "apiCount": 1,
			    "configCount": 2,
			    "id": "bamboo",
			  },
			  {
			    "apiCount": 11,
			    "configCount": 3,
			    "id": "chakra-ui",
			  },
			  {
			    "apiCount": 11,
			    "configCount": 3,
			    "id": "emotion",
			  },
			  {
			    "apiCount": 8,
			    "configCount": 1,
			    "id": "styled-components",
			  },
			  {
			    "apiCount": 10,
			    "configCount": 1,
			    "id": "vanilla-extract",
			  },
			  {
			    "apiCount": 4,
			    "configCount": 2,
			    "id": "stitches",
			  },
			  {
			    "apiCount": 2,
			    "configCount": 2,
			    "id": "linaria",
			  },
			  {
			    "apiCount": 4,
			    "configCount": 3,
			    "id": "mantine",
			  },
			  {
			    "apiCount": 4,
			    "configCount": 3,
			    "id": "mui",
			  },
			  {
			    "apiCount": 2,
			    "configCount": 1,
			    "id": "next-yak",
			  },
			  {
			    "apiCount": 5,
			    "configCount": 3,
			    "id": "panda",
			  },
			  {
			    "apiCount": 4,
			    "configCount": 4,
			    "id": "tailwind",
			  },
			  {
			    "apiCount": 3,
			    "configCount": 1,
			    "id": "jss",
			  },
			  {
			    "apiCount": 4,
			    "configCount": 1,
			    "id": "stylex",
			  },
			  {
			    "apiCount": 7,
			    "configCount": 1,
			    "id": "react-strict-dom",
			  },
			  {
			    "apiCount": 3,
			    "configCount": 0,
			    "id": "fela",
			  },
			  {
			    "apiCount": 4,
			    "configCount": 0,
			    "id": "goober",
			  },
			  {
			    "apiCount": 4,
			    "configCount": 0,
			    "id": "aphrodite",
			  },
			  {
			    "apiCount": 2,
			    "configCount": 0,
			    "id": "style9",
			  },
			  {
			    "apiCount": 2,
			    "configCount": 0,
			    "id": "treat",
			  },
			  {
			    "apiCount": 5,
			    "configCount": 1,
			    "id": "compiled",
			  },
			  {
			    "apiCount": 3,
			    "configCount": 0,
			    "id": "solid-styled",
			  },
			  {
			    "apiCount": 3,
			    "configCount": 0,
			    "id": "vue-styled",
			  },
			  {
			    "apiCount": 2,
			    "configCount": 0,
			    "id": "react-native",
			  },
			  {
			    "apiCount": 2,
			    "configCount": 3,
			    "id": "tokenami",
			  },
			  {
			    "apiCount": 4,
			    "configCount": 2,
			    "id": "unocss",
			  },
			  {
			    "apiCount": 1,
			    "configCount": 1,
			    "id": "authored-css",
			  },
			  {
			    "apiCount": 1,
			    "configCount": 1,
			    "id": "css-modules",
			  },
			  {
			    "apiCount": 1,
			    "configCount": 1,
			    "id": "sass",
			  },
			  {
			    "apiCount": 1,
			    "configCount": 1,
			    "id": "less",
			  },
			  {
			    "apiCount": 1,
			    "configCount": 3,
			    "id": "tamagui",
			  },
			]
		`);
	});

	test("does not claim a bare Chakra css API while retaining documented system.css", () => {
		const adapter = catalog.registry.get(CodemodAdapterId.ChakraUi)!;
		const names = adapter.officialApi.apis.map(({ name }) => name);

		expect(names).toContain("chakra-system-css");
		expect(names).not.toContain("css");
		expect(names).not.toContain("chakra.css");
	});

	test("records official loader, fallback, artifact, and unresolved evidence", () => {
		const config = AdapterEvidence.normalizeConfig({
			adapter: CodemodAdapterId.Panda,
			files: ["/project/panda.config.ts", "/project/pandwind.interop.json"],
			values: {
				officialConfigPackage: "@pandacss/config",
				officialConfigError: "plugin failed",
				plugins: ["@pandacss/preset-base", () => undefined],
			},
			residuals: [{ kind: "configuration", text: "Panda project configuration", hint: "review" }],
		});

		expect(config.configuration).toMatchInlineSnapshot(`
			[
			  {
			    "detail": "plugin failed",
			    "packages": [
			      "@pandacss/config",
			    ],
			    "source": "official-loader",
			    "status": "failed",
			  },
			  {
			    "paths": [
			      "/project/pandwind.interop.json",
			    ],
			    "source": "generated-artifact",
			    "status": "resolved",
			  },
			  {
			    "detail": "configuration residual requires review",
			    "source": "unresolved",
			    "status": "failed",
			  },
			]
		`);
		expect(config.plugins).toMatchInlineSnapshot(`
			{
			  "complete": false,
			  "plugins": [
			    {
			      "name": "@pandacss/preset-base",
			      "packageName": "@pandacss/preset-base",
			      "resolution": "resolved",
			    },
			    {
			      "detail": "plugin value was not statically identified",
			      "name": "configured-plugin-2",
			      "resolution": "unresolved",
			    },
			  ],
			}
		`);
		expect(config.configuration?.map(({ source }) => source)).toEqual([
			AdapterConfigEvidenceSourceTag.OfficialLoader,
			AdapterConfigEvidenceSourceTag.GeneratedArtifact,
			AdapterConfigEvidenceSourceTag.Unresolved,
		]);
		expect(config.plugins?.plugins[1]?.resolution).toBe(AdapterPluginResolutionTag.Unresolved);
	});

	test("marks simple source configuration as a resolved fallback", () => {
		const config = AdapterEvidence.normalizeConfig({
			adapter: CodemodAdapterId.Emotion,
			files: ["/project/.emotionrc"],
			values: {},
		});

		expect(config.configuration).toEqual([
			{
				source: AdapterConfigEvidenceSourceTag.ProjectSourceFallback,
				status: AdapterEvidenceStatusTag.Resolved,
				paths: ["/project/.emotionrc"],
			},
		]);
		expect(AdapterOfficialApiStatusTag.Supported).toBe("supported");
	});

	test("promotes an official Panda plugin chain into project evidence", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				if (packageName !== "@pandacss/config") return undefined;
				return {
					loadConfig: async () => ({
						config: {
							plugins: ["@acme/panda-plugin", () => undefined],
							theme: { tokens: { colors: { brand: { value: "#123456" } } } },
						},
					}),
				} as never;
			},
			async importFile() {
				return undefined;
			},
		};
		const adapter = createPandaAdapter({ moduleLoader: loader });
		const config = await adapter.loadConfigAsync?.({
			file: "src/App.tsx",
			source: "export default {};",
			root: "/project",
			readFile: () => "export default {};",
			listFiles: () => ["/project/panda.config.ts"],
		});

		expect(config?.configuration?.[0]).toMatchInlineSnapshot(`
			{
			  "packages": [
			    "@pandacss/config",
			  ],
			  "source": "official-loader",
			  "status": "resolved",
			}
		`);
		expect(config?.plugins).toMatchInlineSnapshot(`
			{
			  "complete": false,
			  "plugins": [
			    {
			      "name": "@acme/panda-plugin",
			      "packageName": "@acme/panda-plugin",
			      "resolution": "resolved",
			    },
			    {
			      "detail": "plugin value was not statically identified",
			      "name": "configured-plugin-2",
			      "resolution": "unresolved",
			    },
			  ],
			}
		`);
		expect(config?.tokenCatalog?.groups.colors).toEqual({ brand: "#123456" });
	});
});
