import type { CallToolResult } from "@modelcontextprotocol/server";

export const MCP_TOOL = {
	InspectProject: "inspect_project",
	PreviewMigration: "preview_migration",
	ApplyMigration: "apply_migration",
	ValidateMigration: "validate_migration",
	CompareMigrations: "compare_migrations",
	InspectStyleProgram: "inspect_style_program",
	AnalyzeProject: "analyze_project",
	BenchmarkProject: "benchmark_project",
} as const;

export const MCP_VALIDATION_CHECK = {
	Contract: "contract",
	CanonicalCss: "canonical-css",
	Typecheck: "typecheck",
	Build: "build",
	Ssr: "ssr",
	Hydration: "hydration",
	Browser: "browser",
	BundleSize: "bundle-size",
} as const;

export type McpValidationCheck = (typeof MCP_VALIDATION_CHECK)[keyof typeof MCP_VALIDATION_CHECK];

export const MCP_VALIDATION_STATUS = {
	Passed: "passed",
	Failed: "failed",
	Unavailable: "unavailable",
	Skipped: "skipped",
	NotApplicable: "not-applicable",
} as const;

export type McpValidationStatus =
	(typeof MCP_VALIDATION_STATUS)[keyof typeof MCP_VALIDATION_STATUS];

export const MCP_EXECUTION_LANE = {
	InProcess: "in-process",
	HostProject: "host-project",
} as const;

export type McpExecutionLane = (typeof MCP_EXECUTION_LANE)[keyof typeof MCP_EXECUTION_LANE];

export const MCP_PROVENANCE_SOURCE = {
	Adapter: "adapter",
	Host: "host",
} as const;

export type McpProvenanceSource =
	(typeof MCP_PROVENANCE_SOURCE)[keyof typeof MCP_PROVENANCE_SOURCE];

export const MCP_BENCHMARK_SCOPE = {
	InProcessMigration: "in-process-migration",
	Project: "project",
} as const;

export type McpBenchmarkScope = (typeof MCP_BENCHMARK_SCOPE)[keyof typeof MCP_BENCHMARK_SCOPE];

export const MCP_RESOURCE = {
	AdapterCatalog: "pandwind://catalog",
	OfficialApiMatrix: "pandwind://api-matrix",
	MigrationRouteCatalog: "pandwind://migration/routes",
	ProjectEvidence: "pandwind://project/evidence",
	ProjectConfiguration: "pandwind://project/configuration",
	LatestMigration: "pandwind://migration/latest",
	ResidualExplanations: "pandwind://migration/residuals",
	InteropArtifact: "pandwind://project/pandwind.interop.json",
	LatestStylePrograms: "pandwind://migration/style-programs/latest",
	LatestComparison: "pandwind://migration/comparison/latest",
} as const;

export const MCP_MIGRATION_MODE = {
	Safe: "safe",
	Partial: "partial",
} as const;

export interface McpToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: Readonly<Record<string, unknown>>;
}

export type McpToolResult = CallToolResult;
