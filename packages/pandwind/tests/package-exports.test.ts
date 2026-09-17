import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const packageManifest = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
	readonly repository: { readonly directory: string };
	readonly dependencies: Readonly<Record<string, string>>;
	readonly sideEffects: readonly string[];
	readonly peerDependencies: Readonly<Record<string, string>>;
	readonly peerDependenciesMeta: Readonly<Record<string, { readonly optional?: boolean }>>;
	readonly exports: Readonly<Record<string, unknown>>;
};

const entries = [
	"pandwind/css",
	"pandwind/css/generated",
	"pandwind/css/named",
	"pandwind/css/stylex",
	"pandwind/css/panda",
	"pandwind/css/unocss",
	"pandwind/unsafe/css",
	"pandwind/tw",
	"pandwind/cx",
	"pandwind/preset",
	"pandwind/preset/csstype",
	"pandwind/preset/default",
	"pandwind/preset/tailwindcss",
	"pandwind/preset/chakra",
	"pandwind/preset/shadcn",
	"pandwind/preset/panda",
	"pandwind/reset/tailwindcss",
	"pandwind/reset/panda",
	"pandwind/reset/pandwind",
	"pandwind/prose/tailwindcss",
	"pandwind/design",
	"pandwind/vite",
	"pandwind/unplugin",
	"pandwind/css/selector-scan",
	"pandwind/react-native",
	"pandwind/opentui",
	"pandwind/react-strict-dom",
	"pandwind/stack",
	"pandwind/stack/react",
	"pandwind/stack/solid",
	"pandwind/stack/vue",
	"pandwind/stack/preact",
	"pandwind/types/typings",
] as const;

describe("pandwind package boundary", () => {
	test.each(entries)("resolves %s through exports", async (specifier) => {
		const resolved = await import.meta.resolve(specifier);
		// The workspace `pandwind` condition resolves source; a built package
		// resolves dist. Both are valid package-boundary resolutions.
		expect(resolved).toMatch(/packages\/pandwind\/(?:src|dist)\//);
	});

	test("does not expose CSS compiler internals from the public css lane", async () => {
		const cssApi = await import("pandwind/css");
		expect("createGeneratedCss" in cssApi).toBe(false);
		expect("createNamedAtomsStrategy" in cssApi).toBe(false);
		expect("createStyleXAdapter" in cssApi).toBe(false);
		expect("createPandaAdapter" in cssApi).toBe(false);
		expect("createUnoCssAdapter" in cssApi).toBe(false);
		expect("createUnsafeCss" in cssApi).toBe(false);
		expect("createCssOpen" in cssApi).toBe(false);
		expect("createHashFn" in cssApi).toBe(false);
		expect("hashCssVar" in cssApi).toBe(false);
		expect("createVarCompiler" in cssApi).toBe(false);
		expect("VARS_ATOMS" in cssApi).toBe(false);
	});

	test("keeps the strategy contract on the css entrypoint", async () => {
		await import("pandwind/css");
		expect(() => import.meta.resolve("pandwind/css/class-name-strategy")).toThrow();
	});

	test("exposes generated CSS and runtime class-name strategies through dedicated lanes", async () => {
		const generatedApi = await import("pandwind/css/generated");
		const namedAtomsApi = await import("pandwind/css/named");
		const stylexApi = await import("pandwind/css/stylex");
		const pandaApi = await import("pandwind/css/panda");
		const unocssApi = await import("pandwind/css/unocss");

		expect(generatedApi.createGeneratedCss).toBeTypeOf("function");
		expect(namedAtomsApi.createNamedAtomsStrategy).toBeTypeOf("function");
		expect(stylexApi.createStyleXAdapter).toBeTypeOf("function");
		expect(pandaApi.createPandaAdapter).toBeTypeOf("function");
		expect(unocssApi.createUnoCssAdapter).toBeTypeOf("function");
	});

	test("exposes the open CSS compiler only through the unsafe lane", async () => {
		const unsafeApi = await import("pandwind/unsafe/css");
		expect(unsafeApi.createUnsafeCss).toBeTypeOf("function");
	});

	test("exposes token composers on catalogs instead of standalone helpers", async () => {
		const presetApi = await import("pandwind/preset");
		expect("define" in presetApi).toBe(true);
		const builders = [
			"conditions",
			"properties",
			"tokens",
			"theme",
			"preset",
		] satisfies ReadonlyArray<keyof typeof presetApi.define>;
		for (const builder of builders) {
			expect(presetApi.define[builder]).toBeTypeOf("function");
		}
		expect(Object.keys(presetApi.define).toSorted()).toEqual([
			"conditions",
			"preset",
			"properties",
			"theme",
			"tokens",
		]);
		for (const builder of [
			"definePreset",
			"defineTheme",
			"defineTokens",
			"defineConditions",
			"defineProperties",
		]) {
			expect(builder in presetApi).toBe(false);
		}
		expect("defineSemanticTokens" in presetApi).toBe(false);
		expect("defineColorPalettes" in presetApi).toBe(false);

		const tokens = presetApi.define.tokens({ colors: { blue: "#3182ce" } });
		const themedTokens = tokens.defineSemanticTokens(
			{ base: "", _dark: ".dark &" },
			{ semantic: { surface: { base: "colors.blue", _dark: "colors.blue" } } },
		);

		expect(Object.keys(themedTokens)).toEqual(["colors", "semantic"]);
		expect(themedTokens.defineColorPalettes({ brand: "colors.blue" })).toEqual({
			brand: "colors.blue",
		});
	});

	test("exposes explicit csstype, default, tailwindcss, chakra, shadcn, and panda preset subpaths", async () => {
		const csstypeApi = await import(await import.meta.resolve("pandwind/preset/csstype"));
		const defaultApi = await import(await import.meta.resolve("pandwind/preset/default"));
		const tailwindApi = await import(await import.meta.resolve("pandwind/preset/tailwindcss"));
		const chakraApi = await import(await import.meta.resolve("pandwind/preset/chakra"));
		const shadcnApi = await import(await import.meta.resolve("pandwind/preset/shadcn"));
		const pandaApi = await import(await import.meta.resolve("pandwind/preset/panda"));

		expect(csstypeApi.csstypePreset.properties).toEqual({ $all: true });
		expect(defaultApi.defaultPreset.properties).toHaveProperty("padding");
		expect("pandwindPreset" in defaultApi).toBe(false);
		expect(tailwindApi.tailwindPreset.properties.backgroundColor).toEqual({
			$tokens: "colors",
			$strictness: "inherits",
		});
		expect(tailwindApi.tailwindTokens.colors).toHaveProperty("$slate-700");
		expect(chakraApi.chakraPreset.properties.backgroundColor).toEqual({
			$tokens: "colors",
			$strictness: "inherits",
		});
		expect(chakraApi.chakraTokens.colors).toHaveProperty("$gray.700");
		expect(shadcnApi.shadcnPreset.properties.backgroundColor).toEqual({
			$tokens: "colors",
			$strictness: "inherits",
		});
		expect(shadcnApi.shadcnTokens.colors).toHaveProperty("$primary");
		expect(shadcnApi.shadcnPreset.cssVariables.light).toHaveProperty("radius");
		expect(pandaApi.pandaPreset.properties.backgroundColor).toEqual({
			$tokens: "colors",
			$strictness: "inherits",
		});
		expect(pandaApi.pandaTokens.colors).toHaveProperty("red.500");
		expect(() => import.meta.resolve("pandwind/preset/base")).toThrow();
	});

	test("does not expose the codemod-owned recipe runtime", () => {
		expect(() => import.meta.resolve("pandwind/recipe")).toThrow();
	});

	test("ships ecosystem resets as stylesheet assets", () => {
		expect(packageManifest.exports["./reset/tailwindcss"]).toEqual({
			pandwind: "./src/reset/tailwindcss.css",
			default: "./dist/reset/tailwindcss.css",
		});
		const css = readFileSync(new URL("../src/reset/tailwindcss.css", import.meta.url), "utf8");
		expect(css).toContain("@layer reset {");
		expect(css).toContain("box-sizing: border-box;");
		expect(css).toContain("MIT License — Copyright (c) Tailwind Labs, Inc.");
	});

	test("keeps stylesheet assets side-effectful for bundlers", () => {
		expect(packageManifest.sideEffects).toEqual(["*.css"]);
	});

	test("ships the Panda reset as a stylesheet asset", () => {
		expect(packageManifest.exports["./reset/panda"]).toEqual({
			pandwind: "./src/reset/panda.css",
			default: "./dist/reset/panda.css",
		});
		const css = readFileSync(new URL("../src/reset/panda.css", import.meta.url), "utf8");
		expect(css).toContain("@layer reset {");
		expect(css).toContain("border-color: var(--global-color-border, currentcolor);");
		expect(css).toContain("MIT License - Copyright (c) 2023 Segun Adebayo");
	});

	test("ships Pandwind's own baseline as a stylesheet asset", () => {
		expect(packageManifest.exports["./reset/pandwind"]).toEqual({
			pandwind: "./src/reset/pandwind.css",
			default: "./dist/reset/pandwind.css",
		});
		const css = readFileSync(new URL("../src/reset/pandwind.css", import.meta.url), "utf8");
		expect(css).toContain("@layer reset {");
		expect(css).toContain("border-style: solid;");
		expect(css).toContain("MIT License - Copyright (c) 2026 Alexandre Stahmer");
		expect(css).not.toContain("var(--");
	});

	test("ships the Tailwind prose stylesheet as a stylesheet asset", () => {
		expect(packageManifest.exports["./prose/tailwindcss"]).toEqual({
			pandwind: "./src/prose/tailwindcss.css",
			default: "./dist/prose/tailwindcss.css",
		});
		const css = readFileSync(new URL("../src/prose/tailwindcss.css", import.meta.url), "utf8");
		expect(css).toContain("@layer prose {");
		expect(css).toContain(".prose {");
		expect(css).toContain(".prose-invert");
		expect(css).toContain("--tw-prose-invert-td-borders:");
		expect(css).not.toContain("@layer utilities {");
		expect(css).not.toContain('[class~="not-prose"]');
		expect(css).toContain("MIT License — Copyright (c) Tailwind Labs, Inc.");
	});

	test("keeps build-only packages out of runtime dependencies", () => {
		expect(packageManifest.repository.directory).toBe("packages/pandwind");
		expect(packageManifest.dependencies).toEqual({ csstype: "3.2.3" });
		for (const dependency of ["oxc-parser", "postcss", "unplugin"]) {
			expect(packageManifest.peerDependencies[dependency]).toBeDefined();
			expect(packageManifest.peerDependenciesMeta[dependency]).toEqual({ optional: true });
		}
	});
});
