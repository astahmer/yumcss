import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ResolvedId } from "rollup";
import { afterEach, describe, expect, test } from "vitest";
import { examplePreset } from "@yumcss/example-preset";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createCssExtractorPluginCore } from "../src/vite/css-core.ts";
import { yumcssExtractVite } from "../src/vite/css.ts";
import { createYumCSSLibArtifact, createYumCSSLibCompatibility } from "../src/vite/lib-artifact.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

const makeArtifact = () => {
	const sheet = createStylesheet(examplePreset, {}, { tokens: "used" });
	sheet.process([{ color: "$blue-500" }]);
	return createYumCSSLibArtifact({
		compatibility: createYumCSSLibCompatibility(examplePreset),
		sources: [{ path: "src/button.ts", hash: "source" }],
		tokens: sheet.gen.tokenEntries(),
		web: sheet.gen.web(),
		atomic: sheet.gen.atomicEntries(),
		vars: sheet.gen.varEntries(),
	});
};

const resolveArtifact = async (id: string): Promise<ResolvedId> => ({
	id,
	external: false,
	resolvedBy: "test",
	attributes: {},
	meta: {},
	moduleSideEffects: true,
	syntheticNamedExports: false,
});

describe("YumCSS lib Vite consumption", () => {
	test("serves artifact rules without scanning library source", () => {
		const root = mkdtempSync(join(tmpdir(), "yumcss-lib-vite-"));
		temporaryDirectories.push(root);
		const artifact = makeArtifact();
		const core = createCssExtractorPluginCore(examplePreset, { root }, [artifact]);
		const virtualId = core.resolveId("yumcss:css");

		expect(virtualId).toBe("\0yumcss:css.css");
		expect(core.load(virtualId!)).toContain("color:#3182ce");
	});

	test("loads a package artifact through the Vite resolver", async () => {
		const root = mkdtempSync(join(tmpdir(), "yumcss-lib-vite-"));
		temporaryDirectories.push(root);
		const artifactPath = join(root, "yumcss.lib.json");
		writeFileSync(artifactPath, `${JSON.stringify(makeArtifact(), null, "\t")}\n`);
		const plugin = yumcssExtractVite(examplePreset, { root, libraries: ["@acme/ui"] });
		let requested: string | undefined;

		await plugin.buildStart!.call({
			resolve: async (source) => {
				requested = source;
				return resolveArtifact(artifactPath);
			},
		});

		expect(requested).toBe("@acme/ui/yumcss.lib.json");
		const virtualId = plugin.resolveId("yumcss:css");
		expect(plugin.load(virtualId!)).toContain("color:#3182ce");
	});

	test("deduplicates artifact rules against local source extraction", async () => {
		const root = mkdtempSync(join(tmpdir(), "yumcss-lib-vite-"));
		temporaryDirectories.push(root);
		mkdirSync(join(root, "src"), { recursive: true });
		const source = join(root, "src", "card.ts");
		writeFileSync(source, 'import { css } from "./design"; css.class({ color: "$blue-500" });\n');
		const artifactPath = join(root, "yumcss.lib.json");
		const artifact = makeArtifact();
		writeFileSync(artifactPath, `${JSON.stringify(artifact, null, "\t")}\n`);
		const plugin = yumcssExtractVite(examplePreset, { root, libraries: ["./yumcss.lib.json"] });

		await plugin.buildStart!.call({
			resolve: async () => resolveArtifact(artifactPath),
		});

		const output = plugin.load(plugin.resolveId("yumcss:css")!);
		const occurrences = output!.split(artifact.rules.atomic[0]!.css).length - 1;
		expect(occurrences).toBe(1);
	});

	test("rejects a library artifact with incompatible namespace", () => {
		const base = makeArtifact();
		const artifact = createYumCSSLibArtifact({
			compatibility: createYumCSSLibCompatibility(examplePreset, { namespace: "library" }),
			sources: base.sources,
			tokens: base.tokens,
			web: base.web,
			atomic: base.rules.atomic,
			vars: base.rules.vars,
		});

		expect(() => createCssExtractorPluginCore(examplePreset, {}, [artifact])).toThrow(
			"namespace differs",
		);
	});

	test("accepts a library artifact with the configured named cascade layer", () => {
		const root = mkdtempSync(join(tmpdir(), "yumcss-lib-vite-"));
		temporaryDirectories.push(root);
		const cascade = { mode: "layers", layer: "app.utilities" } as const;
		const base = makeArtifact();
		const artifact = createYumCSSLibArtifact({
			compatibility: createYumCSSLibCompatibility(examplePreset, { cascade }),
			sources: base.sources,
			tokens: base.tokens,
			web: base.web,
			atomic: base.rules.atomic,
			vars: base.rules.vars,
		});

		const core = createCssExtractorPluginCore(examplePreset, { root, cascade }, [artifact]);
		expect(core.load(core.resolveId("yumcss:css")!)).toContain("color:#3182ce");
	});

	test("rejects a malformed package artifact", async () => {
		const root = mkdtempSync(join(tmpdir(), "yumcss-lib-vite-"));
		temporaryDirectories.push(root);
		const artifactPath = join(root, "yumcss.lib.json");
		writeFileSync(artifactPath, "{}\n");
		const plugin = yumcssExtractVite(examplePreset, { root, libraries: ["@acme/ui"] });

		await expect(
			plugin.buildStart!.call({
				resolve: async () => resolveArtifact(artifactPath),
			}),
		).rejects.toThrow("invalid YumCSS lib artifact");
	});
});
