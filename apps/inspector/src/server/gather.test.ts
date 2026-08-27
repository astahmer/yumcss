/** Integration: the gatherer runs against this repo's real committed artifacts. */
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { gather } from "./gather.ts";

const ROOT = resolve(import.meta.dirname, "../../../..");

describe("gather (integration over apps/example)", { timeout: 60_000 }, () => {
	test("returns a fully-populated studio payload", async () => {
		const data = await gather(ROOT);
		expect(data.meta.root).toBe(ROOT);
		expect(data.coverage.budget.cssBytes).toBeGreaterThan(0);
		expect(data.designSystem.themeVars.length).toBeGreaterThan(0);
		expect(data.designSystem.utilities.length).toBeGreaterThan(10);
		expect(data.designSystem.bridgeProperties).toBeGreaterThan(10);
		expect(data.designSystem.tokenSections.length).toBeGreaterThan(0);
		expect(data.cssSources.length).toBeGreaterThan(0);
		expect(data.cssSources[0]).toMatchObject({ file: expect.any(String), line: expect.any(Number) });
		expect(data.cssDiagnostics).toEqual([]);
	}, 60_000);
});
