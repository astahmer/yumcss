import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createPandwindAdapter,
	createStyleAdapterRegistry,
	createUnoCssAdapter,
	runAdapterMigrationAsync,
} from "../src/swap/index.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";

const root = "/project";
const file = "src/App.tsx";
const cssFile = `${root}/src/styles.css`;

function createLoader(candidates: string[][]): ProjectModuleLoader {
	return {
		async importPackage(packageName) {
			if (packageName === "@unocss/config")
				return {
					loadConfig: async () => ({
						config: {
							theme: { colors: { brand: "#123456" } },
							rules: [[/^badge-brand$/, { "border-width": "2px" }]],
							shortcuts: { "shortcut-brand": "bg-brand text-white" },
						},
						sources: ["uno.config.ts"],
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
										if (token === "shortcut-brand")
											return "@media (min-width: 48rem){.shortcut-brand:hover{color:#fff}}";
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
	return runAdapterMigrationAsync(source, {
		from: CodemodAdapterId.UnoCSS,
		to: CodemodAdapterId.Pandwind,
		file,
		root,
		readFile: (path) => projectFiles[path],
		listFiles: () => Object.keys(projectFiles),
		adapterRegistry: createStyleAdapterRegistry([
			createUnoCssAdapter({ moduleLoader: createLoader(candidates) }),
			target,
		]),
	});
}

describe("UnoCSS official extraction context", () => {
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
			"import { createCss } from "pandwind/css";
			const css = createCss();
			const classes = "badge-brand";
			export const App = () => <div data-x={classes}  className={css.class({ borderWidth: "2px" })}/>;"
		`);
	});

	test("parses nested official CSS and preserves theme values", async () => {
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
			"import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <div className={css.class({ backgroundColor: "#123456", "@media (min-width: 48rem)": { _hover: { color: "#fff" } } })}/>;"
		`);
	});
});
