import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadMetaFromSources, loadMetaFromSourcesAsync } from "../src/meta.ts";

const appDir = resolve(import.meta.dirname, "../../../apps/example/src");
const sourceOptions = {
	typesDtsPath: resolve(appDir, "types.d.ts"),
	twTsPath: resolve(appDir, "tw.ts"),
	bridgePath: resolve(appDir, "bridge.ts"),
};

describe("project-aware migration metadata", () => {
	test("async loading discovers tokens from the generated bridge preset", async () => {
		const meta = await loadMetaFromSourcesAsync(sourceOptions);

		expect(meta.tokens?.colors?.["$blue-500"]).toBe("#3182ce");
	});

	test("sync loading stays explicit when no project token context is supplied", () => {
		const meta = loadMetaFromSources(sourceOptions);

		expect(meta.tokens).toBeUndefined();
		expect(meta.bridgeInverse.get("flex")).toEqual({ property: "display", value: "flex" });
	});

	test("loads the versioned interop artifact without generated source files", () => {
		const dir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "pandwind-meta-"));
		try {
			writeFileSync(
				join(dir, "pandwind.interop.json"),
				JSON.stringify({
					schema: "pandwind.interop/1",
					generatedFrom: { types: "types.d.ts", runtime: "tw.ts", bridge: "bridge.ts" },
					utilities: [
						{ key: "bgColor", base: "bg", valueType: "BgColorValue", values: ["blue-500"] },
					],
					tw: {
						variants: { hover: { join: ":" } },
						conflicts: { bg: { "blue-500": ["background-color"] } },
						compose: [],
					},
					bridge: { "background-color": { "#3182ce": "bg-blue-500" } },
					theme: { variables: {}, scopes: [] },
				}),
			);
			const meta = loadMetaFromSources({ interopPath: join(dir, "pandwind.interop.json") });
			expect(meta.keys[0]).toMatchObject({ key: "bgColor", base: "bg" });
			expect(meta.variants.get("hover")).toEqual({ join: ":" });
			expect(meta.bridgeInverse.get("bg-blue-500")).toEqual({
				property: "background-color",
				value: "#3182ce",
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
