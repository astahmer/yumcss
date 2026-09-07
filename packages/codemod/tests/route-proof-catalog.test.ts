import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	MIGRATION_ROUTE_PROOF_CATALOG,
	MigrationRouteMaturityTag,
	MigrationRouteProofExecutionTag,
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
			MIGRATION_ROUTE_PROOF_CATALOG.every(
				(route) => route.execution !== MigrationRouteProofExecutionTag.InstalledProject,
			),
		).toBe(true);
	});

	test("matches Pandwind API dialects to the same route policy", () => {
		const route = findMigrationRouteProof(
			CodemodAdapterId.Tailwind,
			`${CodemodAdapterId.Pandwind}/tw`,
		);
		expect(route?.id).toBe("tailwind-to-pandwind");
		expect(route?.requiredDimensions).toContain("typecheck");
		expect(route?.requiredDimensions).toContain("build");
	});
});
