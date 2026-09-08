#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { cac, type Command } from "cac";
import {
	MIGRATION_PROOF_SCENARIO,
	MIGRATION_PROOF_SCENARIOS,
	migrationProofScenario,
	type LegacyMigrationProofRequest,
	type MigrationProofScenario,
	type MigrationProofScenarioContext,
	type MigrationProofScenarioId,
} from "./migration-proof-catalog.ts";
import { createReferenceWorkspace, type ReferenceWorkspace } from "./reference-workspace.ts";
import { ensureReferenceWorkspace } from "./ensure-reference-workspace.ts";

const MIGRATION_PROOF_SCHEMA = "pandwind.migration-proof/1" as const;
const MIGRATION_PROOF_COMMAND = {
	List: "list",
	Prepare: "prepare",
	Run: "run",
	All: "all",
} as const;

interface CliOptions {
	readonly referencesRoot?: string;
	readonly referenceRoot?: string;
	readonly root?: string;
	readonly outputRoot?: string;
	readonly report?: string;
	readonly reference?: string;
	readonly prepare?: boolean;
}

export interface MigrationProofRequest {
	readonly scenario: MigrationProofScenarioId;
	readonly lane?: string;
	readonly reference?: string;
	readonly sourceRoot?: string;
	readonly referencesRoot?: string;
	readonly outputRoot?: string;
	readonly reportPath?: string;
	readonly prepare: boolean;
}

export interface MigrationProofResult {
	readonly schema: typeof MIGRATION_PROOF_SCHEMA;
	readonly scenario: MigrationProofScenarioId;
	readonly lane?: string;
	readonly result: unknown;
}

export interface MigrationProofBatchResult {
	readonly schema: typeof MIGRATION_PROOF_SCHEMA;
	readonly results: readonly MigrationProofResult[];
}

function configureProofCommand(command: Command): void {
	command
		.option("--references-root <path>", "Reference workspace directory")
		.option("--reference-root <path>", "Alias for --references-root")
		.option("--root <path>", "Alias for --references-root")
		.option(
			"-o, --output-root <path>",
			"Materialize disposable proof projects below this directory",
		)
		.option("--report <path>", "Write the proof report as JSON")
		.option("--reference <id>", "Pinned reference id for the generic repository scenario")
		.option("--no-prepare", "Do not clone, reset, or install reference workspaces");
}

function stringOption(
	options: CliOptions,
	...names: readonly (keyof CliOptions)[]
): string | undefined {
	for (const name of names) {
		const value = options[name];
		if (typeof value === "string") return value;
	}
	return undefined;
}

function workspaceFrom(options: CliOptions): ReferenceWorkspace {
	return createReferenceWorkspace(stringOption(options, "referencesRoot", "referenceRoot", "root"));
}

function requireScenario(id: string): MigrationProofScenario {
	const scenario = migrationProofScenario(id);
	if (scenario !== undefined) return scenario;
	throw new Error(
		`unknown migration proof scenario '${id}' (expected ${MIGRATION_PROOF_SCENARIOS.map(({ id: value }) => value).join(", ")})`,
	);
}

function requireLane(
	scenario: MigrationProofScenario,
	lane: string | undefined,
): string | undefined {
	if (lane !== undefined) {
		if (scenario.lanes.includes(lane)) return lane;
		throw new Error(
			`unknown lane '${lane}' for '${scenario.id}' (expected ${scenario.lanes.join("|") || "none"})`,
		);
	}
	if (scenario.lanes.length === 1) return scenario.lanes[0];
	if (scenario.lanes.length === 0) return undefined;
	throw new Error(
		`migration proof '${scenario.id}' needs a lane (expected ${scenario.lanes.join("|")})`,
	);
}

function referenceIds(
	scenario: MigrationProofScenario,
	request: LegacyMigrationProofRequest,
): readonly string[] {
	return scenario.references(request);
}

async function prepareScenario(
	scenario: MigrationProofScenario,
	request: LegacyMigrationProofRequest,
	workspace: ReferenceWorkspace,
): Promise<void> {
	const ids = referenceIds(scenario, request);
	if (ids.length === 0)
		throw new Error(
			`migration proof '${scenario.id}' has no reference id; pass --reference <id> for the generic repository scenario`,
		);
	for (const id of ids) {
		const availability = await ensureReferenceWorkspace(id, workspace);
		console.log(`prepared ${availability.id}: ${availability.path}`);
	}
}

function runContext(
	request: MigrationProofRequest,
	workspace: ReferenceWorkspace,
	scenario: MigrationProofScenario,
	envelope: boolean,
): MigrationProofScenarioContext {
	return {
		workspace,
		sourceRoot: resolve(request.sourceRoot ?? scenario.resolveSourceRoot(workspace)),
		...(request.outputRoot === undefined ? {} : { outputRoot: resolve(request.outputRoot) }),
		...(request.reference === undefined ? {} : { reference: request.reference }),
		...(envelope || request.reportPath === undefined ? {} : { reportPath: request.reportPath }),
	};
}

async function writeJson(path: string, value: unknown): Promise<void> {
	const target = resolve(path);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

export async function executeMigrationProof(
	request: MigrationProofRequest,
	options: { readonly envelope?: boolean } = {},
): Promise<MigrationProofResult> {
	const writeEnvelope = options.envelope !== false;
	const scenario = requireScenario(request.scenario);
	const lane = requireLane(scenario, request.lane);
	const workspace = createReferenceWorkspace(request.referencesRoot);
	const legacyRequest: LegacyMigrationProofRequest = {
		lane,
		...(request.reference === undefined ? {} : { reference: request.reference }),
	};
	if (request.prepare) await prepareScenario(scenario, legacyRequest, workspace);
	const result = await scenario.run(lane, {
		...runContext(request, workspace, scenario, writeEnvelope),
	});
	const report: MigrationProofResult = {
		schema: MIGRATION_PROOF_SCHEMA,
		scenario: request.scenario,
		...(lane === undefined ? {} : { lane }),
		result,
	};
	if (request.reportPath !== undefined && writeEnvelope)
		await writeJson(request.reportPath, report);
	return report;
}

function outputForLane(
	root: string | undefined,
	scenario: string,
	lane: string | undefined,
): string | undefined {
	if (root === undefined) return undefined;
	return join(resolve(root), scenario, lane ?? "default");
}

export async function executeAllMigrationProofs(
	options: Omit<MigrationProofRequest, "scenario" | "lane">,
): Promise<MigrationProofBatchResult> {
	const results: MigrationProofResult[] = [];
	for (const scenario of MIGRATION_PROOF_SCENARIOS) {
		if (scenario.id === MIGRATION_PROOF_SCENARIO.ReferenceRepository) {
			if (options.reference === undefined) continue;
			results.push(
				await executeMigrationProof({
					...options,
					scenario: scenario.id,
					outputRoot: outputForLane(options.outputRoot, scenario.id, undefined),
					reportPath: undefined,
				}),
			);
			continue;
		}
		for (const lane of scenario.lanes) {
			results.push(
				await executeMigrationProof({
					...options,
					scenario: scenario.id,
					lane,
					outputRoot: outputForLane(options.outputRoot, scenario.id, lane),
					reportPath: undefined,
				}),
			);
		}
	}
	return { schema: MIGRATION_PROOF_SCHEMA, results };
}

function parseCliOptions(options: CliOptions): Omit<MigrationProofRequest, "scenario" | "lane"> {
	return {
		referencesRoot: stringOption(options, "referencesRoot", "referenceRoot", "root"),
		outputRoot: options.outputRoot,
		reportPath: options.report,
		reference: options.reference,
		prepare: options.prepare !== false,
	};
}

function printList(): void {
	for (const scenario of MIGRATION_PROOF_SCENARIOS) {
		const lanes = scenario.lanes.join(", ") || "reference id via --reference";
		console.log(`${scenario.id}\t${lanes}\t${scenario.label}`);
	}
}

function validateCommand(command: Command): void {
	command.checkUnknownOptions();
	command.checkOptionValue();
	command.checkRequiredArgs();
	command.checkUnusedArgs();
}

function createCli() {
	const cli = cac("pandwind migration-proof");
	cli.help();
	cli.command("list", "List registered migration proof scenarios and lanes");
	const prepare = cli.command("prepare [scenario]", "Prepare pinned reference workspaces");
	configureProofCommand(prepare);
	const run = cli.command("run <scenario> [lane]", "Run one migration proof lane");
	configureProofCommand(run);
	const all = cli.command("all", "Run every registered migration proof lane");
	configureProofCommand(all);
	return cli;
}

export async function runMigrationProofCli(argv = process.argv.slice(2)): Promise<void> {
	const cli = createCli();
	cli.parse(["node", "pandwind migration-proof", ...argv], { run: false });
	const command = cli.matchedCommand;
	if (command === undefined) {
		if (argv.includes("-h") || argv.includes("--help")) return;
		cli.outputHelp();
		return;
	}
	validateCommand(command);
	const options = cli.options as CliOptions;
	if (command.name === MIGRATION_PROOF_COMMAND.List) {
		printList();
		return;
	}
	const shared = parseCliOptions(options);
	if (command.name === MIGRATION_PROOF_COMMAND.Prepare) {
		const scenarioName = cli.args[0];
		const scenarios =
			scenarioName === undefined
				? MIGRATION_PROOF_SCENARIOS.filter(
						(scenario) => scenario.id !== MIGRATION_PROOF_SCENARIO.ReferenceRepository,
					)
				: [requireScenario(scenarioName)];
		for (const scenario of scenarios) {
			await prepareScenario(scenario, { reference: shared.reference }, workspaceFrom(options));
		}
		return;
	}
	if (command.name === MIGRATION_PROOF_COMMAND.Run) {
		const scenario = requireScenario(cli.args[0] ?? "");
		const result = await executeMigrationProof({
			...shared,
			scenario: scenario.id,
			lane: cli.args[1],
		});
		console.log(JSON.stringify(result, null, 2));
		return;
	}
	if (command.name === MIGRATION_PROOF_COMMAND.All) {
		const result = await executeAllMigrationProofs(shared);
		if (shared.reportPath !== undefined) await writeJson(shared.reportPath, result);
		console.log(JSON.stringify(result, null, 2));
		return;
	}
	throw new Error(`unsupported migration proof command: ${command.name}`);
}

export async function runMigrationProofCompat(
	scenarioId: MigrationProofScenarioId,
	argv: readonly string[],
): Promise<void> {
	if (argv.includes("-h") || argv.includes("--help")) {
		await runMigrationProofCli([MIGRATION_PROOF_COMMAND.Run, scenarioId, "--help"]);
		return;
	}
	const scenario = requireScenario(scenarioId);
	const parsed = scenario.parseLegacyArgs?.(argv) ?? {};
	const result = await executeMigrationProof(
		{
			scenario: scenario.id,
			lane: parsed.lane,
			reference: parsed.reference,
			sourceRoot: parsed.sourceRoot,
			referencesRoot: undefined,
			outputRoot: parsed.outputRoot,
			reportPath: parsed.reportPath,
			prepare: false,
		},
		{ envelope: false },
	);
	console.log(JSON.stringify(result.result, null, 2));
	if (scenario.isFailure?.(result.result)) process.exitCode = 1;
}

if (import.meta.main) {
	await runMigrationProofCli().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
