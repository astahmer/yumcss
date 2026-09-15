import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const packageManifest = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
	readonly repository: { readonly directory: string };
	readonly dependencies: Readonly<Record<string, string>>;
	readonly peerDependencies: Readonly<Record<string, string>>;
	readonly peerDependenciesMeta: Readonly<Record<string, { readonly optional?: boolean }>>;
};

const entries = [
	"pandwind/css",
	"pandwind/tw",
	"pandwind/cx",
	"pandwind/preset",
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
		expect("createCssOpen" in cssApi).toBe(false);
		expect("createHashFn" in cssApi).toBe(false);
		expect("hashCssVar" in cssApi).toBe(false);
		expect("createVarCompiler" in cssApi).toBe(false);
		expect("VARS_ATOMS" in cssApi).toBe(false);
	});

	test("exposes token composers on catalogs instead of standalone helpers", async () => {
		const presetApi = await import("pandwind/preset");
		expect("defineSemanticTokens" in presetApi).toBe(false);
		expect("defineColorPalettes" in presetApi).toBe(false);

		const tokens = presetApi.defineTokens({ colors: { blue: "#3182ce" } });
		const themedTokens = tokens.defineSemanticTokens(
			{ base: "", _dark: ".dark &" },
			{ semantic: { surface: { base: "colors.blue", _dark: "colors.blue" } } },
		);

		expect(Object.keys(themedTokens)).toEqual(["colors", "semantic"]);
		expect(themedTokens.defineColorPalettes({ brand: "colors.blue" })).toEqual({
			brand: "colors.blue",
		});
	});

	test("does not expose the codemod-owned recipe runtime", () => {
		expect(() => import.meta.resolve("pandwind/recipe")).toThrow();
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
