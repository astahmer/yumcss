import { describe, expect, test } from "vitest";
import {
	MIGRATION_PROOF_SCENARIO,
	MIGRATION_PROOF_SCENARIOS,
	migrationProofScenario,
} from "../../../scripts/migration-proof-catalog.ts";
import { AstryxDocsLane } from "../../../scripts/migration-proofs/migrate-astryx-docs.ts";
import { createReferenceWorkspace } from "../../../scripts/reference-workspace.ts";
import { executeMigrationProof } from "../../../scripts/run-migration-proof.ts";

describe("migration proof catalog", () => {
	test("registers every proof family exactly once", () => {
		const ids = MIGRATION_PROOF_SCENARIOS.map((scenario) => scenario.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toEqual([
			MIGRATION_PROOF_SCENARIO.AstryxDocs,
			MIGRATION_PROOF_SCENARIO.ChakraDocs,
			MIGRATION_PROOF_SCENARIO.EffectDocs,
			MIGRATION_PROOF_SCENARIO.EmotionSite,
			MIGRATION_PROOF_SCENARIO.PostHogDocs,
			MIGRATION_PROOF_SCENARIO.ReferenceRepository,
			MIGRATION_PROOF_SCENARIO.ShadcnV4,
			MIGRATION_PROOF_SCENARIO.StyledComponentsDocs,
			MIGRATION_PROOF_SCENARIO.StylexDocs,
			MIGRATION_PROOF_SCENARIO.TailwindDocs,
		]);
	});

	test("keeps legacy positional parsing inside each scenario descriptor", () => {
		const scenario = migrationProofScenario(MIGRATION_PROOF_SCENARIO.AstryxDocs);
		expect(
			scenario?.parseLegacyArgs?.([
				AstryxDocsLane.StaticCss,
				"/references/astryx/apps/docsite",
				"/tmp/astryx",
			]),
		).toEqual({
			lane: AstryxDocsLane.StaticCss,
			sourceRoot: "/references/astryx/apps/docsite",
			outputRoot: "/tmp/astryx",
		});
	});

	test("resolves nested reference roots from one workspace provider", () => {
		const workspace = createReferenceWorkspace("/references");
		const scenario = migrationProofScenario(MIGRATION_PROOF_SCENARIO.StylexDocs);
		expect(scenario?.resolveSourceRoot(workspace)).toBe("/references/stylex/packages/docs");
	});

	test("fails before touching a checkout when a lane is invalid", async () => {
		await expect(
			executeMigrationProof({
				scenario: MIGRATION_PROOF_SCENARIO.TailwindDocs,
				lane: "unknown",
				prepare: false,
			}),
		).rejects.toThrow("unknown lane 'unknown'");
	});
});
