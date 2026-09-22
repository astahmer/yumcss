/** Integration: the gatherer runs against this repo's real committed artifacts. */
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { gather } from "./gather.ts";

const ROOT = resolve(import.meta.dirname, "../../../..");

describe("gather (integration over examples/example)", { timeout: 60_000 }, () => {
	test("returns a fully populated Inspector payload", async () => {
		const data = await gather(ROOT);
		expect(data.meta.root).toBe(ROOT);
		expect(data.coverage.files.length).toBeGreaterThan(0);
		expect(
			data.coverage.files.every(({ file }) =>
				file.replaceAll("\\", "/").includes("examples/example/src/"),
			),
		).toBe(true);
		expect(data.coverage.budget.cssBytes).toBeGreaterThan(0);
		expect(data.designSystem.themeVars.length).toBeGreaterThan(0);
		expect(data.designSystem.utilities.length).toBeGreaterThan(10);
		expect(data.designSystem.bridgeProperties).toBeGreaterThan(10);
		expect(data.designSystem.tokenSections.length).toBeGreaterThan(0);
		expect(data.authoredCss.length).toBeGreaterThan(0);
		expect(data.authoredCss[0]).toMatchObject({
			source: expect.stringContaining(".css"),
			kind: "side-effect",
		});
		expect(data.cssSources.length).toBeGreaterThan(0);
		expect(data.cssSources[0]).toMatchObject({
			file: expect.any(String),
			line: expect.any(Number),
		});
		expect(data.cssSources.some((site) => (site.rules?.length ?? 0) > 0)).toBe(true);
		expect(data.cssDiagnostics).toEqual([]);
		// Token governance (plans/054): the official example-preset resolves a
		// strict policy, the universe covers preset + css + interop sources,
		// and the changeset proposal is read-only-safe by construction.
		expect(data.governance).toBeDefined();
		expect(data.governance?.version).toBe(1);
		expect(data.governance?.policy?.resolved).toBe(true);
		expect(data.governance?.definitions.length).toBeGreaterThan(0);
		expect(data.governanceChangeset).toBeDefined();
		expect(data.governanceChangeset?.count).toBeGreaterThanOrEqual(0);
	}, 60_000);
});
