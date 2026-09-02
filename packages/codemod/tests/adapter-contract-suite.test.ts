import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createAdapterContractSuite,
	createBuiltinCodemodCatalog,
	createStyleAdapterRegistry,
	type AdapterContractFixture,
} from "../src/swap/index.ts";
import { adapterContractFixtures } from "../proof/adapter-contract-fixtures.ts";

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

	test("requires every adapter to expose normalized project-config provenance", () => {
		const registry = createBuiltinCodemodCatalog().registry;
		const fixtures = new Map(adapterContractFixtures.map((fixture) => [fixture.adapter, fixture]));
		const summaries = registry.adapters.map((adapter) => {
			const fixture = fixtures.get(adapter.id);
			expect(fixture).toBeDefined();
			const config = adapter.loadConfig({
				file: fixture!.file,
				source: fixture!.source,
				...(fixture!.root === undefined ? {} : { root: fixture!.root }),
			});
			expect(config.adapter).toBe(adapter.id);
			expect(config.configuration).toBeDefined();
			if (config.residuals?.some(({ kind }) => kind === "configuration") === true)
				expect(config.configuration?.some(({ source }) => source === "unresolved")).toBe(true);
			return {
				adapter: adapter.id,
				files: config.files.length,
				configuration: config.configuration?.map(({ source, status }) => `${source}:${status}`),
			};
		});

		expect(summaries).toHaveLength(registry.adapters.length);
		expect(summaries.every(({ files }) => files >= 0)).toBe(true);
		expect(summaries.slice(0, 4)).toMatchInlineSnapshot(`
			[
			  {
			    "adapter": "pandwind",
			    "configuration": [
			      "project-source-fallback:resolved",
			    ],
			    "files": 1,
			  },
			  {
			    "adapter": "bamboo",
			    "configuration": [
			      "project-source-fallback:not-attempted",
			    ],
			    "files": 0,
			  },
			  {
			    "adapter": "chakra-ui",
			    "configuration": [
			      "project-source-fallback:not-attempted",
			    ],
			    "files": 0,
			  },
			  {
			    "adapter": "emotion",
			    "configuration": [
			      "project-source-fallback:not-attempted",
			    ],
			    "files": 0,
			  },
			]
		`);
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
