import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	DifferentialProofKind,
	DifferentialCorpusRunner,
	STYLE_VALIDATORS,
	ValidatorContractSuite,
	createStyleValidatorRegistry,
	externalIdentifier,
} from "../src/swap/index.ts";
import type { StyleProgram, StyleValidator } from "../src/swap/index.ts";

const program: StyleProgram = {
	schema: "pandwind.style-program/3",
	rules: [],
	declarations: [],
	residuals: [],
};

describe("proof contract ports", () => {
	test("every built-in validator satisfies the public contract", () => {
		const reports = ValidatorContractSuite.inspectRegistry(STYLE_VALIDATORS, {
			context: { source: program, target: program, residuals: [], fixture: "contract" },
		});
		expect(reports).toHaveLength(STYLE_VALIDATORS.validators.length);
		for (const report of reports) expect(report.valid, report.validator).toBe(true);
	});

	test("a third-party validator can replace the built-ins at the registry boundary", () => {
		const validator: StyleValidator = {
			schema: "pandwind.style-validator/1",
			id: externalIdentifier("fixture-validator"),
			validate: ({ source, target }) => ({
				validator: externalIdentifier("fixture-validator"),
				valid: source === target,
				lossiness: "lossless",
				differences: [],
			}),
		};
		const report = ValidatorContractSuite.inspect(validator, {
			context: { source: program, target: program, residuals: [] },
		});
		expect(report.valid).toBe(true);
		const registry = createStyleValidatorRegistry([validator]);
		expect(registry.validators).toEqual([validator]);
	});

	test("the corpus runner owns matrix execution and preserves adapter routes", () => {
		const result = new DifferentialCorpusRunner().run({
			cases: [
				{
					id: "emotion-to-pandwind-contract",
					proofs: [
						DifferentialProofKind.CanonicalCss,
						DifferentialProofKind.BrowserStates,
						DifferentialProofKind.SsrHydration,
						DifferentialProofKind.RscStreaming,
						DifferentialProofKind.Dependencies,
						DifferentialProofKind.Residuals,
					],
					browserStates: [{ name: "initial", source: () => "same", target: () => "same" }],
					ssr: {
						source: {
							render: () => ({ html: "same", css: "same" }),
							hydrate: (server) => server,
						},
						target: {
							render: () => ({ html: "same", css: "same" }),
							hydrate: (server) => server,
						},
					},
					streaming: {
						source: { render: () => ["same"] },
						target: { render: () => ["same"] },
					},
					sourceAdapter: CodemodAdapterId.Emotion,
					targetAdapter: CodemodAdapterId.Pandwind,
					file: "Card.tsx",
					source: 'const card = css({ color: "red" });',
					expected: "pass",
				},
			],
		});
		expect(result.passed).toBe(1);
		expect(result.failed).toBe(0);
		expect(result.cases[0]?.fixture).toBe("emotion-to-pandwind-contract");
	});
});
