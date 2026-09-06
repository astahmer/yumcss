import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MCP_TOOL, createMcpProjectContext, createMcpToolService } from "./tools.ts";

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
	it("inspects registered adapters using the shared source workspace", async () => {
		const service = project();
		const result = await service.call(MCP_TOOL.InspectProject, {});
		const value = structured(result);
		const adapters = value.adapters as Array<{ id: string }>;
		expect(value.schema).toBe("pandwind.mcp.project/1");
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

	it("returns the existing analyzer JSON contract", async () => {
		const service = project();
		const result = await service.call(MCP_TOOL.AnalyzeProject, {
			patterns: ["src/button.ts"],
			twPath: "src/tw.ts",
		});
		expect(structured(result).schema).toBe("pandwind.analyze/2");
	});

	it("validates a preview without executing project commands", async () => {
		const service = project();
		const result = await service.call(MCP_TOOL.ValidateMigration, {
			files: ["src/button.ts"],
			from: "pandwind",
			to: "pandwind",
		});
		expect(structured(result)).toMatchObject({
			schema: "pandwind.mcp.validate-migration/1",
			valid: true,
			files: [{ valid: true }],
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
});
