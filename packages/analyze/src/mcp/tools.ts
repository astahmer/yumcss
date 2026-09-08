import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { createSourceWorkspace } from "pandwind/source/workspace";
import {
	createBuiltinCodemodCatalog,
	findMigrationRouteProof,
	migrationRouteProofCatalog,
	type AdapterCapabilityMode,
	type AdapterMigrationResult,
	type CodemodAdapterCatalog,
	type StyleMigrationUseCase,
} from "pandwind-codemod/swap";
import { STYLE_MIGRATION_USE_CASE } from "pandwind-codemod/swap";
import { unifiedDiff } from "pandwind-codemod/diff";
import { runCli } from "../cli.ts";
import { McpToolError, textToolResult } from "./tool-contract.ts";
import {
	MCP_MIGRATION_MODE,
	MCP_BENCHMARK_SCOPE,
	MCP_BENCHMARK_MEASUREMENT_MODE,
	MCP_EVIDENCE_LANE,
	MCP_EVIDENCE_STATUS,
	MCP_EXECUTION_LANE,
	MCP_PROVENANCE_SOURCE,
	MCP_RESOURCE,
	MCP_TOOL,
	MCP_VALIDATION_CHECK,
	MCP_VALIDATION_STATUS,
	type McpBenchmarkScope,
	type McpBenchmarkMeasurementMode,
	type McpExecutionEvidence,
	type McpExecutionLane,
	type McpProvenanceSource,
	type McpValidationCheck,
	type McpValidationStatus,
} from "./contract.ts";
import type { McpToolDefinition, McpToolResult } from "./contract.ts";

export {
	MCP_MIGRATION_MODE,
	MCP_BENCHMARK_SCOPE,
	MCP_BENCHMARK_MEASUREMENT_MODE,
	MCP_EVIDENCE_LANE,
	MCP_EVIDENCE_STATUS,
	MCP_EXECUTION_LANE,
	MCP_PROVENANCE_SOURCE,
	MCP_RESOURCE,
	MCP_TOOL,
	MCP_VALIDATION_CHECK,
	MCP_VALIDATION_STATUS,
	type McpBenchmarkScope,
	type McpBenchmarkMeasurementMode,
	type McpExecutionEvidence,
	type McpExecutionLane,
	type McpProvenanceSource,
	type McpValidationCheck,
	type McpValidationStatus,
} from "./contract.ts";

const MCP_PROJECT_SCHEMA = "pandwind.mcp.project/2" as const;
const MCP_FILE_LIST_LIMIT = 500;

export interface McpProjectContext {
	readonly root: string;
	readonly workspace: ReturnType<typeof createSourceWorkspace>;
}

export interface McpToolService {
	readonly tools: readonly McpToolDefinition[];
	readonly resources: readonly McpResourceDefinition[];
	call(name: string, arguments_: unknown): Promise<McpToolResult>;
	readResource(uri: string): Promise<string>;
}

export interface McpResourceDefinition {
	readonly uri: string;
	readonly name: string;
	readonly description: string;
	readonly mimeType: "application/json" | "text/plain";
}

export interface McpValidationRequest {
	readonly root: string;
	readonly from: string;
	readonly to: string;
	readonly mode: AdapterCapabilityMode;
	readonly files: readonly {
		readonly file: string;
		readonly code: string;
		readonly outputFile: string;
	}[];
	readonly checks: readonly McpValidationCheck[];
}

export interface McpValidationResult {
	readonly check: McpValidationCheck;
	readonly status: McpValidationStatus;
	readonly executionLane: McpExecutionLane;
	readonly detail?: string;
	readonly commandsExecuted?: readonly string[];
	readonly requiredHostCapability?: McpValidationCheck;
	readonly provenance?: {
		readonly source: McpProvenanceSource;
		readonly host?: string;
		readonly evidence?: readonly string[];
	};
}

/**
 * Host-owned project checks. The MCP service never accepts arbitrary commands
 * from a tool caller; a CLI, IDE, or repository integration supplies this
 * port when it has an auditable typecheck/build/browser/SSR runner.
 */
export interface McpValidationPort {
	run(request: McpValidationRequest): Promise<readonly McpValidationResult[]>;
}

export interface McpBenchmarkRequest {
	readonly root: string;
	readonly from: string;
	readonly to: string;
	readonly mode: AdapterCapabilityMode;
	readonly files: readonly string[];
	readonly iterations: number;
	readonly measurementMode: McpBenchmarkMeasurementMode;
}

export interface McpBenchmarkResult {
	readonly executionLane: McpExecutionLane;
	readonly scope: McpBenchmarkScope;
	readonly measurementMode: McpBenchmarkMeasurementMode;
	readonly profile: string;
	readonly measurements: Readonly<Record<string, unknown>>;
	readonly commandsExecuted?: readonly string[];
	readonly limitations?: readonly string[];
}

export interface McpBenchmarkPort {
	run(request: McpBenchmarkRequest): Promise<McpBenchmarkResult>;
}

/** Application ports used by the MCP tool façade. */
export interface McpToolPorts {
	readonly createCatalog: () => CodemodAdapterCatalog;
	readonly migration: Pick<StyleMigrationUseCase, "runAsync">;
	readonly analyze: (argv: readonly string[]) => Promise<string>;
	readonly validation?: McpValidationPort;
	readonly benchmark?: McpBenchmarkPort;
}

const DEFAULT_TOOL_PORTS: McpToolPorts = {
	createCatalog: createBuiltinCodemodCatalog,
	migration: STYLE_MIGRATION_USE_CASE,
	analyze: (argv) => runCli([...argv]),
};

const DEFAULT_ANALYZE_PRESET = "@pandwind/example-preset";

const DEFAULT_VALIDATION_CHECKS: readonly McpValidationCheck[] = [
	MCP_VALIDATION_CHECK.Contract,
	MCP_VALIDATION_CHECK.CanonicalCss,
];

const EXTERNAL_VALIDATION_CHECKS: readonly McpValidationCheck[] = [
	MCP_VALIDATION_CHECK.Typecheck,
	MCP_VALIDATION_CHECK.Build,
	MCP_VALIDATION_CHECK.Ssr,
	MCP_VALIDATION_CHECK.Hydration,
	MCP_VALIDATION_CHECK.Browser,
	MCP_VALIDATION_CHECK.BundleSize,
];

function executionEvidence(
	lane: McpExecutionEvidence["lane"],
	status: McpExecutionEvidence["status"],
	checks: readonly string[],
	detail: string,
): McpExecutionEvidence {
	return { lane, status, checks, detail };
}

function inProcessEvidence(checks: readonly string[], detail: string): McpExecutionEvidence {
	return executionEvidence(
		MCP_EVIDENCE_LANE.InProcess,
		MCP_EVIDENCE_STATUS.Verified,
		checks,
		detail,
	);
}

function validationEvidence(check: McpValidationResult): McpExecutionEvidence {
	const status = {
		[MCP_VALIDATION_STATUS.Passed]: MCP_EVIDENCE_STATUS.Verified,
		[MCP_VALIDATION_STATUS.Failed]: MCP_EVIDENCE_STATUS.Failed,
		[MCP_VALIDATION_STATUS.Unavailable]: MCP_EVIDENCE_STATUS.Unavailable,
		[MCP_VALIDATION_STATUS.Skipped]: MCP_EVIDENCE_STATUS.Skipped,
		[MCP_VALIDATION_STATUS.NotApplicable]: MCP_EVIDENCE_STATUS.NotApplicable,
	}[check.status];
	return executionEvidence(
		check.executionLane === MCP_EXECUTION_LANE.HostProject
			? MCP_EVIDENCE_LANE.HostVerified
			: MCP_EVIDENCE_LANE.InProcess,
		status,
		[check.check],
		check.detail ?? `validation check ${check.check} returned ${check.status}`,
	);
}

const inputSchema = (
	properties: Readonly<Record<string, unknown>>,
	required: readonly string[] = [],
) => ({
	type: "object",
	properties,
	additionalProperties: false,
	...(required.length === 0 ? {} : { required }),
});

const MCP_MIGRATION_INPUT_SCHEMA = inputSchema(
	{
		files: {
			type: "array",
			items: { type: "string" },
			description: "Project-relative files or globs.",
		},
		from: { type: "string", description: "Registered source adapter or dialect id." },
		to: { type: "string", description: "Registered target adapter or dialect id." },
		mode: { type: "string", enum: Object.values(MCP_MIGRATION_MODE) },
	},
	["files", "from", "to"],
);

export const MCP_TOOLS: readonly McpToolDefinition[] = [
	{
		name: MCP_TOOL.InspectProject,
		description:
			"Inspect a project root with the registered source adapters and report detected styling ecosystems, source files, and project evidence.",
		inputSchema: inputSchema({
			includeFiles: {
				type: "boolean",
				description: "Include the bounded project file list in the result.",
			},
		}),
	},
	{
		name: MCP_TOOL.PreviewMigration,
		description:
			"Preview a registered source-to-target migration without writing source or generated files.",
		inputSchema: MCP_MIGRATION_INPUT_SCHEMA,
	},
	{
		name: MCP_TOOL.ApplyMigration,
		description:
			"Apply an explicitly confirmed migration plan after checking every source, generated-file, and shared-file conflict.",
		inputSchema: inputSchema(
			{
				files: MCP_MIGRATION_INPUT_SCHEMA.properties?.files ?? {},
				from: MCP_MIGRATION_INPUT_SCHEMA.properties?.from ?? {},
				to: MCP_MIGRATION_INPUT_SCHEMA.properties?.to ?? {},
				mode: MCP_MIGRATION_INPUT_SCHEMA.properties?.mode ?? {},
				confirm: { type: "boolean", description: "Must be true to write the migration." },
			},
			["files", "from", "to", "confirm"],
		),
	},
	{
		name: MCP_TOOL.ValidateMigration,
		description:
			"Run read-only migration validation, including adapter contracts and any explicitly configured project checks.",
		inputSchema: inputSchema(
			{
				files: MCP_MIGRATION_INPUT_SCHEMA.properties?.files ?? {},
				from: MCP_MIGRATION_INPUT_SCHEMA.properties?.from ?? {},
				to: MCP_MIGRATION_INPUT_SCHEMA.properties?.to ?? {},
				mode: MCP_MIGRATION_INPUT_SCHEMA.properties?.mode ?? {},
				checks: {
					type: "array",
					items: { type: "string", enum: Object.values(MCP_VALIDATION_CHECK) },
					description:
						"Checks to run. Contract and canonical-css are built in; project checks require a host validation port.",
				},
			},
			["files", "from", "to"],
		),
	},
	{
		name: MCP_TOOL.CompareMigrations,
		description:
			"Preview several registered source-to-target routes for the same files and compare their emitted code, residuals, and validation outcomes.",
		inputSchema: inputSchema(
			{
				files: { type: "array", items: { type: "string" } },
				routes: {
					type: "array",
					items: {
						type: "object",
						properties: {
							from: { type: "string" },
							to: { type: "string" },
						},
						required: ["from", "to"],
						additionalProperties: false,
					},
				},
				mode: { type: "string", enum: Object.values(MCP_MIGRATION_MODE) },
			},
			["files", "routes"],
		),
	},
	{
		name: MCP_TOOL.InspectStyleProgram,
		description:
			"Inspect the semantic StyleProgram and lowering plans produced for source expressions, including tokens, conditions, compositions, and residuals.",
		inputSchema: MCP_MIGRATION_INPUT_SCHEMA,
	},
	{
		name: MCP_TOOL.AnalyzeProject,
		description:
			"Run Pandwind's existing fold and CSS analysis over project-relative source files and return its versioned JSON report.",
		inputSchema: inputSchema({
			patterns: {
				type: "array",
				items: { type: "string" },
				description: "Project-relative source globs.",
			},
			twPath: { type: "string", description: "Project-relative generated tw.ts path." },
			constantsPath: {
				type: "string",
				description: "Project-relative imported constants JSON path.",
			},
			css: { type: "boolean", description: "Include CSS budget data." },
			preset: {
				type: "string",
				description: "Official preset module used by token governance.",
			},
		}),
	},
	{
		name: MCP_TOOL.BenchmarkProject,
		description:
			"Measure bounded source scanning and migration throughput with an explicit warm or cold in-process profile; host ports may provide project-build measurements.",
		inputSchema: inputSchema(
			{
				files: { type: "array", items: { type: "string" } },
				from: { type: "string" },
				to: { type: "string" },
				mode: { type: "string", enum: Object.values(MCP_MIGRATION_MODE) },
				iterations: { type: "integer", minimum: 1, maximum: 10 },
				benchmarkMode: {
					type: "string",
					enum: Object.values(MCP_BENCHMARK_MEASUREMENT_MODE),
					description:
						"Use warm process state or recreate the project workspace for each iteration.",
				},
			},
			["files", "from", "to"],
		),
	},
];

export const MCP_RESOURCES: readonly McpResourceDefinition[] = [
	{
		uri: MCP_RESOURCE.AdapterCatalog,
		name: "Pandwind adapter catalog",
		description: "Registered source and target adapters, capabilities, and official APIs.",
		mimeType: "application/json",
	},
	{
		uri: MCP_RESOURCE.OfficialApiMatrix,
		name: "Official adapter API matrix",
		description: "The registered adapter capability and official API matrix.",
		mimeType: "application/json",
	},
	{
		uri: MCP_RESOURCE.MigrationRouteCatalog,
		name: "Migration route proof catalog",
		description:
			"Route maturity, proof lanes, required dimensions, and unavailable reference evidence.",
		mimeType: "application/json",
	},
	{
		uri: MCP_RESOURCE.ProjectEvidence,
		name: "Project evidence",
		description: "Detected styling ecosystems, source extensions, and configuration evidence.",
		mimeType: "application/json",
	},
	{
		uri: MCP_RESOURCE.ProjectConfiguration,
		name: "Project configuration",
		description: "Project package metadata and known configuration or generated artifact paths.",
		mimeType: "application/json",
	},
	{
		uri: MCP_RESOURCE.LatestMigration,
		name: "Latest migration report",
		description: "The latest preview or apply result produced in this MCP session.",
		mimeType: "application/json",
	},
	{
		uri: MCP_RESOURCE.ResidualExplanations,
		name: "Migration residual explanations",
		description: "Residual kinds, source locations, and adapter hints from the latest migration.",
		mimeType: "application/json",
	},
	{
		uri: MCP_RESOURCE.InteropArtifact,
		name: "Pandwind interop artifact",
		description: "The project-generated pandwind.interop.json artifact when present.",
		mimeType: "application/json",
	},
	{
		uri: MCP_RESOURCE.LatestStylePrograms,
		name: "Latest StyleProgram snapshots",
		description: "StyleProgram and lowering-plan snapshots from the latest inspected migration.",
		mimeType: "application/json",
	},
	{
		uri: MCP_RESOURCE.LatestComparison,
		name: "Latest migration comparison",
		description: "The latest multi-route migration comparison produced in this MCP session.",
		mimeType: "application/json",
	},
];

function asRecord(value: unknown, tool: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw new McpToolError(`${tool} arguments must be an object`);
	return value as Record<string, unknown>;
}

function stringValue(value: unknown, name: string): string {
	if (typeof value !== "string" || value.length === 0)
		throw new McpToolError(`${name} must be a non-empty string`);
	return value;
}

function stringArray(value: unknown, name: string): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0))
		throw new McpToolError(`${name} must be an array of non-empty strings`);
	return value;
}

function validationChecks(value: unknown): readonly McpValidationCheck[] {
	if (value === undefined) return DEFAULT_VALIDATION_CHECKS;
	if (!Array.isArray(value) || value.length === 0)
		throw new McpToolError("checks must be a non-empty array");
	const allowed = new Set(Object.values(MCP_VALIDATION_CHECK));
	const checks = value.map((check) => {
		if (typeof check !== "string" || !allowed.has(check as McpValidationCheck))
			throw new McpToolError(`unknown validation check: ${String(check)}`);
		return check as McpValidationCheck;
	});
	return [...new Set(checks)];
}

function benchmarkMeasurementMode(value: unknown): McpBenchmarkMeasurementMode {
	if (value === undefined) return MCP_BENCHMARK_MEASUREMENT_MODE.Warm;
	if (
		value === MCP_BENCHMARK_MEASUREMENT_MODE.Warm ||
		value === MCP_BENCHMARK_MEASUREMENT_MODE.Cold
	)
		return value;
	throw new McpToolError(
		`benchmarkMode must be one of ${Object.values(MCP_BENCHMARK_MEASUREMENT_MODE).join(", ")}`,
	);
}

function projectPath(root: string, candidate: string): string {
	const normalized = candidate.replaceAll("\\", "/");
	if (
		normalized.startsWith("/") ||
		/^[A-Za-z]:\//u.test(normalized) ||
		normalized.split("/").includes("..")
	)
		throw new McpToolError(`path must be project-relative: ${candidate}`);
	const absolute = resolve(root, normalized);
	const outside = relative(root, absolute);
	if (outside === ".." || outside.startsWith(`..${sep}`))
		throw new McpToolError(`path escapes project root: ${candidate}`);
	return absolute;
}

function relativeProjectPath(root: string, file: string): string {
	return relative(root, file).split(sep).join("/");
}

function readPackageJson(root: string): Readonly<Record<string, unknown>> | undefined {
	try {
		const value: unknown = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
		return typeof value === "object" && value !== null
			? (value as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}

function readProjectFile(root: string, candidate: string): string | undefined {
	try {
		const absolute = isAbsolute(candidate)
			? projectPath(root, relativeProjectPath(root, candidate))
			: projectPath(root, candidate);
		return readFileSync(absolute, "utf8");
	} catch {
		return undefined;
	}
}

function projectFiles(context: McpProjectContext): string[] {
	return [...context.workspace.files(["**/*"], context.root, { includeUnsupported: true })];
}

function projectPattern(candidate: string): string {
	const normalized = candidate.replaceAll("\\", "/");
	if (
		normalized.startsWith("/") ||
		/^[A-Za-z]:\//u.test(normalized) ||
		normalized.split("/").includes("..")
	)
		throw new McpToolError(`path must be project-relative: ${candidate}`);
	return candidate;
}

async function inspectProject(
	context: McpProjectContext,
	arguments_: unknown,
	ports: McpToolPorts,
): Promise<McpToolResult> {
	const input = asRecord(arguments_, MCP_TOOL.InspectProject);
	const includeFiles = input.includeFiles === true;
	const files = projectFiles(context);
	const packageJson = readPackageJson(context.root);
	const catalog = ports.createCatalog();
	const detections = new Map<
		string,
		{ confidence: number; files: number; evidence: Set<string> }
	>();
	for (const file of files) {
		const source = readFileSync(file, "utf8");
		const fileName = relativeProjectPath(context.root, file);
		for (const adapter of catalog.adapters) {
			const detection = adapter.detect({
				file: fileName,
				source,
				root: context.root,
				packageJson,
				readFile: (candidate) => readProjectFile(context.root, candidate),
			});
			if (!detection.matched) continue;
			const current = detections.get(adapter.id) ?? {
				confidence: 0,
				files: 0,
				evidence: new Set<string>(),
			};
			current.confidence = Math.max(current.confidence, detection.confidence);
			current.files += 1;
			for (const evidence of detection.evidence) current.evidence.add(evidence);
			detections.set(adapter.id, current);
		}
	}
	const detectedIds = new Set(detections.keys());
	const configuration = await Promise.all(
		catalog.adapters
			.filter((adapter) => detectedIds.has(adapter.id))
			.map(async (adapter) => {
				const configContext = {
					file: "package.json",
					source: "",
					root: context.root,
					packageJson,
					readFile: (candidate: string) => readProjectFile(context.root, candidate),
					listFiles: (_root: string) => files,
				};
				try {
					const config =
						adapter.loadConfigAsync === undefined
							? adapter.loadConfig(configContext)
							: await adapter.loadConfigAsync(configContext);
					return {
						adapter: adapter.id,
						status: "resolved" as const,
						files: config.files,
						configuration: config.configuration ?? [],
						plugins: config.plugins,
						artifacts: config.artifacts ?? [],
						residuals: config.residuals ?? [],
						tokenGroups: Object.keys(config.tokenCatalog?.groups ?? {}).toSorted(),
					};
				} catch (error) {
					return {
						adapter: adapter.id,
						status: "failed" as const,
						error: error instanceof Error ? error.message : String(error),
					};
				}
			}),
	);
	const configFiles = files
		.map((file) => relativeProjectPath(context.root, file))
		.filter((file) => /(?:config|tailwind|uno|panda|theme|interop|package\.json)/iu.test(file))
		.toSorted();
	const generatedArtifacts = files
		.map((file) => relativeProjectPath(context.root, file))
		.filter((file) =>
			/(?:pandwind\.interop\.json|generated|styled-system|\.next\/static|dist\/|build\/)/iu.test(
				file,
			),
		)
		.toSorted();
	const packageEvidence = [
		"dependencies",
		"devDependencies",
		"peerDependencies",
		"optionalDependencies",
	].flatMap((section) => {
		const values = packageJson?.[section];
		if (typeof values !== "object" || values === null || Array.isArray(values)) return [];
		return Object.keys(values as Record<string, unknown>)
			.toSorted()
			.map((name) => ({ section, name }));
	});
	const sourceExtensions = new Map<string, number>();
	for (const file of files) {
		const extension = extname(file) || "<no extension>";
		sourceExtensions.set(extension, (sourceExtensions.get(extension) ?? 0) + 1);
	}
	return textToolResult({
		schema: MCP_PROJECT_SCHEMA,
		root: context.root,
		executionEvidence: [
			inProcessEvidence(
				["adapter-detection", "configuration-resolution"],
				"Detection and configuration were evaluated in the MCP process; no host project was built or rendered.",
			),
		],
		files: {
			count: files.length,
			sourceExtensions: Object.fromEntries(
				[...sourceExtensions.entries()].toSorted(([a], [b]) => a.localeCompare(b)),
			),
			...(includeFiles
				? {
						paths: files
							.map((file) => relativeProjectPath(context.root, file))
							.toSorted()
							.slice(0, MCP_FILE_LIST_LIMIT),
						truncated: files.length > MCP_FILE_LIST_LIMIT,
					}
				: {}),
		},
		adapters: [...detections.entries()]
			.map(([id, detection]) => ({
				id,
				confidence: detection.confidence,
				files: detection.files,
				evidence: [...detection.evidence].toSorted(),
			}))
			.toSorted((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id)),
		configurationEvidence: {
			packageJson: packageJson === undefined ? "missing" : "present",
			files: configFiles,
			packages: packageEvidence,
			adapters: configuration,
			generatedArtifacts,
		},
		registeredAdapters: catalog.adapters
			.map((adapter) => ({
				id: adapter.id,
				version: adapter.version,
				sourceModules: adapter.sourceModules,
				capabilities: adapter.capabilities.capabilities,
				officialApi: adapter.officialApi,
			}))
			.toSorted((a, b) => a.id.localeCompare(b.id)),
	});
}

function migrationMode(value: unknown): AdapterCapabilityMode {
	if (value === undefined) return MCP_MIGRATION_MODE.Safe;
	if (value === MCP_MIGRATION_MODE.Safe || value === MCP_MIGRATION_MODE.Partial) return value;
	throw new McpToolError(`mode must be one of ${Object.values(MCP_MIGRATION_MODE).join(", ")}`);
}

function serializeMigration(
	root: string,
	file: string,
	result: AdapterMigrationResult,
	before: string,
) {
	return {
		file,
		changed: result.changed,
		code: result.code,
		diff: unifiedDiff(before, result.code, file),
		outputFile:
			result.outputExtension === undefined
				? file
				: `${file.replace(/\.[^.]+$/u, "")}${result.outputExtension}`,
		converted: result.converted,
		skipped: result.skipped,
		residuals: result.residuals,
		loweringPlans: result.loweringPlans,
		outcomes: result.outcomes,
		reports: result.reports,
		validations: result.validations,
		dependencies: result.dependencies,
		generatedFiles: result.generatedFiles,
		fileChanges: result.fileChanges,
	};
}

async function migrationPreview(
	context: McpProjectContext,
	arguments_: unknown,
	ports: McpToolPorts,
): Promise<{
	readonly root: string;
	readonly from: string;
	readonly to: string;
	readonly mode: AdapterCapabilityMode;
	readonly routeProof: ReturnType<typeof findMigrationRouteProof>;
	readonly executionEvidence: readonly McpExecutionEvidence[];
	readonly files: readonly ReturnType<typeof serializeMigration>[];
}> {
	const input = asRecord(arguments_, MCP_TOOL.PreviewMigration);
	const files = stringArray(input.files, "files");
	const from = stringValue(input.from, "from");
	const to = stringValue(input.to, "to");
	const mode = migrationMode(input.mode);
	const catalog = ports.createCatalog();
	const expanded = new Set<string>();
	for (const pattern of files) {
		projectPattern(pattern);
		for (const file of context.workspace.files([pattern], context.root, {
			includeUnsupported: true,
		}))
			expanded.add(file);
	}
	if (expanded.size === 0) throw new McpToolError("files did not match any project files");
	const allFiles = projectFiles(context);
	const packageJson = readPackageJson(context.root);
	const results = [];
	for (const absolute of [...expanded].toSorted()) {
		const file = relativeProjectPath(context.root, absolute);
		const before = readFileSync(absolute, "utf8");
		const result = await ports.migration.runAsync(before, {
			from,
			to,
			file,
			root: context.root,
			packageJson,
			readFile: (candidate) => readProjectFile(context.root, candidate),
			listFiles: () => allFiles,
			mode,
		});
		results.push(serializeMigration(context.root, file, result, before));
	}
	return {
		root: context.root,
		from,
		to,
		mode,
		routeProof: findMigrationRouteProof(from, to, catalog.systems),
		executionEvidence: [
			inProcessEvidence(
				["adapter-program", "residual-report"],
				"The migration was previewed in process against project-relative files; no project files were written.",
			),
		],
		files: results,
	};
}

async function previewMigration(
	context: McpProjectContext,
	arguments_: unknown,
	ports: McpToolPorts,
): Promise<McpToolResult> {
	const preview = await migrationPreview(context, arguments_, ports);
	return textToolResult({ schema: "pandwind.mcp.preview-migration/1", ...preview });
}

interface PlannedMigrationWrite {
	readonly path: string;
	readonly content: string;
	readonly expectedContent?: string;
}

function planMigrationWrite(
	context: McpProjectContext,
	planned: Map<string, PlannedMigrationWrite>,
	path: string,
	content: string,
	expectedContent: string | undefined,
	kind: string,
): void {
	const normalizedPath = path.replaceAll("\\", "/");
	const absolutePath = projectPath(context.root, normalizedPath);
	const existing = planned.get(normalizedPath);
	if (existing !== undefined && existing.content !== content)
		throw new McpToolError(`conflicting ${kind} content for ${normalizedPath}`);
	if (existing !== undefined) return;
	if (existsSync(absolutePath)) {
		const current = readFileSync(absolutePath, "utf8");
		if (current !== content && (expectedContent === undefined || current !== expectedContent))
			throw new McpToolError(`refusing to overwrite conflicting ${kind} ${normalizedPath}`);
		if (expectedContent !== undefined && current !== expectedContent && current !== content)
			throw new McpToolError(`refusing stale ${kind} ${normalizedPath}`);
	} else if (expectedContent !== undefined) {
		throw new McpToolError(`refusing missing ${kind} ${normalizedPath}`);
	}
	planned.set(normalizedPath, {
		path: normalizedPath,
		content,
		...(expectedContent === undefined ? {} : { expectedContent }),
	});
}

async function applyMigration(
	context: McpProjectContext,
	arguments_: unknown,
	ports: McpToolPorts,
): Promise<McpToolResult> {
	const input = asRecord(arguments_, MCP_TOOL.ApplyMigration);
	if (input.confirm !== true)
		throw new McpToolError("apply_migration requires confirm: true to write project files");
	const preview = await migrationPreview(context, arguments_, ports);
	const planned = new Map<string, PlannedMigrationWrite>();
	const removed = new Set<string>();
	for (const file of preview.files) {
		const sourcePath = projectPath(context.root, file.file);
		const before = readFileSync(sourcePath, "utf8");
		if (file.outputFile === file.file) {
			if (file.code !== before)
				planMigrationWrite(context, planned, file.file, file.code, before, "source file");
		} else {
			if (file.code !== before) {
				if (existsSync(projectPath(context.root, file.outputFile)))
					throw new McpToolError(`refusing to overwrite host-conversion output ${file.outputFile}`);
				planMigrationWrite(context, planned, file.outputFile, file.code, undefined, "output file");
				removed.add(file.file);
			}
		}
		for (const generated of file.generatedFiles)
			planMigrationWrite(
				context,
				planned,
				generated.path,
				generated.content,
				undefined,
				"generated file",
			);
		for (const change of file.fileChanges)
			planMigrationWrite(
				context,
				planned,
				change.path,
				change.content,
				change.expectedContent,
				"shared file change",
			);
	}
	for (const write of planned.values()) {
		const absolutePath = projectPath(context.root, write.path);
		if (existsSync(absolutePath) && readFileSync(absolutePath, "utf8") === write.content) continue;
		mkdirSync(resolve(absolutePath, ".."), { recursive: true });
		writeFileSync(absolutePath, write.content, { flag: existsSync(absolutePath) ? "w" : "wx" });
	}
	for (const path of removed) {
		const absolutePath = projectPath(context.root, path);
		if (existsSync(absolutePath)) unlinkSync(absolutePath);
	}
	return textToolResult({
		schema: "pandwind.mcp.apply-migration/1",
		...preview,
		executionEvidence: [
			...preview.executionEvidence,
			inProcessEvidence(
				["conflict-safe-write", "generated-file-write"],
				"The explicitly confirmed migration was written by the MCP process after conflict checks.",
			),
		],
		applied: true,
		writtenFiles: [...planned.keys()].filter((path) => !removed.has(path)),
		removedFiles: [...removed],
		dependencies: [
			...new Map(
				preview.files
					.flatMap((file) => file.dependencies)
					.flatMap((dependency) => dependency.packages)
					.map((dependency) => [`${dependency.name}:${dependency.range ?? ""}`, dependency]),
			).values(),
		],
	});
}

function routeInput(value: unknown): { from: string; to: string } {
	const route = asRecord(value, MCP_TOOL.CompareMigrations);
	return {
		from: stringValue(route.from, "route.from"),
		to: stringValue(route.to, "route.to"),
	};
}

async function compareMigrations(
	context: McpProjectContext,
	arguments_: unknown,
	ports: McpToolPorts,
): Promise<McpToolResult> {
	const input = asRecord(arguments_, MCP_TOOL.CompareMigrations);
	const files = stringArray(input.files, "files");
	if (!Array.isArray(input.routes) || input.routes.length === 0 || input.routes.length > 8)
		throw new McpToolError("routes must contain between 1 and 8 source-to-target routes");
	const mode = migrationMode(input.mode);
	const routes = [];
	for (const rawRoute of input.routes) {
		const route = routeInput(rawRoute);
		const preview = await migrationPreview(context, { files, ...route, mode }, ports);
		routes.push({
			...route,
			mode,
			routeProof: preview.routeProof,
			files: preview.files,
			stats: {
				changed: preview.files.filter((file) => file.changed).length,
				converted: preview.files.reduce((sum, file) => sum + file.converted, 0),
				skipped: preview.files.reduce((sum, file) => sum + file.skipped, 0),
				residuals: preview.files.reduce((sum, file) => sum + file.residuals.length, 0),
			},
		});
	}
	return textToolResult({
		schema: "pandwind.mcp.compare-migrations/1",
		root: context.root,
		executionEvidence: [
			inProcessEvidence(
				["adapter-program", "route-comparison", "residual-report"],
				"All compared routes were evaluated in process; no host project validation was run.",
			),
		],
		routes,
	});
}

async function inspectStyleProgram(
	context: McpProjectContext,
	arguments_: unknown,
	ports: McpToolPorts,
): Promise<McpToolResult> {
	const input = asRecord(arguments_, MCP_TOOL.InspectStyleProgram);
	const preview = await migrationPreview(context, input, ports);
	return textToolResult({
		schema: "pandwind.mcp.style-program/1",
		root: preview.root,
		from: preview.from,
		to: preview.to,
		mode: preview.mode,
		routeProof: preview.routeProof,
		executionEvidence: preview.executionEvidence,
		files: preview.files.map((file) => ({
			file: file.file,
			loweringPlans: file.loweringPlans,
			outcomes: file.outcomes,
			residuals: file.residuals,
			reports: file.reports,
			validations: file.validations,
		})),
	});
}

function benchmarkArtifacts(context: McpProjectContext): {
	readonly javascriptBytes: number;
	readonly cssBytes: number;
	readonly files: readonly string[];
} {
	const files = projectFiles(context).filter((file) => {
		const relativePath = relativeProjectPath(context.root, file);
		return /^(?:dist|build|out|\.next|storybook-static)(?:\/|$)/u.test(relativePath);
	});
	let javascriptBytes = 0;
	let cssBytes = 0;
	for (const file of files) {
		const bytes = statSync(file).size;
		if (/\.(?:js|mjs|cjs|ts|tsx)$/u.test(file)) javascriptBytes += bytes;
		if (file.endsWith(".css")) cssBytes += bytes;
	}
	return {
		javascriptBytes,
		cssBytes,
		files: files.map((file) => relativeProjectPath(context.root, file)).toSorted(),
	};
}

async function benchmarkProject(
	context: McpProjectContext,
	arguments_: unknown,
	ports: McpToolPorts,
): Promise<McpToolResult> {
	const input = asRecord(arguments_, MCP_TOOL.BenchmarkProject);
	const files = stringArray(input.files, "files");
	const from = stringValue(input.from, "from");
	const to = stringValue(input.to, "to");
	const mode = migrationMode(input.mode);
	const measurementMode = benchmarkMeasurementMode(input.benchmarkMode);
	const catalog = ports.createCatalog();
	const iterations = input.iterations === undefined ? 3 : input.iterations;
	if (
		typeof iterations !== "number" ||
		!Number.isInteger(iterations) ||
		iterations < 1 ||
		iterations > 10
	)
		throw new McpToolError("iterations must be an integer between 1 and 10");
	const scanStart = performance.now();
	const expanded = new Set<string>();
	for (const pattern of files) {
		projectPattern(pattern);
		for (const file of context.workspace.files([pattern], context.root, {
			includeUnsupported: true,
		}))
			expanded.add(file);
	}
	const scanMilliseconds = performance.now() - scanStart;
	if (expanded.size === 0) throw new McpToolError("files did not match any project files");
	if (ports.benchmark !== undefined) {
		const benchmark = await ports.benchmark.run({
			root: context.root,
			from,
			to,
			mode,
			files,
			iterations,
			measurementMode,
		});
		return textToolResult({
			schema: "pandwind.mcp.benchmark/2",
			root: context.root,
			from,
			to,
			mode,
			iterations,
			measurementMode,
			inputs: {
				root: context.root,
				from,
				to,
				mode,
				files,
				iterations,
				fileCount: expanded.size,
				sourceBytes: [...expanded].reduce((sum, file) => sum + statSync(file).size, 0),
			},
			routeProof: findMigrationRouteProof(from, to, catalog.systems),
			benchmark,
			executionEvidence: [
				executionEvidence(
					benchmark.executionLane === MCP_EXECUTION_LANE.HostProject
						? MCP_EVIDENCE_LANE.HostVerified
						: MCP_EVIDENCE_LANE.InProcess,
					MCP_EVIDENCE_STATUS.Verified,
					["host-benchmark"],
					"Benchmark measurements were supplied by the explicit benchmark port.",
				),
			],
			commandsExecuted: benchmark.commandsExecuted ?? [],
		});
	}
	const sourceBytes = [...expanded].reduce((sum, file) => sum + statSync(file).size, 0);
	const rssBefore = process.memoryUsage().rss;
	const migrationStart = performance.now();
	let lastPreview: Awaited<ReturnType<typeof migrationPreview>> | undefined;
	for (let iteration = 0; iteration < iterations; iteration++) {
		const iterationContext =
			measurementMode === MCP_BENCHMARK_MEASUREMENT_MODE.Cold
				? createMcpProjectContext(context.root)
				: context;
		lastPreview = await migrationPreview(iterationContext, { files, from, to, mode }, ports);
	}
	const migrationMilliseconds = performance.now() - migrationStart;
	const rssAfter = process.memoryUsage().rss;
	const filesPerSecond =
		(expanded.size * iterations * 1000) / Math.max(migrationMilliseconds, 0.001);
	return textToolResult({
		schema: "pandwind.mcp.benchmark/2",
		root: context.root,
		from,
		to,
		mode,
		iterations,
		measurementMode,
		inputs: {
			root: context.root,
			from,
			to,
			mode,
			files,
			iterations,
			fileCount: expanded.size,
			sourceBytes,
		},
		routeProof: lastPreview?.routeProof,
		executionEvidence: [
			inProcessEvidence(
				["source-scan", "adapter-program", "throughput-measurement"],
				"The benchmark measured in-process scanning and migration only; no host project pipeline was run.",
			),
		],
		executionLane: MCP_EXECUTION_LANE.InProcess,
		scope: MCP_BENCHMARK_SCOPE.InProcessMigration,
		profile: `${measurementMode}-in-process`,
		limitations: [
			"does not run the project's typecheck, build, browser, SSR, or bundle pipeline",
			"timings include the current process and workspace scanner state",
		],
		scan: {
			files: expanded.size,
			milliseconds: Math.round(scanMilliseconds * 100) / 100,
			sourceBytes,
		},
		migration: {
			milliseconds: Math.round(migrationMilliseconds * 100) / 100,
			averageMilliseconds: Math.round((migrationMilliseconds / iterations) * 100) / 100,
			filesPerSecond: Math.round(filesPerSecond * 100) / 100,
			changed: lastPreview?.files.filter((file) => file.changed).length ?? 0,
			residuals: lastPreview?.files.reduce((sum, file) => sum + file.residuals.length, 0) ?? 0,
		},
		memory: {
			beforeRssBytes: rssBefore,
			afterRssBytes: rssAfter,
			deltaRssBytes: rssAfter - rssBefore,
		},
		artifacts: benchmarkArtifacts(context),
		commandsExecuted: [],
	});
}

async function validateMigration(
	context: McpProjectContext,
	arguments_: unknown,
	ports: McpToolPorts,
): Promise<McpToolResult> {
	const input = asRecord(arguments_, MCP_TOOL.ValidateMigration);
	const preview = await migrationPreview(context, arguments_, ports);
	const files = preview.files.map((file) => {
		const generatedConflicts = file.generatedFiles.filter((generated) => {
			const path = projectPath(context.root, generated.path);
			return existsSync(path) && readFileSync(path, "utf8") !== generated.content;
		});
		const adapterValidations = file.validations.every((validation) => validation.valid);
		const residualFree = file.residuals.length === 0;
		return {
			file: file.file,
			valid: adapterValidations && residualFree && generatedConflicts.length === 0,
			checks: {
				adapterValidations,
				residualFree,
				generatedFilesConflictFree: generatedConflicts.length === 0,
			},
			residuals: file.residuals,
			validations: file.validations,
			generatedConflicts: generatedConflicts.map((generated) => generated.path),
		};
	});
	const requestedChecks = validationChecks(input.checks);
	const staticChecks = [
		{
			check: MCP_VALIDATION_CHECK.Contract,
			status: files.every(
				(file) =>
					file.checks.adapterValidations &&
					file.checks.residualFree &&
					file.checks.generatedFilesConflictFree,
			)
				? MCP_VALIDATION_STATUS.Passed
				: MCP_VALIDATION_STATUS.Failed,
			executionLane: MCP_EXECUTION_LANE.InProcess,
			detail: "adapter validations, residuals, and target semantics",
			provenance: {
				source: MCP_PROVENANCE_SOURCE.Adapter,
				evidence: ["adapter validations", "generated-file conflict check"],
			},
		},
		{
			check: MCP_VALIDATION_CHECK.CanonicalCss,
			status: preview.files.every((file) =>
				file.validations.every(
					(validation) => validation.canonicalSource === validation.canonicalTarget,
				),
			)
				? MCP_VALIDATION_STATUS.Passed
				: MCP_VALIDATION_STATUS.Failed,
			executionLane: MCP_EXECUTION_LANE.InProcess,
			detail: "adapter-provided canonical CSS pairs",
			provenance: {
				source: MCP_PROVENANCE_SOURCE.Adapter,
				evidence: ["adapter canonical CSS comparison"],
			},
		},
	];
	const externalChecks = requestedChecks.filter((check) =>
		(EXTERNAL_VALIDATION_CHECKS as readonly string[]).includes(check),
	);
	let projectChecks: readonly McpValidationResult[] = [];
	if (externalChecks.length > 0) {
		if (ports.validation === undefined) {
			projectChecks = externalChecks.map((check) => ({
				check,
				status: MCP_VALIDATION_STATUS.Unavailable,
				executionLane: MCP_EXECUTION_LANE.HostProject,
				detail:
					"no host validation port is configured; supply an auditable project validator to run this check",
				requiredHostCapability: check,
				provenance: { source: MCP_PROVENANCE_SOURCE.Host },
			}));
		} else {
			try {
				const suppliedChecks = await ports.validation.run({
					root: context.root,
					from: preview.from,
					to: preview.to,
					mode: preview.mode,
					files: preview.files.map((file) => ({
						file: file.file,
						code: file.code,
						outputFile: file.outputFile,
					})),
					checks: externalChecks,
				});
				const byCheck = new Map(suppliedChecks.map((check) => [check.check, check]));
				projectChecks = externalChecks.map(
					(check) =>
						byCheck.get(check) ?? {
							check,
							status: MCP_VALIDATION_STATUS.Unavailable,
							executionLane: MCP_EXECUTION_LANE.HostProject,
							detail: "host validation port did not return a result for this check",
							requiredHostCapability: check,
							provenance: { source: MCP_PROVENANCE_SOURCE.Host },
						},
				);
			} catch (error) {
				projectChecks = externalChecks.map((check) => ({
					check,
					status: MCP_VALIDATION_STATUS.Failed,
					executionLane: MCP_EXECUTION_LANE.HostProject,
					detail: error instanceof Error ? error.message : String(error),
					provenance: { source: MCP_PROVENANCE_SOURCE.Host },
				}));
			}
		}
	}
	const checks = [...staticChecks, ...projectChecks];
	return textToolResult({
		schema: "pandwind.mcp.validate-migration/2",
		...preview,
		valid:
			files.every((file) => file.valid) &&
			checks.every((check) => check.status === MCP_VALIDATION_STATUS.Passed),
		requestedChecks,
		checks,
		executionEvidence: [
			...preview.executionEvidence,
			...checks.map((check) => validationEvidence(check)),
		],
		commandsExecuted: projectChecks.flatMap((check) => check.commandsExecuted ?? []),
		files,
	});
}

async function analyzeProject(
	context: McpProjectContext,
	arguments_: unknown,
	ports: McpToolPorts,
): Promise<McpToolResult> {
	const input = asRecord(arguments_, MCP_TOOL.AnalyzeProject);
	const patterns =
		input.patterns === undefined ? ["src/**/*.{ts,tsx}"] : stringArray(input.patterns, "patterns");
	for (const pattern of patterns) projectPattern(pattern);
	const twPath = input.twPath === undefined ? "src/tw.ts" : stringValue(input.twPath, "twPath");
	const argv = [
		...patterns,
		"--tw",
		projectPath(context.root, twPath),
		"--root",
		context.root,
		"--json",
	];
	if (input.constantsPath !== undefined)
		argv.push(
			"--constants",
			projectPath(context.root, stringValue(input.constantsPath, "constantsPath")),
		);
	if (input.css === true) argv.push("--css");
	const foldReport = JSON.parse(await ports.analyze(argv)) as Record<string, unknown>;
	const preset =
		input.preset === undefined ? DEFAULT_ANALYZE_PRESET : stringValue(input.preset, "preset");
	const governanceReport = JSON.parse(
		await ports.analyze([
			...patterns,
			"--root",
			context.root,
			"--governance",
			"--preset",
			preset,
			"--json",
		]),
	) as Record<string, unknown>;
	const evidence = structuredContent(await inspectProject(context, { includeFiles: false }, ports));
	return textToolResult({
		schema: "pandwind.mcp.analyze-project/1",
		root: context.root,
		executionEvidence: [
			inProcessEvidence(
				["fold-analysis", "token-governance", "adapter-detection"],
				"Analysis and token governance ran through the injected analyzer in process; no host build was run.",
			),
		],
		analysis: foldReport,
		governance: governanceReport,
		adapterCoverage: {
			detected: evidence.adapters ?? [],
			registered: evidence.registeredAdapters ?? [],
		},
		configurationEvidence: evidence.configurationEvidence ?? {},
	});
}

function structuredContent(result: McpToolResult): Record<string, unknown> {
	if (typeof result.structuredContent !== "object" || result.structuredContent === null) return {};
	return result.structuredContent as Record<string, unknown>;
}

export function createMcpToolService(
	context: McpProjectContext,
	ports: McpToolPorts = DEFAULT_TOOL_PORTS,
): McpToolService {
	const latest: {
		migration?: unknown;
		stylePrograms?: unknown;
		comparison?: unknown;
	} = {};
	const preview = async (arguments_: unknown): Promise<McpToolResult> => {
		const result = await previewMigration(context, arguments_, ports);
		latest.migration = result.structuredContent;
		return result;
	};
	const apply = async (arguments_: unknown): Promise<McpToolResult> => {
		const result = await applyMigration(context, arguments_, ports);
		latest.migration = result.structuredContent;
		return result;
	};
	const inspect = async (arguments_: unknown): Promise<McpToolResult> =>
		inspectProject(context, arguments_, ports);
	const compare = async (arguments_: unknown): Promise<McpToolResult> => {
		const result = await compareMigrations(context, arguments_, ports);
		latest.comparison = result.structuredContent;
		return result;
	};
	const inspectPrograms = async (arguments_: unknown): Promise<McpToolResult> => {
		const result = await inspectStyleProgram(context, arguments_, ports);
		latest.stylePrograms = result.structuredContent;
		return result;
	};
	const calls = new Map<string, (arguments_: unknown) => Promise<McpToolResult> | McpToolResult>([
		[MCP_TOOL.InspectProject, inspect],
		[MCP_TOOL.PreviewMigration, preview],
		[MCP_TOOL.ApplyMigration, apply],
		[MCP_TOOL.ValidateMigration, (arguments_) => validateMigration(context, arguments_, ports)],
		[MCP_TOOL.CompareMigrations, compare],
		[MCP_TOOL.InspectStyleProgram, inspectPrograms],
		[MCP_TOOL.AnalyzeProject, (arguments_) => analyzeProject(context, arguments_, ports)],
		[MCP_TOOL.BenchmarkProject, (arguments_) => benchmarkProject(context, arguments_, ports)],
	]);
	const resourceJson = (value: unknown): string => JSON.stringify(value, null, 2);
	const readResource = async (uri: string): Promise<string> => {
		switch (uri) {
			case MCP_RESOURCE.AdapterCatalog:
			case MCP_RESOURCE.OfficialApiMatrix: {
				const catalog = ports.createCatalog();
				const adapters = catalog.adapters
					.map((adapter) => ({
						id: adapter.id,
						version: adapter.version,
						sourceModules: adapter.sourceModules,
						capabilities: adapter.capabilities.capabilities,
						officialApi: adapter.officialApi,
					}))
					.toSorted((a, b) => a.id.localeCompare(b.id));
				return resourceJson({
					schema:
						uri === MCP_RESOURCE.AdapterCatalog
							? "pandwind.mcp.catalog/1"
							: "pandwind.mcp.api-matrix/1",
					adapters,
				});
			}
			case MCP_RESOURCE.MigrationRouteCatalog: {
				const catalog = ports.createCatalog();
				return resourceJson(migrationRouteProofCatalog(catalog.systems));
			}
			case MCP_RESOURCE.ProjectEvidence: {
				const result = await inspectProject(context, { includeFiles: false }, ports);
				return resourceJson(result.structuredContent);
			}
			case MCP_RESOURCE.ProjectConfiguration: {
				const files = projectFiles(context);
				return resourceJson({
					schema: "pandwind.mcp.project-configuration/1",
					root: context.root,
					packageJson: readPackageJson(context.root),
					files: files
						.map((file) => relativeProjectPath(context.root, file))
						.filter((file) =>
							/(?:config|tailwind|uno|panda|theme|interop|package\.json)/iu.test(file),
						)
						.toSorted(),
				});
			}
			case MCP_RESOURCE.LatestMigration:
				return resourceJson(
					latest.migration ?? { schema: "pandwind.mcp.migration/1", status: "no migration run" },
				);
			case MCP_RESOURCE.LatestComparison:
				return resourceJson(
					latest.comparison ?? {
						schema: "pandwind.mcp.compare-migrations/1",
						status: "no migration comparison run",
					},
				);
			case MCP_RESOURCE.ResidualExplanations: {
				const migration = latest.migration as
					| { files?: readonly { file: string; residuals: readonly unknown[] }[] }
					| undefined;
				return resourceJson({
					schema: "pandwind.mcp.residuals/1",
					files:
						migration?.files?.map((file) => ({ file: file.file, residuals: file.residuals })) ?? [],
				});
			}
			case MCP_RESOURCE.InteropArtifact: {
				const artifacts = projectFiles(context)
					.filter((file) => {
						const relativePath = relativeProjectPath(context.root, file);
						return (
							relativePath === "pandwind.interop.json" ||
							relativePath.endsWith("/pandwind.interop.json")
						);
					})
					.toSorted();
				if (artifacts.length === 1)
					return resourceJson({
						schema: "pandwind.mcp.interop/1",
						path: relativeProjectPath(context.root, artifacts[0]!),
						content: readFileSync(artifacts[0]!, "utf8"),
					});
				return resourceJson({
					schema: "pandwind.mcp.interop/1",
					status: artifacts.length === 0 ? "missing" : "multiple",
					files: artifacts.map((file) => ({
						path: relativeProjectPath(context.root, file),
						content: readFileSync(file, "utf8"),
					})),
				});
			}
			case MCP_RESOURCE.LatestStylePrograms:
				return resourceJson(
					latest.stylePrograms ?? {
						schema: "pandwind.mcp.style-program/1",
						status: "no style program inspection run",
					},
				);
			default:
				throw new McpToolError(`unknown resource: ${uri}`);
		}
	};
	return {
		tools: MCP_TOOLS,
		resources: MCP_RESOURCES,
		async call(name, arguments_) {
			const call = calls.get(name);
			if (call === undefined) throw new McpToolError(`unknown tool: ${name}`);
			return await call(arguments_);
		},
		readResource,
	};
}

export function createMcpProjectContext(root: string): McpProjectContext {
	const absoluteRoot = resolve(root);
	if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory())
		throw new McpToolError(`project root is not a directory: ${absoluteRoot}`);
	return { root: absoluteRoot, workspace: createSourceWorkspace() };
}
