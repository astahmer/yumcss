import { describe, expect, test } from "vitest";
import {
	ADAPTER_MIGRATION_PIPELINE,
	PANDA_MIGRATION_PIPELINE,
	PANDA_MIGRATION_PIPELINE_SCHEMA,
	MIGRATION_PIPELINE_SCHEMA,
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
		expect(PANDA_MIGRATION_PIPELINE.stages.map((stage) => stage.id)).toEqual(["panda-project"]);
	});
});
