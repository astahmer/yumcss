import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { MCP_EXECUTION_LANE, MCP_VALIDATION_CHECK, MCP_VALIDATION_STATUS } from "./contract.ts";
import { createNodeMcpValidationPort } from "./node-validation.ts";
import type { McpValidationRequest } from "./tools.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function request(root: string): McpValidationRequest {
	return {
		root,
		from: "source",
		to: "target",
		mode: "safe",
		files: [
			{
				file: "src/button.ts",
				code: "after",
				outputFile: "src/button.ts",
				removeSource: false,
				generatedFiles: [{ path: "generated/marker.txt", content: "generated" }],
				fileChanges: [],
			},
		],
		checks: [MCP_VALIDATION_CHECK.Typecheck],
	};
}

describe("Node MCP validation host", () => {
	it("validates an overlaid preview without mutating the project", async () => {
		const root = mkdtempSync(join(process.cwd(), ".tmp-mcp-validation-"));
		roots.push(root);
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src/button.ts"), "before");
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				private: true,
				scripts: {
					typecheck:
						"node -e \"const fs=require('node:fs'); if (fs.readFileSync('src/button.ts','utf8') !== 'after' || fs.readFileSync('generated/marker.txt','utf8') !== 'generated') process.exit(1)\"",
				},
			}),
		);

		const [result] = await createNodeMcpValidationPort({ timeoutMs: 10_000 }).run(request(root));

		expect(result).toMatchObject({
			check: MCP_VALIDATION_CHECK.Typecheck,
			status: MCP_VALIDATION_STATUS.Passed,
			executionLane: MCP_EXECUTION_LANE.HostProject,
			commandsExecuted: ["npm run typecheck"],
			provenance: {
				source: "host",
				host: "node-package-scripts",
			},
		});
		expect(readFileSync(join(root, "src/button.ts"), "utf8")).toBe("before");
		expect(() => readFileSync(join(root, "generated/marker.txt"), "utf8")).toThrow();
	});

	it("reports an unavailable check when the project has no matching script", async () => {
		const root = mkdtempSync(join(process.cwd(), ".tmp-mcp-validation-"));
		roots.push(root);
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src/button.ts"), "before");
		writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, scripts: {} }));

		const [result] = await createNodeMcpValidationPort().run(request(root));

		expect(result).toMatchObject({
			check: MCP_VALIDATION_CHECK.Typecheck,
			status: MCP_VALIDATION_STATUS.Unavailable,
			executionLane: MCP_EXECUTION_LANE.HostProject,
		});
	});

	it("returns bounded package-script output when validation fails", async () => {
		const root = mkdtempSync(join(process.cwd(), ".tmp-mcp-validation-"));
		roots.push(root);
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "src/button.ts"), "before");
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				private: true,
				scripts: { typecheck: "node -e \"console.error('validation detail'); process.exit(1)\"" },
			}),
		);

		const [result] = await createNodeMcpValidationPort().run(request(root));

		expect(result).toMatchObject({
			check: MCP_VALIDATION_CHECK.Typecheck,
			status: MCP_VALIDATION_STATUS.Failed,
		});
		expect(result?.detail).toContain("validation detail");
	});

	it("rejects generated-file conflicts in the isolated overlay", async () => {
		const root = mkdtempSync(join(process.cwd(), ".tmp-mcp-validation-"));
		roots.push(root);
		mkdirSync(join(root, "src"), { recursive: true });
		mkdirSync(join(root, "generated"), { recursive: true });
		writeFileSync(join(root, "src/button.ts"), "before");
		writeFileSync(join(root, "generated/marker.txt"), "old");
		writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, scripts: {} }));

		await expect(createNodeMcpValidationPort().run(request(root))).rejects.toThrow(
			"generated file conflicts",
		);
	});
});
