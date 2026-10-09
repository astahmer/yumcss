import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
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

	it("isolates package-script writes to the dependency tree", async () => {
		const root = mkdtempSync(join(process.cwd(), ".tmp-mcp-validation-"));
		roots.push(root);
		mkdirSync(join(root, "node_modules", ".cache"), { recursive: true });
		mkdirSync(join(root, "packages", "fixture-dependency"), { recursive: true });
		writeFileSync(join(root, "node_modules", ".cache", "mcp-marker"), "original");
		writeFileSync(
			join(root, "packages", "fixture-dependency", "index.js"),
			"module.exports = 'isolated';",
		);
		writeFileSync(join(root, "packages", "fixture-dependency", "marker.txt"), "original");
		symlinkSync(
			join(root, "packages", "fixture-dependency"),
			join(root, "node_modules", "fixture-dependency"),
			"dir",
		);
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				private: true,
				scripts: {
					typecheck:
						"node -e \"if (require('fixture-dependency') !== 'isolated') process.exit(1); require('node:fs').writeFileSync('node_modules/.cache/mcp-marker', 'changed'); require('node:fs').writeFileSync('node_modules/fixture-dependency/marker.txt', 'changed')\"",
				},
			}),
		);

		const [result] = await createNodeMcpValidationPort({ timeoutMs: 10_000 }).run(request(root));

		expect(result).toMatchObject({ status: MCP_VALIDATION_STATUS.Passed });
		expect(readFileSync(join(root, "node_modules", ".cache", "mcp-marker"), "utf8")).toBe(
			"original",
		);
		expect(readFileSync(join(root, "packages", "fixture-dependency", "marker.txt"), "utf8")).toBe(
			"original",
		);
	});

	it("isolates writes when node_modules itself is a symlink", async () => {
		const root = mkdtempSync(join(process.cwd(), ".tmp-mcp-validation-"));
		const dependencies = mkdtempSync(join(process.cwd(), ".tmp-mcp-validation-dependencies-"));
		roots.push(root, dependencies);
		mkdirSync(join(dependencies, ".cache"), { recursive: true });
		writeFileSync(join(dependencies, ".cache", "mcp-marker"), "original");
		symlinkSync(dependencies, join(root, "node_modules"), "dir");
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				private: true,
				scripts: {
					typecheck:
						"node -e \"require('node:fs').writeFileSync('node_modules/.cache/mcp-marker', 'changed')\"",
				},
			}),
		);

		const [result] = await createNodeMcpValidationPort({ timeoutMs: 10_000 }).run(request(root));

		expect(result).toMatchObject({ status: MCP_VALIDATION_STATUS.Passed });
		expect(readFileSync(join(dependencies, ".cache", "mcp-marker"), "utf8")).toBe("original");
	});

	it("does not let package scripts write through project symlinks", async () => {
		const root = mkdtempSync(join(process.cwd(), ".tmp-mcp-validation-"));
		const outside = mkdtempSync(join(process.cwd(), ".tmp-mcp-validation-outside-"));
		roots.push(root, outside);
		writeFileSync(join(outside, "mcp-marker"), "original");
		symlinkSync(outside, join(root, "outside"), "dir");
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				private: true,
				scripts: {
					typecheck:
						"node -e \"require('node:fs').writeFileSync('outside/mcp-marker', 'changed')\"",
				},
			}),
		);

		const [result] = await createNodeMcpValidationPort({ timeoutMs: 10_000 }).run(request(root));

		expect(result).toMatchObject({ status: MCP_VALIDATION_STATUS.Passed });
		expect(readFileSync(join(outside, "mcp-marker"), "utf8")).toBe("original");
	});

	it("keeps relative symlink overlays inside the validation copy", async () => {
		const root = mkdtempSync(join(process.cwd(), ".tmp-mcp-validation-"));
		roots.push(root);
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "real.ts"), "before");
		symlinkSync("../real.ts", join(root, "src/button.ts"));
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				private: true,
				scripts: {
					typecheck:
						"node -e \"const fs=require('node:fs'); if (fs.readFileSync('src/button.ts','utf8') !== 'after') process.exit(1)\"",
				},
			}),
		);

		const [result] = await createNodeMcpValidationPort().run(request(root));

		expect(result).toMatchObject({ status: MCP_VALIDATION_STATUS.Passed });
		expect(readFileSync(join(root, "real.ts"), "utf8")).toBe("before");
	});

	it("rejects absolute symlink overlays that resolve outside the isolated project", async () => {
		const root = mkdtempSync(join(process.cwd(), ".tmp-mcp-validation-"));
		roots.push(root);
		mkdirSync(join(root, "src"), { recursive: true });
		writeFileSync(join(root, "real.ts"), "before");
		symlinkSync(join(root, "real.ts"), join(root, "src/button.ts"));
		writeFileSync(join(root, "package.json"), JSON.stringify({ private: true, scripts: {} }));

		const outcome = await createNodeMcpValidationPort()
			.run(request(root))
			.then(
				() => "resolved",
				(error: unknown) => (error instanceof Error ? error.message : String(error)),
			);
		expect(readFileSync(join(root, "real.ts"), "utf8")).toBe("before");
		expect(outcome).toContain("validation overlay path resolves outside the isolated project");
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
