import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	MCP_RESOURCE,
	MCP_TOOL,
	createMcpProjectContext,
	createMcpToolService,
	type McpToolPorts,
} from "./tools.ts";
import { createBuiltinCodemodCatalog } from "pandwind-codemod/swap";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project() {
	const root = mkdtempSync(resolve(tmpdir(), "pandwind-mcp-"));
	roots.push(root);
	mkdirSync(resolve(root, "src"), { recursive: true });
	writeFileSync(
		resolve(root, "src/tw.ts"),
		`import { createTw } from "pandwind/tw";\nexport const tw = createTw({ variants: {} });\n`,
	);
	writeFileSync(
		resolve(root, "src/button.ts"),
		`import { createCss } from "pandwind/css";\nconst css = createCss();\nexport const button = css.class({ color: "red" });\n`,
	);
	return createMcpToolService(createMcpProjectContext(root));
}

function structured(result: { structuredContent?: unknown }): Record<string, unknown> {
	return result.structuredContent as Record<string, unknown>;
}

describe("Pandwind MCP tools", () => {
	it("exposes the complete tool and resource catalog", async () => {
		const service = project();
		expect(service.tools.map(({ name }) => name)).toEqual([
			"inspect_project",
			"preview_migration",
			"apply_migration",
			"validate_migration",
			"compare_migrations",
			"inspect_style_program",
			"analyze_project",
			"benchmark_project",
		]);
		expect(service.resources.map(({ uri }) => uri)).toEqual([
			MCP_RESOURCE.AdapterCatalog,
			MCP_RESOURCE.OfficialApiMatrix,
			MCP_RESOURCE.ProjectEvidence,
			MCP_RESOURCE.ProjectConfiguration,
			MCP_RESOURCE.LatestMigration,
			MCP_RESOURCE.ResidualExplanations,
			MCP_RESOURCE.InteropArtifact,
			MCP_RESOURCE.LatestStylePrograms,
			MCP_RESOURCE.LatestComparison,
		]);
		expect(JSON.parse(await service.readResource(MCP_RESOURCE.AdapterCatalog))).toMatchObject({
			schema: "pandwind.mcp.catalog/1",
		});
	});

	it("inspects registered adapters using the shared source workspace", async () => {
		const service = project();
		const result = await service.call(MCP_TOOL.InspectProject, {});
		const value = structured(result);
		const adapters = value.adapters as Array<{ id: string }>;
		expect(value.schema).toBe("pandwind.mcp.project/2");
		expect(adapters.some((adapter) => adapter.id === "pandwind")).toBe(true);
		expect(
			(value.registeredAdapters as Array<{ id: string }>).some(
				(adapter) => adapter.id === "pandwind",
			),
		).toBe(true);
	});

	it("previews a route without changing the project", async () => {
		const service = project();
		const result = await service.call(MCP_TOOL.PreviewMigration, {
			files: ["src/button.ts"],
			from: "pandwind",
			to: "pandwind",
		});
		const value = structured(result);
		const files = value.files as Array<{ file: string; changed: boolean }>;
		expect(files).toEqual([
			{
				file: "src/button.ts",
				changed: false,
				code: expect.any(String),
				diff: "",
				outputFile: "src/button.ts",
				converted: 0,
				skipped: 0,
				residuals: [],
				loweringPlans: [],
				outcomes: [],
				reports: [],
				validations: [],
				dependencies: [],
				generatedFiles: [],
				fileChanges: [],
			},
		]);
	});

	it("applies only an explicitly confirmed migration plan", async () => {
		const service = project();
		await expect(
			service.call(MCP_TOOL.ApplyMigration, {
				files: ["src/button.ts"],
				from: "pandwind",
				to: "pandwind",
			}),
		).rejects.toThrow("confirm: true");
		const result = await service.call(MCP_TOOL.ApplyMigration, {
			files: ["src/button.ts"],
			from: "pandwind",
			to: "pandwind",
			confirm: true,
		});
		expect(structured(result)).toMatchObject({
			schema: "pandwind.mcp.apply-migration/1",
			applied: true,
		});

		const root = mkdtempSync(resolve(tmpdir(), "pandwind-mcp-apply-"));
		roots.push(root);
		mkdirSync(resolve(root, "src"), { recursive: true });
		writeFileSync(resolve(root, "src/source.ts"), "before");
		const changingService = createMcpToolService(createMcpProjectContext(root), {
			createCatalog: createBuiltinCodemodCatalog,
			migration: {
				runAsync: async (source) => ({
					code: `${source}!`,
					changed: true,
					converted: 1,
					skipped: 0,
					reports: [],
					validations: [],
					dependencies: [],
					generatedFiles: [],
					fileChanges: [],
					residuals: [],
					loweringPlans: [],
					outcomes: [],
				}),
			},
			analyze: async () => JSON.stringify({ schema: "test" }),
		});
		await changingService.call(MCP_TOOL.ApplyMigration, {
			files: ["src/source.ts"],
			from: "fake",
			to: "fake",
			confirm: true,
		});
		expect(readFileSync(resolve(root, "src/source.ts"), "utf8")).toBe("before!");
	});

	it("compares routes, exposes style programs, and benchmarks without commands", async () => {
		const service = project();
		const comparison = await service.call(MCP_TOOL.CompareMigrations, {
			files: ["src/button.ts"],
			routes: [
				{ from: "pandwind", to: "pandwind" },
				{ from: "pandwind", to: "pandwind" },
			],
		});
		expect(structured(comparison)).toMatchObject({
			schema: "pandwind.mcp.compare-migrations/1",
			routes: [{ stats: { changed: 0 } }, { stats: { changed: 0 } }],
		});
		const programs = await service.call(MCP_TOOL.InspectStyleProgram, {
			files: ["src/button.ts"],
			from: "pandwind",
			to: "pandwind",
		});
		expect(structured(programs).schema).toBe("pandwind.mcp.style-program/1");
		const benchmark = await service.call(MCP_TOOL.BenchmarkProject, {
			files: ["src/button.ts"],
			from: "pandwind",
			to: "pandwind",
			iterations: 1,
		});
		expect(structured(benchmark)).toMatchObject({
			schema: "pandwind.mcp.benchmark/1",
			commandsExecuted: [],
			migration: { changed: 0 },
		});
	});

	it("returns the existing analyzer JSON contract", async () => {
		const service = project();
		const result = await service.call(MCP_TOOL.AnalyzeProject, {
			patterns: ["src/button.ts"],
			twPath: "src/tw.ts",
		});
		expect(structured(result)).toMatchObject({
			schema: "pandwind.mcp.analyze-project/1",
			analysis: { schema: "pandwind.analyze/2" },
			governance: { schema: "pandwind.analyze.governance/1" },
		});
	});

	it("validates a preview without executing project commands", async () => {
		const service = project();
		const result = await service.call(MCP_TOOL.ValidateMigration, {
			files: ["src/button.ts"],
			from: "pandwind",
			to: "pandwind",
		});
		expect(structured(result)).toMatchObject({
			schema: "pandwind.mcp.validate-migration/2",
			valid: true,
			files: [{ valid: true }],
			checks: [
				{ check: "contract", status: "passed" },
				{ check: "canonical-css", status: "passed" },
			],
		});
	});

	it("rejects paths that escape the fixed project root", async () => {
		const service = project();
		await expect(
			service.call(MCP_TOOL.PreviewMigration, {
				files: ["../outside.ts"],
				from: "pandwind",
				to: "pandwind",
			}),
		).rejects.toThrow("project-relative");
	});

	it("accepts substituted migration and analyzer ports", async () => {
		const root = mkdtempSync(resolve(tmpdir(), "pandwind-mcp-ports-"));
		roots.push(root);
		const context = createMcpProjectContext(root);
		const calls: string[] = [];
		const ports: McpToolPorts = {
			createCatalog: createBuiltinCodemodCatalog,
			migration: {
				runAsync: async (source) => {
					calls.push(source);
					return {
						code: source,
						changed: false,
						converted: 0,
						skipped: 0,
						reports: [],
						validations: [],
						dependencies: [],
						generatedFiles: [],
						fileChanges: [],
						residuals: [],
						loweringPlans: [],
						outcomes: [],
					};
				},
			},
			analyze: async () => {
				calls.push("analyze");
				return JSON.stringify({ schema: "test" });
			},
		};
		const service = createMcpToolService(context, ports);

		await service.call(MCP_TOOL.AnalyzeProject, {});
		expect(calls).toEqual(["analyze", "analyze"]);
	});

	it("runs only the explicitly supplied host validation checks", async () => {
		const root = mkdtempSync(resolve(tmpdir(), "pandwind-mcp-validation-"));
		roots.push(root);
		mkdirSync(resolve(root, "src"), { recursive: true });
		writeFileSync(resolve(root, "src/source.ts"), "before");
		const requested: string[] = [];
		const service = createMcpToolService(createMcpProjectContext(root), {
			createCatalog: createBuiltinCodemodCatalog,
			migration: {
				runAsync: async (source) => ({
					code: source,
					changed: false,
					converted: 0,
					skipped: 0,
					reports: [],
					validations: [],
					dependencies: [],
					generatedFiles: [],
					fileChanges: [],
					residuals: [],
					loweringPlans: [],
					outcomes: [],
				}),
			},
			analyze: async () => JSON.stringify({ schema: "test" }),
			validation: {
				run: async ({ checks }) => {
					requested.push(...checks);
					return checks.map((check) => ({
						check,
						status: "passed" as const,
						commandsExecuted: [`host:${check}`],
					}));
				},
			},
		});
		const result = await service.call(MCP_TOOL.ValidateMigration, {
			files: ["src/source.ts"],
			from: "fake",
			to: "fake",
			checks: ["typecheck", "build"],
		});
		const value = structured(result);
		expect(value.valid).toBe(true);
		expect(value.checks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ check: "typecheck", status: "passed" }),
				expect.objectContaining({ check: "build", status: "passed" }),
			]),
		);
		expect(value.commandsExecuted).toEqual(["host:typecheck", "host:build"]);
		expect(requested).toEqual(["typecheck", "build"]);
	});
});
