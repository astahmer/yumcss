import { describe, expect, test } from "vitest";
import { createBuiltinCodemodCatalog, createSemanticContractSuite } from "../src/swap/index.ts";
import {
	SEMANTIC_PROOF_FAMILIES,
	semanticContractFixtures,
} from "../proof/semantic-contract-fixtures.ts";

describe("semantic capability contract suite", () => {
	test("covers every semantic family and gives every target an outcome", () => {
		const catalog = createBuiltinCodemodCatalog();
		const covered = new Set(semanticContractFixtures.flatMap((fixture) => fixture.covers));
		expect(
			SEMANTIC_PROOF_FAMILIES.filter((family) => !covered.has(family)),
			"semantic families without a contract fixture",
		).toEqual([]);

		const report = createSemanticContractSuite(catalog.registry).run(semanticContractFixtures);
		expect(report.cases).toHaveLength(
			semanticContractFixtures.length * catalog.adapters.length * 2,
		);
		expect(report.failures, JSON.stringify(report.failures, null, 2)).toEqual([]);
		expect(report.validated).toBeGreaterThan(0);
		expect(report.explicitResiduals).toBeGreaterThan(0);
	});
});
