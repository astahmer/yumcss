import { describe, expect, test } from "vitest";
import { AdapterContractSuite, createBuiltinCodemodCatalog } from "../src/swap/index.ts";

describe("adapter contract suite", () => {
	test("all registered adapters satisfy the shared lifecycle contract", () => {
		const reports = AdapterContractSuite.inspectRegistry(createBuiltinCodemodCatalog().registry);
		for (const report of reports) AdapterContractSuite.assert(report);
		expect(reports.every((report) => report.valid)).toBe(true);
	});

	test("a minimal third-party adapter uses the same conformance boundary", () => {
		const adapter = createBuiltinCodemodCatalog().registry.get("emotion");
		expect(adapter).toBeDefined();
		const report = AdapterContractSuite.inspect(adapter!);
		expect(report).toMatchObject({ valid: true, adapter: "emotion" });
	});
});
