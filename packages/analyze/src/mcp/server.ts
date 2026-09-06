import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import cac from "cac";
import { resolve } from "node:path";
import { z } from "zod";
import {
	MCP_MIGRATION_MODE,
	MCP_TOOL,
	MCP_VALIDATION_CHECK,
	type McpValidationCheck,
} from "./contract.ts";
import {
	createMcpProjectContext,
	createMcpToolService,
	type McpToolPorts,
	type McpToolService,
} from "./tools.ts";

export const MCP_COMMAND = "mcp" as const;

export const MCP_SERVER_INFO = {
	name: "pandwind-analyze",
	version: "0.1.0",
} as const;

const inspectProjectSchema = {
	includeFiles: z.boolean().optional(),
};

const migrationSchema = {
	files: z.array(z.string().min(1)),
	from: z.string().min(1),
	to: z.string().min(1),
	mode: z.enum(Object.values(MCP_MIGRATION_MODE) as [string, ...string[]]).optional(),
};

const analyzeProjectSchema = {
	patterns: z.array(z.string().min(1)).optional(),
	twPath: z.string().min(1).optional(),
	constantsPath: z.string().min(1).optional(),
	css: z.boolean().optional(),
	preset: z.string().min(1).optional(),
};

const applyMigrationSchema = {
	...migrationSchema,
	confirm: z.literal(true),
};

const validationSchema = {
	...migrationSchema,
	checks: z
		.array(
			z.enum(Object.values(MCP_VALIDATION_CHECK) as [McpValidationCheck, ...McpValidationCheck[]]),
		)
		.optional(),
};

const compareMigrationsSchema = {
	files: z.array(z.string().min(1)),
	routes: z.array(
		z.object({
			from: z.string().min(1),
			to: z.string().min(1),
		}),
	),
	mode: z.enum(Object.values(MCP_MIGRATION_MODE) as [string, ...string[]]).optional(),
};

const benchmarkProjectSchema = {
	files: z.array(z.string().min(1)),
	from: z.string().min(1),
	to: z.string().min(1),
	mode: z.enum(Object.values(MCP_MIGRATION_MODE) as [string, ...string[]]).optional(),
	iterations: z.number().int().min(1).max(10).optional(),
};

export interface McpServerOptions {
	readonly ports?: McpToolPorts;
	readonly service?: McpToolService;
}

export function createMcpServer(root: string, options: McpServerOptions = {}): McpServer {
	const service =
		options.service ?? createMcpToolService(createMcpProjectContext(root), options.ports);
	const server = new McpServer(MCP_SERVER_INFO, {
		capabilities: { tools: {}, resources: {} },
	});

	server.registerTool(
		MCP_TOOL.InspectProject,
		{
			title: "Inspect project",
			description:
				"Inspect a project root with registered source adapters and report detected styling ecosystems, source files, and project evidence.",
			inputSchema: inspectProjectSchema,
		},
		async (input) => service.call(MCP_TOOL.InspectProject, input),
	);
	server.registerTool(
		MCP_TOOL.PreviewMigration,
		{
			title: "Preview migration",
			description:
				"Preview a registered source-to-target migration without writing source or generated files.",
			inputSchema: migrationSchema,
		},
		async (input) => service.call(MCP_TOOL.PreviewMigration, input),
	);
	server.registerTool(
		MCP_TOOL.ApplyMigration,
		{
			title: "Apply migration",
			description:
				"Apply an explicitly confirmed migration plan after checking every source, generated-file, and shared-file conflict.",
			inputSchema: applyMigrationSchema,
		},
		async (input) => service.call(MCP_TOOL.ApplyMigration, input),
	);
	server.registerTool(
		MCP_TOOL.ValidateMigration,
		{
			title: "Validate migration",
			description:
				"Run read-only adapter and canonical-CSS checks, plus explicitly configured project checks.",
			inputSchema: {
				...migrationSchema,
				checks: validationSchema.checks,
			},
		},
		async (input) => service.call(MCP_TOOL.ValidateMigration, input),
	);
	server.registerTool(
		MCP_TOOL.CompareMigrations,
		{
			title: "Compare migrations",
			description:
				"Preview several registered source-to-target routes for the same files and compare emitted code, residuals, and validations.",
			inputSchema: compareMigrationsSchema,
		},
		async (input) => service.call(MCP_TOOL.CompareMigrations, input),
	);
	server.registerTool(
		MCP_TOOL.InspectStyleProgram,
		{
			title: "Inspect StyleProgram",
			description:
				"Inspect the semantic StyleProgram and lowering plans produced for source expressions, including tokens, conditions, compositions, and residuals.",
			inputSchema: migrationSchema,
		},
		async (input) => service.call(MCP_TOOL.InspectStyleProgram, input),
	);
	server.registerTool(
		MCP_TOOL.AnalyzeProject,
		{
			title: "Analyze project",
			description:
				"Run Pandwind's existing fold and CSS analysis over project-relative source files and return its versioned JSON report.",
			inputSchema: analyzeProjectSchema,
		},
		async (input) => service.call(MCP_TOOL.AnalyzeProject, input),
	);
	server.registerTool(
		MCP_TOOL.BenchmarkProject,
		{
			title: "Benchmark project",
			description:
				"Measure bounded source scanning and migration throughput, memory delta, source size, and existing build artifact sizes without running project commands.",
			inputSchema: benchmarkProjectSchema,
		},
		async (input) => service.call(MCP_TOOL.BenchmarkProject, input),
	);

	for (const resource of service.resources) {
		server.registerResource(
			resource.name,
			resource.uri,
			{ title: resource.name, description: resource.description, mimeType: resource.mimeType },
			async (uri) => ({
				contents: [
					{
						uri: uri.href,
						mimeType: resource.mimeType,
						text: await service.readResource(uri.href),
					},
				],
			}),
		);
	}

	return server;
}

export async function runMcpServer(root: string, options: McpServerOptions = {}): Promise<void> {
	const server = createMcpServer(root, options);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

export async function runMcpCommand(argv: readonly string[]): Promise<void> {
	const cli = cac("pandwind-analyze mcp");
	cli.option("--root <dir>", "Project root", { default: "." });
	cli.help();
	cli.parse(["node", "pandwind-analyze mcp", ...argv], { run: false });
	if (cli.matchedCommand !== undefined) return;
	cli.globalCommand.checkUnknownOptions();
	cli.globalCommand.checkOptionValue();
	cli.globalCommand.checkUnusedArgs();
	const root = cli.options.root;
	await runMcpServer(resolve(process.cwd(), typeof root === "string" ? root : "."));
}

export { MCP_TOOL };
