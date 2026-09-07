import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	MIGRATION_ROUTE_PROOF_CATALOG,
	MigrationRouteMaturityTag,
	MigrationRouteProofExecutionTag,
	MigrationRouteProofRouteId,
	createRealRepositoryCorpus,
	findMigrationRouteProof,
	validateMigrationRouteProofCatalog,
} from "../src/swap/index.ts";

describe("migration route proof catalog", () => {
	test("declares the first-tier routes and their proof debt once", () => {
		expect(validateMigrationRouteProofCatalog(createRealRepositoryCorpus())).toEqual([]);
		expect(MIGRATION_ROUTE_PROOF_CATALOG).toHaveLength(7);
		expect(
			MIGRATION_ROUTE_PROOF_CATALOG.filter(
				(route) => route.maturity === MigrationRouteMaturityTag.Stable,
			),
		).toEqual([]);
		expect(
			MIGRATION_ROUTE_PROOF_CATALOG.filter(
				(route) => route.execution === MigrationRouteProofExecutionTag.InstalledProject,
			),
		).toMatchObject([
			expect.objectContaining({
				id: MigrationRouteProofRouteId.TailwindToPandwind,
				evidenceIds: ["tailwind-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.StyledComponentsToPandwind,
				evidenceIds: ["styled-components-installed-proof"],
			}),
		]);
	});

	test("matches Pandwind API dialects to the same route policy", () => {
		const route = findMigrationRouteProof(
			CodemodAdapterId.Tailwind,
			`${CodemodAdapterId.Pandwind}/tw`,
		);
		expect(route?.id).toBe(MigrationRouteProofRouteId.TailwindToPandwind);
		expect(
			findMigrationRouteProof(CodemodAdapterId.Tailwind, `${CodemodAdapterId.Pandwind}:tw`)?.id,
		).toBe(MigrationRouteProofRouteId.TailwindToPandwind);
		expect(route?.requiredDimensions).toContain("typecheck");
		expect(route?.requiredDimensions).toContain("build");
		expect(route?.evidenceIds).toEqual(["tailwind-installed-proof"]);
	});
});
