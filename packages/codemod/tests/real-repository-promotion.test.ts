import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	RealRepositoryPromotionStageTag,
	RealRepositoryProofDimension,
	createRealRepositoryPromotionRunner,
	type PromotionCommand,
	type RealRepositoryPromotionDriver,
} from "../src/swap/index.ts";
import type { RealRepositoryReference } from "../src/swap/real-repository-corpus.ts";

const reference: RealRepositoryReference = {
	id: "fixture",
	repository: "https://example.test/fixture",
	clone: "fixture",
	commit: "abc123",
	path: "src/index.tsx",
	from: CodemodAdapterId.Emotion,
	to: CodemodAdapterId.Pandwind,
	framework: "react",
};

const command: PromotionCommand = { name: "pnpm", args: ["build"], cwd: "/tmp/fixture" };
const proofDimensions = [
	RealRepositoryProofDimension.CanonicalCss,
	RealRepositoryProofDimension.BrowserStates,
	RealRepositoryProofDimension.SsrHydration,
	RealRepositoryProofDimension.Dependencies,
	RealRepositoryProofDimension.CssSize,
] as const;

function driver(
	overrides: Partial<RealRepositoryPromotionDriver> = {},
): RealRepositoryPromotionDriver {
	return {
		materialize: async () => ({ sourceCheckout: "/tmp/source", workingCopy: "/tmp/working" }),
		run: async () => ({ code: 0 }),
		migrate: async () => ({ converted: 1, skipped: 0, residuals: 0, manualChanges: 0 }),
		prove: async () => ({
			canonicalCssEqual: true,
			browserEquivalent: true,
			hydrationEquivalent: true,
			streamingEquivalent: null,
			sourceCssBytes: 100,
			targetCssBytes: 90,
			errors: [],
		}),
		...overrides,
	};
}

describe("real repository promotion runner", () => {
	test("executes materialize, install, migrate, checks, and proof as one use case", async () => {
		const result = await createRealRepositoryPromotionRunner(driver()).run({
			reference,
			install: [command],
			checks: [command],
			proofDimensions,
		});

		expect(result.status).toBe("passed");
		expect(result.stages.map(({ stage }) => stage)).toEqual([
			RealRepositoryPromotionStageTag.Materialize,
			RealRepositoryPromotionStageTag.Install,
			RealRepositoryPromotionStageTag.Migrate,
			RealRepositoryPromotionStageTag.Checks,
			RealRepositoryPromotionStageTag.Proof,
		]);
		expect(result).toMatchInlineSnapshot(`
			{
			  "commit": "abc123",
			  "errors": [],
			  "id": "fixture",
			  "migration": {
			    "converted": 1,
			    "manualChanges": 0,
			    "residuals": 0,
			    "skipped": 0,
			  },
			  "proof": {
			    "browserEquivalent": true,
			    "canonicalCssEqual": true,
			    "errors": [],
			    "hydrationEquivalent": true,
			    "sourceCssBytes": 100,
			    "streamingEquivalent": null,
			    "targetCssBytes": 90,
			  },
			  "repository": "https://example.test/fixture",
			  "schema": "pandwind.real-repository-promotion/1",
			  "stages": [
			    {
			      "passed": true,
			      "stage": "materialize",
			    },
			    {
			      "passed": true,
			      "stage": "install",
			    },
			    {
			      "passed": true,
			      "stage": "migrate",
			    },
			    {
			      "passed": true,
			      "stage": "checks",
			    },
			    {
			      "passed": true,
			      "stage": "proof",
			    },
			  ],
			  "status": "passed",
			}
		`);
	});

	test("fails closed when migration leaves a residual", async () => {
		const result = await createRealRepositoryPromotionRunner(
			driver({
				migrate: async () => ({ converted: 1, skipped: 1, residuals: 1, manualChanges: 0 }),
			}),
		).run({ reference, install: [command], checks: [command], proofDimensions });

		expect(result.status).toBe("failed");
		expect(result.proof).toBeUndefined();
		expect(result.errors).toContain("migration did not produce a clean repository result");
		expect(result.stages.at(-1)).toMatchObject({
			stage: RealRepositoryPromotionStageTag.Migrate,
			passed: false,
		});
	});

	test("requires streaming proof only when the host claims it", async () => {
		const result = await createRealRepositoryPromotionRunner(driver()).run({
			reference,
			install: [command],
			checks: [command],
			proofDimensions: [...proofDimensions, RealRepositoryProofDimension.RscStreaming],
		});

		expect(result.status).toBe("failed");
		expect(result.proof?.streamingEquivalent).toBeNull();
		expect(result.errors).toEqual(["missing proof dimensions: rsc-streaming"]);
	});

	test("fails closed when install or project checks are not configured", async () => {
		const result = await createRealRepositoryPromotionRunner(driver()).run({
			reference,
		install: [],
		checks: [],
		proofDimensions,
		});

		expect(result.status).toBe("failed");
		expect(result.stages).toEqual([
			{
				stage: RealRepositoryPromotionStageTag.Materialize,
				passed: true,
			},
			{
				stage: RealRepositoryPromotionStageTag.Install,
				passed: false,
				detail: "install stage has no executable commands",
			},
		]);
		expect(result.errors).toEqual(["install stage has no executable commands"]);
	});
});
