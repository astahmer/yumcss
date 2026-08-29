import { describe, expect, test } from "vitest";
import {
	createMigrationProgramPolicy,
	DEFAULT_MIGRATION_PROGRAM_POLICY,
} from "../src/swap/index.ts";
import { styleProgramFromRules } from "../src/swap/semantic-ir.ts";

describe("migration program policy", () => {
	test("default policy recognizes nested dynamic and raw selector semantics", () => {
		const program = styleProgramFromRules([
			{
				kind: "style",
				selector: ".card",
				conditions: [],
				declarations: [
					{
						property: "color",
						value: { kind: "dynamic", expression: "props.color" },
						conditions: [],
					},
				],
				children: [],
			},
		]);
		const policy = createMigrationProgramPolicy();
		expect(policy.hasDynamic(program)).toBe(true);
		expect(policy.needsRawTemplate(program)).toBe(false);
		expect(DEFAULT_MIGRATION_PROGRAM_POLICY).toBe(policy);
	});

	test("a caller can substitute semantic policy without changing orchestration", () => {
		const policy = createMigrationProgramPolicy({
			hasDynamic: () => false,
			hasFunctionDynamic: () => false,
			needsRawTemplate: () => true,
		});
		expect(policy.hasDynamic({ rules: [], declarations: [] } as never)).toBe(false);
		expect(policy.needsRawTemplate({ rules: [], declarations: [] } as never)).toBe(true);
	});
});
