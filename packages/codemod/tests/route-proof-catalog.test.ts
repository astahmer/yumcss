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
		expect(MIGRATION_ROUTE_PROOF_CATALOG).toHaveLength(22);
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
				id: MigrationRouteProofRouteId.TailwindToYumCSS,
				evidenceIds: ["tailwind-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.PandaToYumCSS,
				evidenceIds: ["panda-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.StyledComponentsToYumCSS,
				evidenceIds: ["styled-components-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.UnoCssToYumCSS,
				evidenceIds: ["unocss-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.VanillaExtractToYumCSS,
				evidenceIds: ["vanilla-extract-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.StitchesToYumCSS,
				evidenceIds: ["stitches-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.MuiToYumCSS,
				evidenceIds: ["mui-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.MantineToYumCSS,
				evidenceIds: ["mantine-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.TokenamiToYumCSS,
				evidenceIds: ["tokenami-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.JssToYumCSS,
				evidenceIds: ["jss-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.FelaToYumCSS,
				evidenceIds: ["fela-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.AphroditeToYumCSS,
				evidenceIds: ["aphrodite-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.CompiledToYumCSS,
				evidenceIds: ["compiled-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.Style9ToYumCSS,
				evidenceIds: ["style9-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.NextYakToYumCSS,
				evidenceIds: ["next-yak-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.LinariaToYumCSS,
				evidenceIds: ["linaria-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.TreatToYumCSS,
				evidenceIds: ["treat-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.SolidStyledToYumCSS,
				evidenceIds: ["solid-styled-installed-proof"],
			}),
			expect.objectContaining({
				id: MigrationRouteProofRouteId.VueStyledToYumCSS,
				evidenceIds: ["vue-styled-installed-proof"],
			}),
		]);
	});

	test("matches YumCSS API dialects to the same route policy", () => {
		const route = findMigrationRouteProof(
			CodemodAdapterId.Tailwind,
			`${CodemodAdapterId.YumCSS}/tw`,
		);
		expect(route?.id).toBe(MigrationRouteProofRouteId.TailwindToYumCSS);
		expect(
			findMigrationRouteProof(CodemodAdapterId.Tailwind, `${CodemodAdapterId.YumCSS}:tw`)?.id,
		).toBe(MigrationRouteProofRouteId.TailwindToYumCSS);
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
		for (const route of MIGRATION_ROUTE_PROOF_CATALOG.filter(
			(candidate) => candidate.execution === MigrationRouteProofExecutionTag.InstalledProject,
		)) {
			const evaluation = evaluateMigrationRouteProof(route, evidence);
			expect(evaluation.eligible, `${route.id}: ${evaluation.reasons.join("; ")}`).toBe(true);
		}
	});

	test("does not confuse browser parity with canonical CSS proof", () => {
		const route = MIGRATION_ROUTE_PROOF_CATALOG.find(
			(candidate) => candidate.id === MigrationRouteProofRouteId.TailwindToYumCSS,
		);
		if (route === undefined) throw new Error("missing Tailwind route");
		const report = JSON.parse(
			readFileSync(
				resolve(import.meta.dirname, "../../../plans/evidence/tailwind-installed-proof.json"),
				"utf8",
			),
		) as { readonly migration: Readonly<Record<string, unknown>> };
		const withoutCanonical = {
			...report,
			migration: { ...report.migration, canonical: undefined },
		};
		const evaluation = evaluateMigrationRouteProof(
			route,
			new Map([["tailwind-installed-proof", withoutCanonical]]),
		);

		expect(evaluation.eligible).toBe(false);
		expect(evaluation.dimensions[RealRepositoryProofDimension.BrowserStates].status).toBe(
			RealRepositoryProofDimensionStatus.Passed,
		);
		expect(evaluation.dimensions[RealRepositoryProofDimension.CanonicalCss].status).toBe(
			RealRepositoryProofDimensionStatus.Unavailable,
		);
		expect(evaluation.reasons).toContain("adapter-level canonical CSS comparison was not recorded");
		expect(
			validateMigrationRouteProofEvidence(
				[route],
				new Map([["tailwind-installed-proof", withoutCanonical]]),
			),
		).toContain(
			"tailwind-to-yumcss: evidence tailwind-installed-proof did not prove canonical CSS equality",
		);
	});

	test("requires installed evidence to identify an isolated host fixture", () => {
		const route = MIGRATION_ROUTE_PROOF_CATALOG.find(
			(candidate) => candidate.id === MigrationRouteProofRouteId.TailwindToYumCSS,
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
			"tailwind-to-yumcss: evidence tailwind-installed-proof does not prove an isolated fixture",
		);
		expect(errors).toContain(
			"tailwind-to-yumcss: evidence tailwind-installed-proof does not declare fixture files",
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
		const expanded = migrationRouteProofCatalog(catalog.registry);
		const route = findMigrationRouteProof(
			CodemodAdapterId.Emotion,
			CodemodAdapterId.Mui,
			catalog.registry,
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
			findMigrationRouteProof("missing-source", CodemodAdapterId.YumCSS, catalog.registry),
		).toBeUndefined();
	});
});
