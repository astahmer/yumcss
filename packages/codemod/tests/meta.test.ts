import { resolve } from "node:path";
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
	});
});
