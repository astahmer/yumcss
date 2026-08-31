import { describe, expect, test } from "vitest";
import {
	createBidirectionalAdapterMatrix,
	createBuiltinCodemodCatalog,
} from "../src/swap/index.ts";
import { completeAdapterMatrixFixtures } from "./adapter-matrix-fixtures.ts";

const catalog = createBuiltinCodemodCatalog();

describe("bidirectional adapter matrix contract", () => {
	test("runs every registered route and scenario in safe and partial modes", () => {
		const report = createBidirectionalAdapterMatrix(catalog.registry, {
			readFile: () => undefined,
		}).run(completeAdapterMatrixFixtures);

		expect(report.cases).toHaveLength(catalog.adapters.length ** 2 * 2 * 3);
		expect(report.failures, JSON.stringify(report.failures, null, 2)).toEqual([]);
		expect(report.passed).toBe(report.cases.length);
		expect(new Set(report.cases.map((item) => item.scenario))).toEqual(
			new Set(["happy", "edge", "malformed"]),
		);
		for (const source of catalog.adapters)
			for (const target of catalog.adapters)
				for (const mode of ["safe", "partial"] as const)
					expect(
						report.cases
							.filter(
								(item) =>
									item.sourceAdapter === source.id &&
									item.targetAdapter === target.id &&
									item.mode === mode,
							)
							.map((item) => item.scenario),
						`${source.id} -> ${target.id} (${mode}) missing scenario coverage`,
					).toEqual(["happy", "edge", "malformed"]);
	});
});
