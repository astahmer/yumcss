import { describe, expect, test } from "vitest";
import {
	createBidirectionalAdapterMatrix,
	createBuiltinCodemodCatalog,
	CodemodAdapterId,
} from "../src/swap/index.ts";
import { adapterContractFixtures } from "./adapter-contract-fixtures.ts";

const catalog = createBuiltinCodemodCatalog();

const fixtures = adapterContractFixtures.map((fixture) => ({
	sourceAdapter: fixture.adapter,
	file: fixture.file,
	source: fixture.source,
	semantic:
		fixture.adapter === CodemodAdapterId.StyledComponents ||
		fixture.adapter === CodemodAdapterId.ChakraUi ||
		fixture.adapter === CodemodAdapterId.Mui ||
		fixture.adapter === CodemodAdapterId.Mantine
			? { source: { framework: "react" } }
			: fixture.adapter === CodemodAdapterId.SolidStyled
				? { source: { framework: "solid" } }
				: fixture.adapter === CodemodAdapterId.VueStyled
					? { source: { framework: "vue" } }
					: undefined,
}));

describe("bidirectional adapter matrix contract", () => {
	test("runs every registered route in safe and partial modes", () => {
		const report = createBidirectionalAdapterMatrix(catalog.registry, {
			readFile: () => undefined,
		}).run(fixtures);

		expect(report.cases).toHaveLength(catalog.adapters.length ** 2 * 2);
		expect(report.failures, JSON.stringify(report.failures, null, 2)).toEqual([]);
		expect(report.passed).toBe(report.cases.length);
	});
});
