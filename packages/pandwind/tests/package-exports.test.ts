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
	"pandwind/codegen/types",
	"pandwind/codegen/theme",
	"pandwind/codegen/collect",
	"pandwind/codegen/bridge",
	"pandwind/react-native",
	"pandwind/opentui",
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
		expect("createHashFn" in cssApi).toBe(false);
		expect("hashCssVar" in cssApi).toBe(false);
		expect("createVarCompiler" in cssApi).toBe(false);
		expect("VARS_ATOMS" in cssApi).toBe(false);
	});

	test("does not expose the codemod-owned recipe runtime", () => {
		expect(() => import.meta.resolve("pandwind/recipe")).toThrow();
	});

	test("keeps build-only packages out of runtime dependencies", () => {
		expect(packageManifest.repository.directory).toBe("packages/pandwind");
		expect(packageManifest.dependencies).toEqual({ csstype: "3.2.3" });
		for (const dependency of ["@tailwindcss/node", "cac", "oxc-parser", "postcss", "unplugin"]) {
			expect(packageManifest.peerDependencies[dependency]).toBeDefined();
			expect(packageManifest.peerDependenciesMeta[dependency]).toEqual({ optional: true });
		}
	});
});
