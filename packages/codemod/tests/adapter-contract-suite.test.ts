import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createAdapterContractSuite,
	createBuiltinCodemodCatalog,
	createStyleAdapterRegistry,
	type AdapterContractFixture,
} from "../src/swap/index.ts";
import { adapterContractFixtures } from "./adapter-contract-fixtures.ts";

const fixture = (adapter: string, source: string): AdapterContractFixture => ({
	adapter,
	file: `${adapter}.tsx`,
	source,
});

describe("adapter contract suite", () => {
	test("derives the capability matrix from registered adapters", () => {
		const registry = createBuiltinCodemodCatalog().registry;
		const matrix = registry.capabilityMatrix();
		expect(matrix.entries).toHaveLength(registry.adapters.length);
		expect(matrix.get(CodemodAdapterId.Emotion)).toMatchObject({
			adapter: CodemodAdapterId.Emotion,
			sourceModules: expect.arrayContaining(["@emotion/react"]),
			dependencies: { packages: expect.any(Array) },
			capabilities: expect.any(Object),
		});
	});

	test("accepts a minimal substitute registry without changing orchestration", () => {
		const catalog = createBuiltinCodemodCatalog();
		const emotion = catalog.registry.get(CodemodAdapterId.Emotion)!;
		const registry = createStyleAdapterRegistry([emotion]);
		const report = createAdapterContractSuite().run(registry, [
			fixture(
				CodemodAdapterId.Emotion,
				'import { css } from "@emotion/css"; css({ color: "red" });',
			),
		]);
		expect(report.failed).toBe(0);
		expect(report.passed).toBe(1);
		expect(report.adapters[0]).toMatchObject({ fixture: true, matched: true, parsed: 1 });
	});

	test("requires every built-in adapter to pass a representative parse contract", () => {
		const registry = createBuiltinCodemodCatalog().registry;
		const report = createAdapterContractSuite().run(registry, adapterContractFixtures);
		expect(report.failed, JSON.stringify(report.failures, null, 2)).toBe(0);
		expect(report.passed).toBe(registry.adapters.length);
	});

	test("fails explicitly when a registered adapter has no fixture", () => {
		const catalog = createBuiltinCodemodCatalog();
		const registry = createStyleAdapterRegistry([catalog.registry.get(CodemodAdapterId.Emotion)!]);
		const report = createAdapterContractSuite().run(registry, []);
		expect(report.failed).toBe(1);
		expect(report.failures[0]).toMatchObject({
			adapter: CodemodAdapterId.Emotion,
			phase: "registration",
		});
	});
});
