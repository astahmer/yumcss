import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	chmodSync,
	linkSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBuiltinCodemodCatalog, STYLE_MIGRATION_USE_CASE } from "@yumcss/codemod/swap";
import { createMcpProjectContext, createMcpToolService } from "./tools.ts";
import { MCP_TOOL } from "./contract.ts";
const fixtures: string[] = [];
const source = 'import {css} from "@emotion/css"; export const cls=css({color:"red"});';
const fixture = () => {
	const directory = mkdtempSync(join(tmpdir(), "yumcss-mcp-containment-"));
	fixtures.push(directory);
	const root = join(directory, "project");
	mkdirSync(root);
	return { directory, root, service: createMcpToolService(createMcpProjectContext(root)) };
};
afterEach(() => {
	for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});
describe("MCP project containment", () => {
	it.each([MCP_TOOL.PreviewMigration, MCP_TOOL.ApplyMigration])(
		"rejects outside source symlinks for %s",
		async (tool) => {
			const project = fixture();
			const outside = join(project.directory, "outside.tsx");
			writeFileSync(outside, source);
			symlinkSync(outside, join(project.root, "Card.tsx"));
			await expect(
				project.service.call(tool, {
					files: ["Card.tsx"],
					from: "emotion",
					to: "tailwind",
					confirm: true,
				}),
			).rejects.toThrow("outside the project root");
			expect(readFileSync(outside, "utf8")).toBe(source);
		},
	);
	it("allows symlinks resolving inside the canonical project root", async () => {
		const project = fixture();
		writeFileSync(join(project.root, "actual.tsx"), source);
		symlinkSync(join(project.root, "actual.tsx"), join(project.root, "Card.tsx"));
		const result = await project.service.call(MCP_TOOL.ApplyMigration, {
			files: ["Card.tsx"],
			from: "emotion",
			to: "tailwind",
			confirm: true,
		});
		expect(result.structuredContent).toMatchObject({ applied: true });
		expect(readFileSync(join(project.root, "actual.tsx"), "utf8")).toContain("[color:red]");
	});
	it("rejects project hard links without changing either linked file", async () => {
		const project = fixture();
		const outside = join(project.directory, "outside.tsx");
		writeFileSync(outside, source);
		chmodSync(outside, 0o751);
		const originalMode = statSync(outside).mode & 0o777;
		linkSync(outside, join(project.root, "Card.tsx"));

		await expect(
			project.service.call(MCP_TOOL.ApplyMigration, {
				files: ["Card.tsx"],
				from: "emotion",
				to: "tailwind",
				confirm: true,
			}),
		).rejects.toThrow("multiply linked migration file");

		expect(readFileSync(outside, "utf8")).toBe(source);
		expect(statSync(outside).mode & 0o777).toBe(originalMode);
		expect(readFileSync(join(project.root, "Card.tsx"), "utf8")).toBe(source);
		expect(statSync(join(project.root, "Card.tsx")).mode & 0o777).toBe(originalMode);
	});
	it("rejects dangling output symlinks before creating their outside targets", async () => {
		const project = fixture();
		const outside = join(project.directory, "outside.ts");
		writeFileSync(join(project.root, "Card.ts"), source);
		symlinkSync(outside, join(project.root, "Card.treat.ts"));
		await expect(
			project.service.call(MCP_TOOL.ApplyMigration, {
				files: ["Card.ts"],
				from: "emotion",
				to: "treat",
				confirm: true,
			}),
		).rejects.toThrow();
		expect(existsSync(outside)).toBe(false);
		expect(readFileSync(join(project.root, "Card.ts"), "utf8")).toBe(source);
	});
	it("rejects a project root rebound after context creation", async () => {
		const project = fixture();
		const movedRoot = join(project.directory, "moved-project");
		const outsideRoot = join(project.directory, "outside");
		mkdirSync(outsideRoot);
		writeFileSync(join(project.root, "Card.tsx"), source);
		writeFileSync(join(outsideRoot, "Card.tsx"), source);
		renameSync(project.root, movedRoot);
		symlinkSync(outsideRoot, project.root, "dir");
		await expect(
			project.service.call(MCP_TOOL.ApplyMigration, {
				files: ["Card.tsx"],
				from: "emotion",
				to: "tailwind",
				confirm: true,
			}),
		).rejects.toThrow("project root changed");
		expect(readFileSync(join(outsideRoot, "Card.tsx"), "utf8")).toBe(source);
		expect(readFileSync(join(movedRoot, "Card.tsx"), "utf8")).toBe(source);
	});
	it("rejects conflicting writes through an in-project symlink before any write", async () => {
		const project = fixture();
		mkdirSync(join(project.root, "src"));
		mkdirSync(join(project.root, "alias"));
		writeFileSync(join(project.root, "src", "shared.ts"), "export const value = 1;");
		symlinkSync("../src/shared.ts", join(project.root, "alias", "shared.ts"));
		writeFileSync(join(project.root, "Card.ts"), source);
		const service = createMcpToolService(createMcpProjectContext(project.root), {
			createCatalog: createBuiltinCodemodCatalog,
			migration: {
				runAsync: async (input, options) => {
					const result = await STYLE_MIGRATION_USE_CASE.runAsync(input, options);
					return {
						...result,
						fileChanges: [
							{
								path: "src/shared.ts",
								expectedContent: "export const value = 1;",
								content: "export const value = 2;",
							},
							{
								path: "alias/shared.ts",
								expectedContent: "export const value = 1;",
								content: "export const value = 3;",
							},
						],
					};
				},
			},
			analyze: async () => "",
		});

		await expect(
			service.call(MCP_TOOL.ApplyMigration, {
				files: ["Card.ts"],
				from: "emotion",
				to: "tailwind",
				confirm: true,
			}),
		).rejects.toThrow("conflicting shared file change content");
		expect(readFileSync(join(project.root, "src", "shared.ts"), "utf8")).toBe(
			"export const value = 1;",
		);
		expect(readFileSync(join(project.root, "Card.ts"), "utf8")).toBe(source);
	});
	it("rejects source edits made while migration preview is awaiting its adapter", async () => {
		const project = fixture();
		const sourcePath = join(project.root, "Card.ts");
		writeFileSync(sourcePath, source);
		const service = createMcpToolService(createMcpProjectContext(project.root), {
			createCatalog: createBuiltinCodemodCatalog,
			migration: {
				runAsync: async (input, options) => {
					const result = await STYLE_MIGRATION_USE_CASE.runAsync(input, options);
					writeFileSync(sourcePath, "concurrent edit");
					return { ...result, outputExtension: ".migrated.ts" };
				},
			},
			analyze: async () => "",
		});

		await expect(
			service.call(MCP_TOOL.ApplyMigration, {
				files: ["Card.ts"],
				from: "emotion",
				to: "tailwind",
				confirm: true,
			}),
		).rejects.toThrow("refusing stale migration source Card.ts");
		expect(readFileSync(sourcePath, "utf8")).toBe("concurrent edit");
		expect(existsSync(join(project.root, "Card.migrated.ts"))).toBe(false);
	});
	it("rejects unwritable generated outputs before rewriting any source", async () => {
		const project = fixture();
		const sourcePath = join(project.root, "Card.ts");
		writeFileSync(sourcePath, source);
		const service = createMcpToolService(createMcpProjectContext(project.root), {
			createCatalog: createBuiltinCodemodCatalog,
			migration: {
				runAsync: async (input, options) => {
					const result = await STYLE_MIGRATION_USE_CASE.runAsync(input, options);
					return {
						...result,
						generatedFiles: [{ path: "Generated.ts", content: "export const generated = true;" }],
					};
				},
			},
			analyze: async () => "",
		});
		chmodSync(project.root, 0o555);
		try {
			await expect(
				service.call(MCP_TOOL.ApplyMigration, {
					files: ["Card.ts"],
					from: "emotion",
					to: "tailwind",
					confirm: true,
				}),
			).rejects.toThrow();
			expect(readFileSync(sourcePath, "utf8")).toBe(source);
			expect(existsSync(join(project.root, "Generated.ts"))).toBe(false);
		} finally {
			chmodSync(project.root, 0o755);
		}
	});
	it("preflights every generated output before writing the first one", async () => {
		const project = fixture();
		const sourcePath = join(project.root, "Card.ts");
		const blockedDirectory = join(project.root, "blocked");
		writeFileSync(sourcePath, source);
		mkdirSync(blockedDirectory);
		chmodSync(blockedDirectory, 0o555);
		const service = createMcpToolService(createMcpProjectContext(project.root), {
			createCatalog: createBuiltinCodemodCatalog,
			migration: {
				runAsync: async (input, options) => {
					const result = await STYLE_MIGRATION_USE_CASE.runAsync(input, options);
					return {
						...result,
						generatedFiles: [
							{ path: "FirstGenerated.ts", content: "export const first = true;" },
							{ path: "blocked/SecondGenerated.ts", content: "export const second = true;" },
						],
					};
				},
			},
			analyze: async () => "",
		});
		await expect(
			service.call(MCP_TOOL.ApplyMigration, {
				files: ["Card.ts"],
				from: "emotion",
				to: "tailwind",
				confirm: true,
			}),
		).rejects.toThrow();
		expect(readFileSync(sourcePath, "utf8")).toBe(source);
		expect(existsSync(join(project.root, "FirstGenerated.ts"))).toBe(false);
		expect(existsSync(join(blockedDirectory, "SecondGenerated.ts"))).toBe(false);
	});
	it.skipIf(process.platform !== "darwin")(
		"does not write outputs when deleting a source is denied by ACL",
		async () => {
			const project = fixture();
			const sourcePath = join(project.root, "Card.ts");
			writeFileSync(sourcePath, source);
			execFileSync("chmod", ["+a", "everyone deny delete", sourcePath]);
			try {
				await expect(
					project.service.call(MCP_TOOL.ApplyMigration, {
						files: ["Card.ts"],
						from: "emotion",
						to: "treat",
						confirm: true,
					}),
				).rejects.toThrow();
				expect(readFileSync(sourcePath, "utf8")).toBe(source);
				expect(existsSync(join(project.root, "Card.treat.ts"))).toBe(false);
			} finally {
				execFileSync("chmod", ["-N", sourcePath]);
			}
		},
	);
	it("preserves source mode when a migration changes the file extension", async () => {
		const project = fixture();
		const sourcePath = join(project.root, "Card.ts");
		const outputPath = join(project.root, "Card.treat.ts");
		writeFileSync(sourcePath, source, { mode: 0o640 });
		chmodSync(sourcePath, 0o640);
		if (process.platform === "darwin")
			execFileSync("xattr", ["-w", "com.yumcss.review", "preserve-me", sourcePath]);
		await project.service.call(MCP_TOOL.ApplyMigration, {
			files: ["Card.ts"],
			from: "emotion",
			to: "treat",
			confirm: true,
		});
		expect(statSync(outputPath).mode & 0o777).toBe(0o640);
		if (process.platform === "darwin") {
			expect(
				execFileSync("xattr", ["-p", "com.yumcss.review", outputPath], { encoding: "utf8" }),
			).toBe("preserve-me\n");
		}
	});
	it("rejects extension migration for a hard-linked source without changing either link", async () => {
		const project = fixture();
		const outsidePath = join(project.directory, "outside.ts");
		const sourcePath = join(project.root, "Card.ts");
		const outputPath = join(project.root, "Card.treat.ts");
		writeFileSync(outsidePath, source, { mode: 0o640 });
		chmodSync(outsidePath, 0o640);
		if (process.platform === "darwin")
			execFileSync("xattr", ["-w", "com.yumcss.review", "preserve-me", outsidePath]);
		linkSync(outsidePath, sourcePath);
		await expect(
			project.service.call(MCP_TOOL.ApplyMigration, {
				files: ["Card.ts"],
				from: "emotion",
				to: "treat",
				confirm: true,
			}),
		).rejects.toThrow("multiply linked migration source");
		expect(existsSync(outputPath)).toBe(false);
		expect(readFileSync(outsidePath, "utf8")).toBe(source);
		expect(statSync(outsidePath).mode & 0o777).toBe(0o640);
		expect(readFileSync(sourcePath, "utf8")).toBe(source);
		expect(statSync(sourcePath).mode & 0o777).toBe(0o640);
		if (process.platform === "darwin") {
			expect(
				execFileSync("xattr", ["-p", "com.yumcss.review", outsidePath], { encoding: "utf8" }),
			).toBe("preserve-me\n");
			expect(
				execFileSync("xattr", ["-p", "com.yumcss.review", sourcePath], { encoding: "utf8" }),
			).toBe("preserve-me\n");
		}
	});
});
it("composes shared import rewrites into renamed migrated consumers", async () => {
	const project = fixture();
	const styles = 'import {css} from "@emotion/css"; export const card=css({color:"red"});';
	const consumer =
		'import {card} from "./styles"; import {css} from "@emotion/css"; export const second=css({color:"blue"}); export {card};';
	writeFileSync(join(project.root, "styles.ts"), styles);
	writeFileSync(join(project.root, "consumer.ts"), consumer);
	const result = await project.service.call(MCP_TOOL.ApplyMigration, {
		files: ["*.ts"],
		from: "emotion",
		to: "treat",
		confirm: true,
	});
	expect(result.structuredContent).toMatchObject({
		applied: true,
		removedFiles: expect.arrayContaining(["styles.ts", "consumer.ts"]),
	});
	expect(existsSync(join(project.root, "consumer.ts"))).toBe(false);
	expect(existsSync(join(project.root, "styles.ts"))).toBe(false);
	const migrated = readFileSync(join(project.root, "consumer.treat.ts"), "utf8");
	expect(migrated).toContain('from "./styles.treat"');
	expect(migrated).toContain('from "treat"');
	expect(migrated).not.toContain("@emotion/css");
	expect(migrated).not.toContain('from "./styles"');
});
