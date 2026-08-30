import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	CodemodAdapterId,
	createAdapterContractSuite,
	createAdapterCoverageGate,
	createBuiltinCodemodCatalog,
	createRealRepositoryCorpus,
	requiredAdapterCapabilities,
	type AdapterCoverageEvidence,
	type AdapterContractFixture,
} from "../packages/codemod/src/swap/index.ts";
import { adapterContractFixtures } from "../packages/codemod/tests/adapter-contract-fixtures.ts";
import { createReferenceWorkspace } from "./reference-workspace.ts";

const root = resolve(import.meta.dirname, "..");
const proofMatrixPath = resolve(root, "plans/evidence/real-browser-ssr-proof-matrix.json");

interface ProofMatrixClaim {
	readonly id: string;
	readonly report: string;
	readonly server: { readonly checked: boolean };
	readonly browser: { readonly checked: boolean; readonly equivalent: boolean };
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

function runOfflineGate(): void {
	const catalog = createBuiltinCodemodCatalog();
	const contract = createAdapterContractSuite().run(catalog.registry, adapterContractFixtures);
	if (contract.failed > 0)
		throw new Error(`adapter contract gate failed:\n${JSON.stringify(contract.failures, null, 2)}`);

	const evidence: AdapterCoverageEvidence[] = adapterContractFixtures.map((fixture) =>
		parseFixtureEvidence(catalog.registry, fixture),
	);
	const matrix = readCheckedInProofMatrix();
	const fixtureOnlyAdapters = new Set(matrix.fixtureOnlyAdapters ?? []);
	const references = createRealRepositoryCorpus().references;
	const referencedAdapters = new Set(references.map((reference) => reference.from));
	for (const adapter of catalog.adapters) {
		if (adapter.id === CodemodAdapterId.Pandwind || fixtureOnlyAdapters.has(adapter.id)) continue;
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
	const coverage = createAdapterCoverageGate().evaluate(catalog.registry, evidence, {
		minimumFixturesPerAdapter: 1,
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
				fixtureOnlyAdapters: [...fixtureOnlyAdapters],
				capabilities: coverage.capabilityTotals,
			},
			null,
			2,
		),
	);
}

function runReferenceProof(): void {
	execFileSync("pnpm", ["references:prepare"], { cwd: root, stdio: "inherit" });
	execFileSync("pnpm", ["exec", "tsx", "scripts/audit-real-repository-pins.ts"], {
		cwd: root,
		stdio: "inherit",
	});
	execFileSync("pnpm", ["exec", "tsx", "scripts/generate-real-repository-report.ts", "--write"], {
		cwd: root,
		stdio: "inherit",
	});
	console.log(`reference workspace verified: ${createReferenceWorkspace().root}`);
}

if (process.argv.includes("--prepare")) runReferenceProof();
runOfflineGate();
