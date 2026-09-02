import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createChakraAdapter,
	createPandaAdapter,
	createPandwindAdapter,
	createStyleAdapterRegistry,
	createTailwindAdapter,
	createTokenamiAdapter,
	createUnoCssAdapter,
	runAdapterMigrationAsync,
} from "../src/swap/index.ts";
import type { ProjectModuleLoader } from "../src/swap/project-module-loader.ts";

const root = "/project";
const file = "src/Card.tsx";

type CustomTarget =
	| ReturnType<typeof createChakraAdapter>
	| ReturnType<typeof createPandaAdapter>
	| ReturnType<typeof createPandwindAdapter>
	| ReturnType<typeof createTailwindAdapter>
	| ReturnType<typeof createTokenamiAdapter>
	| ReturnType<typeof createUnoCssAdapter>;

function registryFor(target: CustomTarget) {
	const builtin = createBuiltinCodemodCatalog();
	return createStyleAdapterRegistry([builtin.registry.get(CodemodAdapterId.Emotion)!, target]);
}

function projectFiles(
	files: Readonly<Record<string, string>>,
): (path: string) => string | undefined {
	return (path) => files[path];
}

async function migrateTo(target: CustomTarget, files: Readonly<Record<string, string>>) {
	return runAdapterMigrationAsync(
		'import { css } from "@emotion/css";\nexport const card = css({ color: "#123456", padding: "17px" });',
		{
			from: CodemodAdapterId.Emotion,
			to: target.id,
			file,
			root,
			readFile: projectFiles(files),
			listFiles: () => Object.keys(files),
			adapterRegistry: registryFor(target),
		},
	);
}

describe("custom design-system context resolution", () => {
	test("resolves custom Chakra tokens through the official system config", async () => {
		const system = {
			$$chakra: true as const,
			_config: {
				theme: {
					tokens: {
						colors: { brand: { "500": { value: "#123456" } } },
					},
				},
			},
			token: { var: (path: string) => `var(--chakra-${path.replaceAll(".", "-")})` },
		};
		const loader: ProjectModuleLoader = {
			async importPackage() {
				return { isValidSystem: (value: unknown) => value === system } as never;
			},
			async importFile() {
				return { default: system } as never;
			},
		};
		const adapter = createChakraAdapter({ moduleLoader: loader });
		const result = await runAdapterMigrationAsync(
			'import { css } from "@emotion/css";\nexport const card = css({ color: "#123456" });',
			{
				from: CodemodAdapterId.Emotion,
				to: CodemodAdapterId.ChakraUi,
				file,
				root,
				readFile: projectFiles({ [`${root}/src/theme.ts`]: "export default {}" }),
				adapterRegistry: createStyleAdapterRegistry([
					createBuiltinCodemodCatalog().registry.get(CodemodAdapterId.Emotion)!,
					adapter,
				]),
			},
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('color: "brand.500"');
		expect(result.code).not.toContain("#123456");
		expect(result.code).toMatchInlineSnapshot(`
			"import { defaultSystem } from "@chakra-ui/react";

			export const card = defaultSystem.css({ color: "brand.500" });"
		`);
	});

	test("resolves custom Panda tokens through the official config loader", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				return packageName === "@pandacss/config"
					? ({
							loadConfig: async () => ({
								config: {
									theme: {
										tokens: {
											colors: { brand: { "500": { value: "#123456" } } },
										},
									},
								},
							}),
						} as never)
					: undefined;
			},
			async importFile() {
				return undefined;
			},
		};
		const sourceAdapter = createPandaAdapter({ moduleLoader: loader });
		const target = createChakraAdapter({ moduleLoader: loader });
		const result = await runAdapterMigrationAsync(
			'import { css } from "styled-system/css";\nexport const card = css({ color: "brand.500" });',
			{
				from: CodemodAdapterId.Panda,
				to: CodemodAdapterId.ChakraUi,
				file,
				root,
				readFile: projectFiles({
					[`${root}/panda.config.ts`]: "export default {}",
					[`${root}/src/theme.ts`]: "export default {}",
				}),
				adapterRegistry: createStyleAdapterRegistry([sourceAdapter, target]),
			},
		);

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('color: "brand.500"');
		expect(result.code).toMatchInlineSnapshot(`
			"import { defaultSystem } from "@chakra-ui/react";

			export const card = defaultSystem.css({ color: "brand.500" });"
		`);
	});

	test("resolves custom Panda tokens when Panda is the target adapter", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				return packageName === "@pandacss/config"
					? ({
							loadConfig: async () => ({
								config: {
									theme: {
										tokens: {
											colors: { brand: { "500": { value: "#123456" } } },
										},
									},
								},
							}),
						} as never)
					: undefined;
			},
			async importFile() {
				return undefined;
			},
		};
		const result = await migrateTo(createPandaAdapter({ moduleLoader: loader }), {
			[`${root}/panda.config.ts`]: "export default {}",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('color: "brand.500"');
		expect(result.code).not.toContain("#123456");
		expect(result.code).toMatchInlineSnapshot(`
			"import { css } from "styled-system/css";

			export const card = css({ padding: "17px", color: "brand.500" });"
		`);
	});

	test("resolves custom Tailwind utilities and tokens through the official engine", async () => {
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
						candidatesToCss: (candidates: readonly string[]) =>
							candidates.map((candidate) =>
								candidate === "btn-brand"
									? ".btn-brand{background-color:#123456}"
									: candidate === "text-brand"
										? ".text-brand{color:#123456}"
										: null,
							),
					}),
				} as never;
			},
			async importFile() {
				return undefined;
			},
		};
		const target = createTailwindAdapter({ moduleLoader: loader });
		const result = await migrateTo(target, {
			[`${root}/tailwind.css`]: '@import "tailwindcss";',
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"p-card text-brand"');
		expect(result.code).not.toContain("#123456");
		expect(result.code).toMatchInlineSnapshot(`
			"
			export const card = "p-card text-brand";"
		`);

		const source = await runAdapterMigrationAsync(
			'export const App = () => <div className="btn-brand text-brand" />;',
			{
				from: CodemodAdapterId.Tailwind,
				to: CodemodAdapterId.Pandwind,
				file,
				root,
				readFile: projectFiles({ [`${root}/tailwind.css`]: '@import "tailwindcss";' }),
				listFiles: () => [`${root}/tailwind.css`],
				adapterRegistry: createStyleAdapterRegistry([
					target,
					createPandwindAdapter({ moduleLoader: null }),
				]),
			},
		);

		expect(source.converted).toBe(1);
		expect(source.residuals).toEqual([]);
		expect(source.code).toContain('backgroundColor: "#123456"');
		expect(source.code).toContain('color: "#123456"');
		expect(source.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <div  className={css.class({ backgroundColor: "#123456", color: "#123456" })}/>;"
		`);
	});

	test("resolves custom UnoCSS utilities and tokens through the official generator", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage(packageName) {
				if (packageName === "@unocss/config")
					return {
						loadConfig: async () => ({
							config: {
								theme: { colors: { brand: "#123456" }, spacing: { card: "17px" } },
							},
							sources: [],
						}),
					} as never;
				return {
					createGenerator: async () => ({
						generate: async (tokens: readonly string[]) => ({
							css: tokens
								.map((token) =>
									token === "btn-brand"
										? ".btn-brand{background-color:#123456}"
										: ".text-brand{color:#123456}",
								)
								.join(""),
						}),
					}),
				} as never;
			},
			async importFile() {
				return undefined;
			},
		};
		const target = createUnoCssAdapter({ moduleLoader: loader });
		const result = await migrateTo(target, {
			[`${root}/src/Card.tsx`]: "",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"p-card text-brand"');
		expect(result.code).not.toContain("#123456");
		expect(result.code).toMatchInlineSnapshot(`
			"
			export const card = "p-card text-brand";"
		`);

		const source = await runAdapterMigrationAsync(
			'export const App = () => <div class="btn-brand text-brand" />;',
			{
				from: CodemodAdapterId.UnoCSS,
				to: CodemodAdapterId.Pandwind,
				file,
				root,
				readFile: projectFiles({}),
				adapterRegistry: createStyleAdapterRegistry([
					target,
					createPandwindAdapter({ moduleLoader: null }),
				]),
			},
		);

		expect(source.converted).toBe(1);
		expect(source.residuals).toEqual([]);
		expect(source.code).toContain('backgroundColor: "#123456"');
		expect(source.code).toContain('color: "#123456"');
		expect(source.code).toMatchInlineSnapshot(`
			"import { createCss } from "pandwind/css";
			const css = createCss();
			export const App = () => <div  className={css.class({ backgroundColor: "#123456", color: "#123456" })}/>;"
		`);
	});

	test("resolves custom Tokenami tokens with its native authored reference", async () => {
		const loader: ProjectModuleLoader = {
			async importPackage() {
				return { createConfig: (value: unknown) => value } as never;
			},
			async importFile() {
				return { default: { tokens: { colors: { brand: { value: "#123456" } } } } } as never;
			},
		};
		const result = await migrateTo(createTokenamiAdapter({ moduleLoader: loader }), {
			[`${root}/tokenami.config.ts`]: "export default {}",
		});

		expect(result.converted).toBe(1);
		expect(result.skipped).toBe(0);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('"$colors.brand"');
		expect(result.code).not.toContain("#123456");
		expect(result.code).toMatchInlineSnapshot(`
			"import { css } from "@tokenami/css";

			export const card = css({ padding: "17px", color: "$colors.brand" });"
		`);
	});
});
