import { describe, expect, test } from "vitest";
import {
	ADAPTER_MIGRATION_PIPELINE,
	PANDA_MIGRATION_PIPELINE,
	PANDA_MIGRATION_PIPELINE_SCHEMA,
	MIGRATION_PIPELINE_SCHEMA,
	rewritePandaSource,
	validatePandaSource,
} from "../src/swap/index.ts";

describe("migration pipeline domains", () => {
	test("keeps adapter migration orchestration behind one staged interface", () => {
		const result = ADAPTER_MIGRATION_PIPELINE.run(`const card = css({ color: "red" });`, {
			from: "emotion",
			to: "styled-components",
			file: "Card.tsx",
		});
		expect(ADAPTER_MIGRATION_PIPELINE.schema).toBe(MIGRATION_PIPELINE_SCHEMA);
		expect(result.converted).toBe(1);
	});

	test("exposes Panda as a replaceable project pipeline", () => {
		expect(PANDA_MIGRATION_PIPELINE.schema).toBe(PANDA_MIGRATION_PIPELINE_SCHEMA);
		expect(PANDA_MIGRATION_PIPELINE.stages.map((stage) => stage.id)).toEqual([
			"project-discovery",
			"theme-config",
			"source-scanning",
			"recipe-pattern-extraction",
			"semantic-conversion",
			"module-emission",
			"rewrite-application",
			"validation-reporting",
		]);
		expect(rewritePandaSource("const x = 1;", [{ start: 6, end: 7, text: "y" }])).toBe(
			"const y = 1;",
		);
		expect(validatePandaSource("stage.ts", "const x = 1;").valid).toBe(true);
	});
});
