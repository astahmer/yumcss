import { describe, expect, test } from "vitest";
import {
	STYLE_MIGRATION_USE_CASE_SCHEMA,
	STYLE_LOWERING_REGISTRY,
	createAdapterMigrationExecutor,
	createAdapterMigrationPipeline,
	createBuiltinCodemodCatalog,
	createStyleMigrationUseCase,
	type AdapterMigrationResult,
} from "../src/swap/index.ts";
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
	test("keeps orchestration substitutable through one executor port", async () => {
		const calls: string[] = [];
		const useCase = createStyleMigrationUseCase({
			run: () => {
				calls.push("sync");
				return result;
			},
			runAsync: async () => {
				calls.push("async");
				return result;
			},
		});

		expect(useCase.schema).toBe(STYLE_MIGRATION_USE_CASE_SCHEMA);
		expect(useCase.run("source", { from: "source", to: "target", file: "file.ts" })).toBe(result);
		expect(
			await useCase.runAsync("source", { from: "source", to: "target", file: "file.ts" }),
		).toBe(result);
		expect(calls).toEqual(["sync", "async"]);
	});

	test("lets the migration pipeline use the same substituted port", async () => {
		const useCase = createStyleMigrationUseCase({
			run: () => result,
			runAsync: async () => result,
		});
		const pipeline = createAdapterMigrationPipeline(undefined, useCase);

		expect(pipeline.run("source", { from: "source", to: "target", file: "file.ts" })).toBe(result);
		expect(
			await pipeline.runAsync("source", { from: "source", to: "target", file: "file.ts" }),
		).toBe(result);
	});

	test("injects the catalog, scanner, and lowering ports into execution", () => {
		let scans = 0;
		const executor = createAdapterMigrationExecutor({
			adapterRegistry: createBuiltinCodemodCatalog().registry,
			sourceScanner: {
				...SOURCE_SCANNER_SERVICE,
				scan(input) {
					scans++;
					return SOURCE_SCANNER_SERVICE.scan(input);
				},
			},
			loweringRegistry: STYLE_LOWERING_REGISTRY,
		});

		const migrated = executor.run(
			'import { css } from "@emotion/react";\nconst card = css({ color: "red" });',
			{ from: "emotion", to: "styled-components", file: "Card.tsx" },
		);

		expect(migrated.converted).toBe(1);
		expect(scans).toBe(1);
	});
});
