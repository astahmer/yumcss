import { describe, expect, test } from "vitest";
import {
	ADAPTER_CONFORMANCE_SCHEMA,
	CodemodAdapterId,
	createAdapterConformanceSuite,
	createBuiltinCodemodCatalog,
	createStyleAdapterRegistry,
} from "../src/swap/index.ts";
import { completeAdapterMatrixFixtures } from "../proof/adapter-matrix-fixtures.ts";
import { adapterContractFixtures } from "../proof/adapter-contract-fixtures.ts";

const catalog = createBuiltinCodemodCatalog();

describe("registered adapter conformance", () => {
	test("proves every adapter-owned phase and every ordered route", () => {
		const report = createAdapterConformanceSuite(catalog.registry, {
			readFile: () => undefined,
		}).run(completeAdapterMatrixFixtures);

		expect(report.schema).toBe(ADAPTER_CONFORMANCE_SCHEMA);
		expect(report.failures, JSON.stringify(report.failures, null, 2)).toEqual([]);
		expect(report.routes.failures, JSON.stringify(report.routes.failures, null, 2)).toEqual([]);
		expect(report.direct).toHaveLength(catalog.adapters.length);
		expect(report.direct.every((item) => item.detected && item.configured)).toBe(true);
		expect(report.direct.every((item) => item.parsed > 0)).toBe(true);
		expect(report.direct.every((item) => item.emitted > 0)).toBe(true);
		expect(report.direct.every((item) => item.validated > 0)).toBe(true);
		expect(report.direct.every((item) => item.scenarios.join(",") === "edge,happy,malformed")).toBe(
			true,
		);
		expect(report.routes.cases).toHaveLength(catalog.adapters.length ** 2 * 2 * 3);
		expect(new Set(report.routes.cases.map((item) => item.sourceAdapter))).toEqual(
			new Set(catalog.adapters.map((adapter) => adapter.id)),
		);
		expect(new Set(report.routes.cases.map((item) => item.targetAdapter))).toEqual(
			new Set(catalog.adapters.map((adapter) => adapter.id)),
		);
	});

	test("does not weaken the gate for a registered substitute", () => {
		const emotion = catalog.registry.get(CodemodAdapterId.Emotion)!;
		const report = createAdapterConformanceSuite(createStyleAdapterRegistry([emotion])).run(
			completeAdapterMatrixFixtures.filter(
				(fixture) => fixture.sourceAdapter === CodemodAdapterId.Emotion,
			),
		);
		expect(report.passed).toBe(true);
		expect(report.direct).toMatchObject([
			{ adapter: CodemodAdapterId.Emotion, detected: true, configured: true, parsed: 3 },
		]);
		expect(report.routes.cases).toHaveLength(2 * 3);
	});

	test("exercises every adapter-owned migration policy hook directly", () => {
		for (const adapter of catalog.adapters) {
			const fixture = adapterContractFixtures.find((item) => item.adapter === adapter.id);
			expect(fixture, `${adapter.id} has no direct hook fixture`).toBeDefined();
			if (fixture === undefined) continue;
			const config = adapter.loadConfig({ file: fixture.file, source: fixture.source });
			const parsed = adapter.parse(fixture.source, {
				file: fixture.file,
				source: fixture.source,
				config,
				...(fixture.semantic === undefined ? {} : { semantic: fixture.semantic }),
			});
			const program = parsed.matches[0]?.program;
			expect(program, `${adapter.id} direct fixture did not parse`).toBeDefined();
			if (program === undefined) continue;
			const policy = adapter.migration?.targetPolicy;
			for (const targetId of [CodemodAdapterId.Pandwind, adapter.id]) {
				const dynamic = adapter.migration?.prepareDynamic?.({
					source: fixture.source,
					file: fixture.file,
					targetId,
					program,
					binding: "card",
					framework: "react",
				});
				if (dynamic !== undefined) expect(dynamic.handled).toBeTypeOf("boolean");
			}
			if (policy?.resolveHostRepresentation !== undefined)
				policy.resolveHostRepresentation({
					program,
					hasHostContext: true,
					framework: "react",
				});
			if (policy?.requiresHostWrapper !== undefined)
				expect(policy.requiresHostWrapper({ source: fixture.source, binding: "card" })).toBeTypeOf(
					"boolean",
				);
			if (policy?.handlesRawTemplate !== undefined)
				expect(policy.handlesRawTemplate({ source: fixture.source })).toBeTypeOf("boolean");
			if (policy?.handlesTemplateFragment !== undefined)
				expect(policy.handlesTemplateFragment(program)).toBeTypeOf("boolean");
		}
	});
});
