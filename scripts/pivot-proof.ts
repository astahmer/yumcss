import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	CodemodAdapterId,
	createAdapterContractSuite,
	createAdapterCoverageGate,
	createAdapterConformanceSuite,
	createBuiltinCodemodCatalog,
	createRealRepositoryCorpus,
	RealRepositoryProofDimension,
	RealRepositoryProofDimensionStatus,
	requiredAdapterCapabilities,
	type AdapterCoverageEvidence,
	type AdapterContractFixture,
} from "pandwind-codemod/swap";
import { adapterContractFixtures } from "../packages/codemod/proof/adapter-contract-fixtures.ts";
import { completeAdapterMatrixFixtures } from "../packages/codemod/proof/adapter-matrix-fixtures.ts";
import { createReferenceWorkspace } from "./reference-workspace.ts";
import { createPinnedReferenceRepositoryCatalog } from "./reference-repository-catalog.ts";

const root = resolve(import.meta.dirname, "..");
const proofMatrixPath = resolve(root, "plans/evidence/real-browser-ssr-proof-matrix.json");

interface ProofMatrixClaim {
	readonly id: string;
	readonly sourceAdapter: string;
	readonly referenceCommit: string;
	readonly report: string;
	readonly server: { readonly checked: boolean };
	readonly browser: {
		readonly checked: boolean;
		readonly equivalent: boolean;
		readonly hydrationRoutes?: number;
	};
	readonly css: { readonly notLarger: boolean };
}

interface ProofMatrix {
	readonly schema: string;
	readonly claims: readonly ProofMatrixClaim[];
	readonly fixtureOnlyAdapters?: readonly string[];
}

function parseFixtureEvidence(
	registry: ReturnType<typeof createBuiltinCodemodCatalog>["registry"],
	fixture: AdapterContractFixture,
): AdapterCoverageEvidence {
	const adapter = registry.get(fixture.adapter);
	if (adapter === undefined)
		throw new Error(`coverage fixture references unregistered adapter ${fixture.adapter}`);
	const config = adapter.loadConfig({ file: fixture.file, source: fixture.source });
	const parsed = adapter.parse(fixture.source, {
		file: fixture.file,
		source: fixture.source,
		config,
	});
	return {
		adapter: fixture.adapter,
		fixture: fixture.file,
		kind: "contract",
		capabilities: parsed.matches.flatMap((match) =>
			requiredAdapterCapabilities(match.program).map((requirement) => requirement.capability),
		),
	};
}

function readCheckedInProofMatrix(): ProofMatrix {
	const matrix = JSON.parse(readFileSync(proofMatrixPath, "utf8")) as ProofMatrix;
	if (matrix.schema !== "pandwind.real-browser-ssr-proof-matrix/1")
		throw new Error(`unsupported proof matrix schema: ${matrix.schema}`);
	for (const claim of matrix.claims) {
		const report = resolve(root, claim.report);
		if (!existsSync(report))
			throw new Error(`${claim.id} points to missing report ${claim.report}`);
		if (!claim.server.checked || !claim.browser.checked || !claim.browser.equivalent)
			throw new Error(`${claim.id} is not browser/SSR equivalent in the checked-in matrix`);
		if (!claim.css.notLarger) throw new Error(`${claim.id} exceeds its baseline CSS size`);
	}
	return matrix;
}

function parseProductionProofEvidence(claim: ProofMatrixClaim): AdapterCoverageEvidence {
	const proof: Partial<Record<RealRepositoryProofDimension, RealRepositoryProofDimensionStatus>> =
		{};
	if (claim.browser.checked && claim.browser.equivalent)
		proof[RealRepositoryProofDimension.BrowserStates] = RealRepositoryProofDimensionStatus.Passed;
	if (claim.server.checked)
		proof[RealRepositoryProofDimension.SsrHydration] = RealRepositoryProofDimensionStatus.Passed;
	if (claim.css.notLarger)
		proof[RealRepositoryProofDimension.CssSize] = RealRepositoryProofDimensionStatus.Passed;
	return {
		adapter: claim.sourceAdapter,
		fixture: claim.id,
		kind: "browser",
		capabilities: [],
		proof,
	};
}

function runOfflineGate(): void {
	const catalog = createBuiltinCodemodCatalog();
	const contract = createAdapterContractSuite().run(catalog.registry, adapterContractFixtures);
	if (contract.failed > 0)
		throw new Error(`adapter contract gate failed:\n${JSON.stringify(contract.failures, null, 2)}`);
	const conformance = createAdapterConformanceSuite(catalog.registry, {
		readFile: () => undefined,
	}).run(completeAdapterMatrixFixtures);
	if (!conformance.passed)
		throw new Error(
			`adapter conformance gate failed:\n${JSON.stringify(
				{ direct: conformance.failures, routes: conformance.routes.failures },
				null,
				2,
			)}`,
		);
	const routeMatrix = conformance.routes;
	if (routeMatrix.failed > 0)
		throw new Error(
			`bidirectional route matrix failed:\n${JSON.stringify(routeMatrix.failures, null, 2)}`,
		);

	const evidence: AdapterCoverageEvidence[] = adapterContractFixtures.map((fixture) =>
		parseFixtureEvidence(catalog.registry, fixture),
	);
	const matrix = readCheckedInProofMatrix();
	const fixtureOnlyAdapters = new Set(matrix.fixtureOnlyAdapters ?? []);
	const references = createRealRepositoryCorpus().references;
	const pinnedReferences = createPinnedReferenceRepositoryCatalog();
	const referencedAdapters = new Set(references.map((reference) => reference.from));
	for (const claim of matrix.claims) {
		const reference = pinnedReferences.find(
			(candidate) => candidate.commit === claim.referenceCommit,
		);
		if (reference === undefined)
			throw new Error(
				`${claim.id} is not backed by a pinned corpus reference for ${claim.sourceAdapter}`,
			);
		if (fixtureOnlyAdapters.has(claim.sourceAdapter))
			throw new Error(`${claim.id} is both promoted and marked fixture-only`);
	}
	for (const adapter of catalog.adapters) {
		if (adapter.id === CodemodAdapterId.Pandwind || adapter.id === CodemodAdapterId.ReactNative)
			continue;
		if (!referencedAdapters.has(adapter.id))
			throw new Error(`adapter ${adapter.id} has no pinned real-repository corpus entry`);
	}
	for (const reference of references) {
		evidence.push({
			adapter: reference.from,
			fixture: `${reference.clone}:${reference.path}`,
			kind: "real-repository",
			capabilities: [],
		});
	}
	for (const claim of matrix.claims) evidence.push(parseProductionProofEvidence(claim));
	const promotedProofDimensions = Object.fromEntries(
		matrix.claims.map((claim) => [
			claim.sourceAdapter,
			[
				RealRepositoryProofDimension.BrowserStates,
				RealRepositoryProofDimension.SsrHydration,
				RealRepositoryProofDimension.CssSize,
			],
		]),
	);
	const coverage = createAdapterCoverageGate().evaluate(catalog.registry, evidence, {
		minimumFixturesPerAdapter: 1,
		minimumContractFixturesPerAdapter: 1,
		minimumRealRepositoryFixturesPerAdapter: 1,
		requiredCapabilitiesPerAdapter: ["declarations"],
		requiredProofDimensionsByAdapter: promotedProofDimensions,
		excludedAdapters: [CodemodAdapterId.Pandwind, CodemodAdapterId.ReactNative],
		requiredCapabilities: ["declarations"],
	});
	if (!coverage.passed)
		throw new Error(`adapter coverage gate failed:\n${JSON.stringify(coverage.failures, null, 2)}`);
	console.log(
		JSON.stringify(
			{
				schema: "pandwind.pivot-proof/1",
				mode: "offline",
				adapters: catalog.adapters.length,
				contractFixtures: adapterContractFixtures.length,
				realRepositoryFixtures: references.length,
				proofClaims: matrix.claims.length,
				routeMatrix: {
					cases: routeMatrix.cases.length,
					passed: routeMatrix.passed,
					failed: routeMatrix.failed,
				},
				adapterConformance: {
					adapters: conformance.direct.length,
					directPhases: ["detection", "configuration", "parsing", "emission", "validation"],
					scenarios: ["happy", "edge", "malformed"],
				},
				fixtureOnlyAdapters: [...fixtureOnlyAdapters],
				capabilities: coverage.capabilityTotals,
				proof: coverage.proofTotals,
			},
			null,
			2,
		),
	);
}

function runReferenceProof(): void {
	const output =
		process.env.PANDWIND_PROOF_OUTPUT ??
		join(tmpdir(), "pandwind-pivot-proof", "real-repository-migrations-v2.json");
	const env = { ...process.env, PANDWIND_PROOF_OUTPUT: output };
	execFileSync("pnpm", ["run", "references:prepare"], { cwd: root, stdio: "inherit" });
	execFileSync("nub", ["scripts/audit-real-repository-pins.ts"], {
		cwd: root,
		stdio: "inherit",
	});
	execFileSync("nub", ["scripts/generate-real-repository-report.ts", "--write"], {
		cwd: root,
		env,
		stdio: "inherit",
	});
	if (!existsSync(output)) throw new Error(`proof runner did not write ${output}`);
	console.log(`source-only proof report: ${output}`);
	console.log(`reference workspace verified: ${createReferenceWorkspace().root}`);
}

if (process.argv.includes("--prepare")) runReferenceProof();
runOfflineGate();
