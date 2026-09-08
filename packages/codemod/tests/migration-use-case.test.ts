import { describe, expect, test } from "vitest";
import {
	STYLE_MIGRATION_USE_CASE_SCHEMA,
	STYLE_LOWERING_REGISTRY,
	createBuiltinCodemodCatalog,
	createStyleMigrationUseCase,
	type AdapterMigrationResult,
	type StyleMigrationUseCase,
	type StyleDialectResolver,
} from "../src/swap/index.ts";
import { createAdapterMigrationEngine } from "../src/swap/adapter-migration-engine.ts";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";

const result: AdapterMigrationResult = {
	code: "const card = 1;",
	changed: false,
	converted: 0,
	skipped: 0,
	reports: [],
	validations: [],
	dependencies: [],
	generatedFiles: [],
	fileChanges: [],
	residuals: [],
	loweringPlans: [],
	outcomes: [],
};

describe("style migration use case", () => {
	test("keeps orchestration substitutable through one use-case port", async () => {
		const calls: string[] = [];
		const implementation: Pick<StyleMigrationUseCase, "run" | "runAsync"> = {
			run: () => {
				calls.push("sync");
				return result;
			},
			runAsync: async () => {
				calls.push("async");
				return result;
			},
		};
		const useCase = createStyleMigrationUseCase(implementation);

		expect(useCase.schema).toBe(STYLE_MIGRATION_USE_CASE_SCHEMA);
		expect(useCase.run("source", { from: "source", to: "target", file: "file.ts" })).toBe(result);
		expect(
			await useCase.runAsync("source", { from: "source", to: "target", file: "file.ts" }),
		).toBe(result);
		expect(calls).toEqual(["sync", "async"]);
	});

	test("injects the catalog, scanner, and lowering ports into execution", () => {
		let scans = 0;
		const useCase = createStyleMigrationUseCase(
			createAdapterMigrationEngine({
				adapterRegistry: createBuiltinCodemodCatalog().registry,
				sourceScanner: {
					...SOURCE_SCANNER_SERVICE,
					scan(input) {
						scans++;
						return SOURCE_SCANNER_SERVICE.scan(input);
					},
				},
				loweringRegistry: STYLE_LOWERING_REGISTRY,
			}),
		);

		const migrated = useCase.run(
			'import { css } from "@emotion/react";\nconst card = css({ color: "red" });',
			{ from: "emotion", to: "styled-components", file: "Card.tsx" },
		);

		expect(migrated.converted).toBe(1);
		expect(scans).toBe(1);
	});

	test("prepares sync and async routes exactly once", async () => {
		const catalog = createBuiltinCodemodCatalog();
		let resolutions = 0;
		const registry: StyleDialectResolver = {
			get systems() {
				return catalog.registry.systems;
			},
			getSystem: (id) => catalog.registry.getSystem(id),
			getDialect: (address) => catalog.registry.getDialect(address),
			resolveRoute: (from, to) => {
				resolutions++;
				return catalog.registry.resolveRoute(from, to);
			},
		};
		const useCase = createStyleMigrationUseCase(
			createAdapterMigrationEngine({
				adapterRegistry: catalog.registry,
				sourceScanner: SOURCE_SCANNER_SERVICE,
				loweringRegistry: STYLE_LOWERING_REGISTRY,
			}),
		);
		const source = 'import { css } from "@emotion/react";\nconst card = css({ color: "red" });';
		const options = { from: "emotion", to: "styled-components", file: "Card.tsx", registry };

		const sync = useCase.run(source, options);
		expect(sync.converted).toBe(1);
		expect(resolutions).toBe(1);

		resolutions = 0;
		const asyncResult = await useCase.runAsync(source, options);
		expect(asyncResult.converted).toBe(1);
		expect(resolutions).toBe(1);
	});
});
