import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	MIGRATION_ROUTE_PROOF_CATALOG,
	MigrationRouteProofExecutionTag,
	MigrationRouteProofRouteId,
	evaluateMigrationRouteProof,
	validateMigrationRouteProofEvidence,
	type MigrationRouteProofEvaluation,
} from "pandwind-codemod/swap";

const repositoryRoot = resolve(import.meta.dirname, "..");
const runProofs = process.argv.includes("--run");

const installedProofCommands: ReadonlyMap<MigrationRouteProofRouteId, readonly string[]> = new Map([
	[
		MigrationRouteProofRouteId.TailwindToPandwind,
		["--conditions", "pandwind", "scripts/promote-tailwind-fixture.ts"],
	],
	[
		MigrationRouteProofRouteId.PandaToPandwind,
		["--conditions", "pandwind", "scripts/promote-panda-fixture.ts"],
	],
	[
		MigrationRouteProofRouteId.StyledComponentsToPandwind,
		["--conditions", "pandwind", "scripts/promote-styled-components-fixture.ts"],
	],
	[
		MigrationRouteProofRouteId.UnoCssToPandwind,
		["--conditions", "pandwind", "scripts/promote-unocss-fixture.ts"],
	],
	[MigrationRouteProofRouteId.VanillaExtractToPandwind, ["scripts/promote-vanilla-extract.ts"]],
	[MigrationRouteProofRouteId.StitchesToPandwind, ["scripts/promote-stitches.ts"]],
	[MigrationRouteProofRouteId.MuiToPandwind, ["scripts/promote-mui.ts"]],
	[MigrationRouteProofRouteId.MantineToPandwind, ["scripts/promote-mantine.ts"]],
	[MigrationRouteProofRouteId.TokenamiToPandwind, ["scripts/promote-tokenami.ts"]],
	[
		MigrationRouteProofRouteId.JssToPandwind,
		["--conditions", "pandwind", "scripts/promote-css-in-js.ts", "jss"],
	],
	[
		MigrationRouteProofRouteId.FelaToPandwind,
		["--conditions", "pandwind", "scripts/promote-css-in-js.ts", "fela"],
	],
	[
		MigrationRouteProofRouteId.AphroditeToPandwind,
		["--conditions", "pandwind", "scripts/promote-css-in-js.ts", "aphrodite"],
	],
	[
		MigrationRouteProofRouteId.CompiledToPandwind,
		["--conditions", "pandwind", "scripts/promote-css-in-js.ts", "compiled"],
	],
	[
		MigrationRouteProofRouteId.Style9ToPandwind,
		["--conditions", "pandwind", "scripts/promote-css-in-js.ts", "style9"],
	],
	[
		MigrationRouteProofRouteId.NextYakToPandwind,
		["--conditions", "pandwind", "scripts/promote-css-in-js.ts", "next-yak"],
	],
	[
		MigrationRouteProofRouteId.LinariaToPandwind,
		["--conditions", "pandwind", "scripts/promote-framework-css-in-js.ts", "linaria"],
	],
	[
		MigrationRouteProofRouteId.TreatToPandwind,
		["--conditions", "pandwind", "scripts/promote-treat.ts"],
	],
	[
		MigrationRouteProofRouteId.SolidStyledToPandwind,
		["--conditions", "pandwind", "scripts/promote-framework-css-in-js.ts", "solid-styled"],
	],
	[
		MigrationRouteProofRouteId.VueStyledToPandwind,
		["--conditions", "pandwind", "scripts/promote-framework-css-in-js.ts", "vue-styled"],
	],
]);

function installedRoutes() {
	return MIGRATION_ROUTE_PROOF_CATALOG.filter(
		(route) => route.execution === MigrationRouteProofExecutionTag.InstalledProject,
	);
}

function readEvidence(): ReadonlyMap<string, unknown> {
	const entries: Array<readonly [string, unknown]> = [];
	for (const route of installedRoutes()) {
		for (const id of route.evidenceIds ?? []) {
			entries.push([
				id,
				JSON.parse(readFileSync(resolve(repositoryRoot, "plans/evidence", `${id}.json`), "utf8")),
			]);
		}
	}
	return new Map(entries);
}

function runInstalledProofs(): void {
	for (const route of installedRoutes()) {
		const command = installedProofCommands.get(route.id as MigrationRouteProofRouteId);
		if (command === undefined)
			throw new Error(`no executable installed proof is registered for ${route.id}`);
		console.log(`running installed proof: ${route.id}`);
		execFileSync("nub", command, { cwd: repositoryRoot, stdio: "inherit" });
	}
}

function verifyEvidence(): readonly MigrationRouteProofEvaluation[] {
	const evidence = readEvidence();
	const errors = [...validateMigrationRouteProofEvidence(MIGRATION_ROUTE_PROOF_CATALOG, evidence)];
	const evaluations = installedRoutes().map((route) =>
		evaluateMigrationRouteProof(route, evidence),
	);
	for (const evaluation of evaluations) {
		if (!evaluation.eligible) {
			errors.push(`${evaluation.route.id}: ${evaluation.reasons.join("; ")}`);
		}
	}
	if (errors.length > 0) {
		console.error(
			JSON.stringify(
				{
					schema: "pandwind.installed-route-proof-gate/1",
					mode: runProofs ? "run" : "check",
					errors: [...new Set(errors)],
					evaluations,
				},
				null,
				2,
			),
		);
		process.exitCode = 1;
	}
	return evaluations;
}

if (runProofs) runInstalledProofs();

const evaluations = verifyEvidence();
if (process.exitCode !== 1) {
	console.log(
		JSON.stringify(
			{
				schema: "pandwind.installed-route-proof-gate/1",
				mode: runProofs ? "run" : "check",
				routes: evaluations.map(({ route, eligible, reasons, dimensions }) => ({
					id: route.id,
					from: route.from,
					to: route.to,
					eligible,
					reasons,
					dimensions,
				})),
			},
			null,
			2,
		),
	);
}
