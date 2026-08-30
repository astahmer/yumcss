import { describe, expect, test } from "vitest";
import {
	STYLE_VALIDATORS,
	StyleValidatorId,
	createStyleValidatorRegistry,
	createValidatorContractSuite,
	STYLE_PROGRAM_SCHEMA,
	type StyleProgram,
	type ValidatorContractFixture,
} from "../src/swap/index.ts";

const program: StyleProgram = {
	schema: STYLE_PROGRAM_SCHEMA,
	rules: [],
	declarations: [],
	residuals: [],
};

const fixture = (validator: StyleValidatorId): ValidatorContractFixture => ({
	validator,
	expectedValid: true,
	context: {
		source: program,
		target: program,
		residuals: [],
		dependencies: {
			source: { packages: [{ name: "source-style", kind: "runtime" }] },
			target: { packages: [{ name: "target-style", kind: "runtime" }] },
		},
	},
});

describe("validator contract suite", () => {
	test("proves every built-in validator has executable, well-formed evidence", () => {
		const fixtures = Object.values(StyleValidatorId)
			.filter((id) => id !== StyleValidatorId.Builtin)
			.map((id) => fixture(id as StyleValidatorId));
		const result = createValidatorContractSuite().run(STYLE_VALIDATORS, fixtures);

		expect(result.valid).toBe(true);
		expect(result.checked).toEqual(
			expect.arrayContaining([
				StyleValidatorId.CanonicalCss,
				StyleValidatorId.Residuals,
				StyleValidatorId.BrowserStates,
				StyleValidatorId.SsrHydration,
				StyleValidatorId.Dependencies,
				StyleValidatorId.RscStreaming,
			]),
		);
		expect(result.failures).toEqual([]);
	});

	test("fails closed when a registered validator is not covered", () => {
		const registry = createStyleValidatorRegistry([]);
		registry.register({
			schema: "pandwind.style-validator/1",
			id: "test-validator",
			validate: () => ({
				validator: "test-validator",
				valid: true,
				lossiness: "lossless",
				differences: [],
			}),
		});

		const result = createValidatorContractSuite().run(registry, []);
		expect(result.valid).toBe(false);
		expect(result.failures).toEqual([
			expect.objectContaining({
				validator: "test-validator",
				phase: "registration",
			}),
		]);
	});
});
