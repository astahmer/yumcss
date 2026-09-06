import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { createSourceWorkspace } from "pandwind/source/workspace";
import {
	createBuiltinCodemodCatalog,
	runAdapterMigrationAsync,
	type AdapterCapabilityMode,
	type AdapterMigrationResult,
} from "pandwind-codemod/swap";
import { unifiedDiff } from "pandwind-codemod/diff";
import { runCli } from "../cli.ts";
import { McpToolError, textToolResult } from "./tool-contract.ts";
import type { McpToolDefinition, McpToolResult } from "./protocol.ts";

export const MCP_TOOL = {
	InspectProject: "inspect_project",
	PreviewMigration: "preview_migration",
	ValidateMigration: "validate_migration",
	AnalyzeProject: "analyze_project",
} as const;

const MCP_MIGRATION_MODE = {
	Safe: "safe",
	Partial: "partial",
} as const satisfies Record<string, AdapterCapabilityMode>;

const MCP_PROJECT_SCHEMA = "pandwind.mcp.project/1" as const;
const MCP_FILE_LIST_LIMIT = 500;

export interface McpProjectContext {
	readonly root: string;
	readonly workspace: ReturnType<typeof createSourceWorkspace>;
}

export interface McpToolService {
	readonly tools: readonly McpToolDefinition[];
	call(name: string, arguments_: unknown): Promise<McpToolResult>;
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
		name: MCP_TOOL.ValidateMigration,
		description:
			"Run a read-only migration contract check: target validations, residuals, and generated-file conflicts.",
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
		}),
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

function inspectProject(context: McpProjectContext, arguments_: unknown): McpToolResult {
	const input = asRecord(arguments_, MCP_TOOL.InspectProject);
	const includeFiles = input.includeFiles === true;
	const files = projectFiles(context);
	const packageJson = readPackageJson(context.root);
	const catalog = createBuiltinCodemodCatalog();
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
	const configFiles = files
		.map((file) => relativeProjectPath(context.root, file))
		.filter((file) => /(?:config|tailwind|uno|panda|theme|interop|package\.json)/iu.test(file))
		.toSorted();
	const sourceExtensions = new Map<string, number>();
	for (const file of files) {
		const extension = extname(file) || "<no extension>";
		sourceExtensions.set(extension, (sourceExtensions.get(extension) ?? 0) + 1);
	}
	return textToolResult({
		schema: MCP_PROJECT_SCHEMA,
		root: context.root,
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
): Promise<{
	readonly root: string;
	readonly from: string;
	readonly to: string;
	readonly mode: AdapterCapabilityMode;
	readonly files: readonly ReturnType<typeof serializeMigration>[];
}> {
	const input = asRecord(arguments_, MCP_TOOL.PreviewMigration);
	const files = stringArray(input.files, "files");
	const from = stringValue(input.from, "from");
	const to = stringValue(input.to, "to");
	const mode = migrationMode(input.mode);
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
		const result = await runAdapterMigrationAsync(before, {
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
	return { root: context.root, from, to, mode, files: results };
}

async function previewMigration(
	context: McpProjectContext,
	arguments_: unknown,
): Promise<McpToolResult> {
	const preview = await migrationPreview(context, arguments_);
	return textToolResult({ schema: "pandwind.mcp.preview-migration/1", ...preview });
}

async function validateMigration(
	context: McpProjectContext,
	arguments_: unknown,
): Promise<McpToolResult> {
	const preview = await migrationPreview(context, arguments_);
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
	return textToolResult({
		schema: "pandwind.mcp.validate-migration/1",
		...preview,
		valid: files.every((file) => file.valid),
		files,
	});
}

async function analyzeProject(
	context: McpProjectContext,
	arguments_: unknown,
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
	const report = await runCli(argv);
	return textToolResult(JSON.parse(report));
}

export function createMcpToolService(context: McpProjectContext): McpToolService {
	const calls = new Map<string, (arguments_: unknown) => Promise<McpToolResult> | McpToolResult>([
		[MCP_TOOL.InspectProject, (arguments_) => inspectProject(context, arguments_)],
		[MCP_TOOL.PreviewMigration, (arguments_) => previewMigration(context, arguments_)],
		[MCP_TOOL.ValidateMigration, (arguments_) => validateMigration(context, arguments_)],
		[MCP_TOOL.AnalyzeProject, (arguments_) => analyzeProject(context, arguments_)],
	]);
	return {
		tools: MCP_TOOLS,
		async call(name, arguments_) {
			const call = calls.get(name);
			if (call === undefined) throw new McpToolError(`unknown tool: ${name}`);
			return await call(arguments_);
		},
	};
}

export function createMcpProjectContext(root: string): McpProjectContext {
	const absoluteRoot = resolve(root);
	if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory())
		throw new McpToolError(`project root is not a directory: ${absoluteRoot}`);
	return { root: absoluteRoot, workspace: createSourceWorkspace() };
}
