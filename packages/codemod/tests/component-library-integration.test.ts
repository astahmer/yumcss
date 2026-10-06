import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { examplePreset } from "@yumcss/example-preset";
import { buildYumCSSLib } from "../src/lib/build.ts";
import { yumcssExtractVite } from "yumcss/vite";
import { validateYumCSSLibArtifact } from "yumcss/vite/lib-artifact";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

const copyFixture = (): string => {
	const root = mkdtempSync(join(tmpdir(), "yumcss-component-library-"));
	temporaryDirectories.push(root);
	cpSync(resolve(import.meta.dirname, "fixtures/component-library"), root, { recursive: true });
	return root;
};

describe("component-library JS and CSS distribution", () => {
	test("prunes library JavaScript and consumes its lib CSS artifact separately", async () => {
		const libraryRoot = copyFixture();
		const sourcePath = join(libraryRoot, "src/card.ts");
		const source = readFileSync(sourcePath, "utf8");
		const libraryPlugin = yumcssExtractVite(examplePreset, { root: libraryRoot });
		const transformed = await libraryPlugin.transform!.call(null, source, sourcePath);

		expect(transformed).not.toBeNull();
		expect(transformed).toMatchObject({ code: expect.stringContaining("yumcss:runtime/css") });
		expect(transformed?.code).toContain("createDesignCss(undefined)");
		expect(transformed?.code).not.toContain("@yumcss/example-preset");

		const built = buildYumCSSLib({
			root: libraryRoot,
			preset: examplePreset,
			sourcePatterns: ["src"],
		});
		expect(built.files).toEqual([sourcePath]);
		expect(validateYumCSSLibArtifact(built.artifact)).toMatchObject({ valid: true });
		expect(built.artifact.rules.atomic.length).toBeGreaterThan(0);
		expect(built.artifact.rules.atomic.some((rule) => rule.css.includes("background-color"))).toBe(
			true,
		);
		expect(built.artifact.rules.atomic.some((rule) => rule.css.includes("padding"))).toBe(true);

		const outputPath = join(libraryRoot, "dist/yumcss.lib.json");
		mkdirSync(join(libraryRoot, "dist"), { recursive: true });
		writeFileSync(outputPath, `${JSON.stringify(built.artifact, null, "\t")}\n`);

		const consumerRoot = mkdtempSync(join(tmpdir(), "yumcss-component-consumer-"));
		temporaryDirectories.push(consumerRoot);
		const consumerPlugin = yumcssExtractVite(examplePreset, {
			root: consumerRoot,
			libraries: ["@acme/ui"],
		});
		let requested: string | undefined;
		await consumerPlugin.buildStart!.call({
			resolve: async (specifier) => {
				requested = specifier;
				return {
					id: outputPath,
					external: false,
					resolvedBy: "test",
					attributes: {},
					meta: {},
					moduleSideEffects: true,
					syntheticNamedExports: false,
				};
			},
		});

		expect(requested).toBe("@acme/ui/yumcss.lib.json");
		const virtualId = consumerPlugin.resolveId("yumcss:css");
		expect(consumerPlugin.load(virtualId!)).toContain("background-color");
		expect(
			await consumerPlugin.transform!.call(
				null,
				source,
				join(consumerRoot, "node_modules/@acme/ui/dist/card.js"),
			),
		).toBeNull();
	});
});
