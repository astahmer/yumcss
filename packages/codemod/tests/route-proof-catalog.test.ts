import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	MIGRATION_ROUTE_PROOF_CATALOG,
	MigrationRouteMaturityTag,
	MigrationRouteProofExecutionTag,
	MigrationRouteProofRouteId,
	RealRepositoryProofDimension,
	RealRepositoryProofDimensionStatus,
	createRealRepositoryCorpus,
	createBuiltinCodemodCatalog,
	evaluateMigrationRouteProof,
	findMigrationRouteProof,
	migrationRouteProofCatalog,
	validateMigrationRouteProofCatalog,
	validateMigrationRouteProofEvidence,
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
				id: MigrationRouteProofRouteId.PandaToPandwind,
				evidenceIds: ["panda-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.StyledComponentsToPandwind,
				evidenceIds: ["styled-components-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.UnoCssToPandwind,
				evidenceIds: ["unocss-installed-proof"],
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
		expect(route?.requiredDimensions).toContain(RealRepositoryProofDimension.Typecheck);
		expect(route?.requiredDimensions).toContain(RealRepositoryProofDimension.Build);
		expect(route?.evidenceIds).toEqual(["tailwind-installed-proof"]);
	});

	test("requires every installed-project route to have passing checked-in evidence", () => {
		const evidence = new Map(
			MIGRATION_ROUTE_PROOF_CATALOG.flatMap((route) =>
				(route.evidenceIds ?? []).map((id) => [
					id,
					JSON.parse(
						readFileSync(
							resolve(import.meta.dirname, "../../../plans/evidence", `${id}.json`),
							"utf8",
						),
					),
				]),
			),
		);
		expect(validateMigrationRouteProofEvidence(MIGRATION_ROUTE_PROOF_CATALOG, evidence)).toEqual(
			[],
		);
	});

	test("does not confuse browser parity with canonical CSS proof", () => {
		const route = MIGRATION_ROUTE_PROOF_CATALOG.find(
			(candidate) => candidate.id === MigrationRouteProofRouteId.TailwindToPandwind,
		);
		if (route === undefined) throw new Error("missing Tailwind route");
		const report = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/tailwind-installed-proof.json"),
				"utf8",
			),
		) as unknown;
		const evaluation = evaluateMigrationRouteProof(
			route,
			new Map([["tailwind-installed-proof", report]]),
		);

		expect(evaluation.eligible).toBe(false);
		expect(evaluation.dimensions[RealRepositoryProofDimension.BrowserStates].status).toBe(
			RealRepositoryProofDimensionStatus.Passed,
		);
		expect(evaluation.dimensions[RealRepositoryProofDimension.CanonicalCss].status).toBe(
			RealRepositoryProofDimensionStatus.Unavailable,
		);
		expect(evaluation.reasons).toContain("adapter-level canonical CSS comparison was not recorded");
	});

	test("requires installed evidence to identify an isolated host fixture", () => {
		const route = MIGRATION_ROUTE_PROOF_CATALOG.find(
			(candidate) => candidate.id === MigrationRouteProofRouteId.TailwindToPandwind,
		);
		if (route === undefined) throw new Error("missing Tailwind route");
		const evidence = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/tailwind-installed-proof.json"),
				"utf8",
			),
		) as { fixture: { isolated: boolean; files: string[] } };
		const withoutFixture = { ...evidence, fixture: { isolated: false, files: [] } };
		const errors = validateMigrationRouteProofEvidence(
			[route],
			new Map([["tailwind-installed-proof", withoutFixture]]),
		);

		expect(errors).toContain(
			"tailwind-to-pandwind: evidence tailwind-installed-proof does not prove an isolated fixture",
		);
		expect(errors).toContain(
			"tailwind-to-pandwind: evidence tailwind-installed-proof does not declare fixture files",
		);
	});

	test("labels routes without installed evidence as unavailable", () => {
		const route = MIGRATION_ROUTE_PROOF_CATALOG.find(
			(candidate) => candidate.id === MigrationRouteProofRouteId.TailwindToUnoCss,
		);
		if (route === undefined) throw new Error("missing Tailwind to UnoCSS route");
		const evaluation = evaluateMigrationRouteProof(route, new Map());

		expect(evaluation.eligible).toBe(false);
		expect(evaluation.dimensions[RealRepositoryProofDimension.Typecheck].status).toBe(
			RealRepositoryProofDimensionStatus.Unavailable,
		);
		expect(evaluation.reasons).toContain("no checked-in evidence is available");
	});

	test("covers every registered route with an explicit research policy", () => {
		const catalog = createBuiltinCodemodCatalog();
		const expanded = migrationRouteProofCatalog(catalog.systems);
		const route = findMigrationRouteProof(
			CodemodAdapterId.Emotion,
			CodemodAdapterId.Mui,
			catalog.systems,
		);

		expect(route).toMatchObject({
			id: `${MigrationRouteProofRouteId.Unclassified}:emotion->mui`,
			maturity: MigrationRouteMaturityTag.Research,
			execution: MigrationRouteProofExecutionTag.Unavailable,
		});
		expect(expanded.routes).toContainEqual(route);
		expect(
			validateMigrationRouteProofCatalog(createRealRepositoryCorpus(), expanded.routes),
		).toEqual([]);
		expect(
			findMigrationRouteProof("missing-source", CodemodAdapterId.Pandwind, catalog.systems),
		).toBeUndefined();
	});
});
