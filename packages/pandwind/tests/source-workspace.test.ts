import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createSourceWorkspace, type SourceWorkspaceFileSystem } from "../src/source-workspace.ts";
import type { SourceScannerService } from "../src/source-scanner.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("source workspace", () => {
	test("expands and scans supported source documents through one service", () => {
		const root = mkdtempSync(join(tmpdir(), "pandwind-source-workspace-"));
		roots.push(root);
		mkdirSync(join(root, "nested"));
		writeFileSync(
			join(root, "Card.tsx"),
			'import { createElement } from "react"; export const Card = () => createElement("div");',
		);
		writeFileSync(join(root, "nested", "Card.vue"), "<template><div /></template>");
		writeFileSync(join(root, "README.md"), "not a source document");

		const workspace = createSourceWorkspace();
		const files = workspace.files(["**/*"], root);
		const documents = workspace.collect(["**/*"], root);
		const streamed: string[] = [];
		workspace.forEach(files, ({ path }) => streamed.push(path));

		expect(workspace.schema).toBe("pandwind.source-workspace/1");
		expect(files).toEqual([join(root, "Card.tsx"), join(root, "nested", "Card.vue")]);
		expect(streamed).toEqual(files);
		expect(documents.map((document) => document.scan.framework)).toEqual(["react", "vue"]);
		expect(documents[0]?.scan.program?.type).toBe("Program");
		expect(documents[1]?.scan.program).toBeUndefined();
	});

	test("can discover non-script assets without changing the default source query", () => {
		const root = mkdtempSync(join(tmpdir(), "pandwind-source-workspace-assets-"));
		roots.push(root);
		writeFileSync(join(root, "theme.css"), ":root { --brand: red; }");
		writeFileSync(join(root, "Card.tsx"), "export const Card = () => null;");

		const workspace = createSourceWorkspace();

		expect(workspace.files(["**/*"], root)).toEqual([join(root, "Card.tsx")]);
		expect(workspace.files(["**/*.css"], root, { includeUnsupported: true })).toEqual([
			join(root, "theme.css"),
		]);
	});

	test("keeps filesystem and scanner policy replaceable at the workspace boundary", () => {
		const root = "/virtual-project";
		const file = `${root}/Card.virtual`;
		const fileSystem: SourceWorkspaceFileSystem = {
			readFile: (path) => (path === file ? "export const Card = 1;" : ""),
			stat: (path) => ({
				isFile: () => path === file,
				isDirectory: () => path === root,
			}),
			glob: () => ["Card.virtual"],
		};
		const scanner = {
			registry: {} as SourceScannerService["registry"],
			languageForFile: () => "typescript" as const,
			isSupportedFile: () => true,
			isScriptFile: () => true,
			isTypeScriptFile: () => true,
			scan: (document) => ({
				document,
				language: "typescript" as const,
				excluded: [],
				diagnostics: [],
				framework: "custom" as const,
				runtimeBoundary: "shared" as const,
				isExcluded: () => false,
			}),
			parse: () => undefined as never,
		} satisfies SourceScannerService;

		const workspace = createSourceWorkspace({ fileSystem, scanner });
		const documents = workspace.collect(["**/*"], root);

		expect(documents.map(({ path, scan }) => [path, scan.framework])).toEqual([[file, "custom"]]);
	});

	test("shares unchanged scan results across short-lived workspace façades", () => {
		const root = "/virtual-cached-project";
		const file = `${root}/Card.virtual`;
		let scans = 0;
		const fileSystem: SourceWorkspaceFileSystem = {
			readFile: (path) => (path === file ? "export const Card = 1;" : ""),
			stat: (path) => ({
				isFile: () => path === file,
				isDirectory: () => path === root,
				mtimeMs: 1,
			}),
			glob: () => ["Card.virtual"],
		};
		const scanner = {
			registry: {} as SourceScannerService["registry"],
			languageForFile: () => "typescript" as const,
			isSupportedFile: () => true,
			isScriptFile: () => true,
			isTypeScriptFile: () => true,
			scan: (document) => {
				scans += 1;
				return {
					document,
					language: "typescript" as const,
					excluded: [],
					diagnostics: [],
					isExcluded: () => false,
				};
			},
			parse: () => undefined as never,
		} satisfies SourceScannerService;

		const first = createSourceWorkspace({ fileSystem, scanner }).collect(["**/*"], root);
		const second = createSourceWorkspace({ fileSystem, scanner }).collect(["**/*"], root);

		expect(first).toHaveLength(1);
		expect(second).toHaveLength(1);
		expect(scans).toBe(1);
		expect(second[0]).toBe(first[0]);
	});

	test("invalidates a shared entry when the exact source changes", () => {
		const root = "/virtual-changing-project";
		let source = "export const Card = 1;";
		let scans = 0;
		const fileSystem: SourceWorkspaceFileSystem = {
			readFile: () => source,
			stat: () => ({ isFile: () => true, isDirectory: () => false }),
			glob: () => ["Card.virtual"],
		};
		const scanner = {
			registry: {} as SourceScannerService["registry"],
			languageForFile: () => "typescript" as const,
			isSupportedFile: () => true,
			isScriptFile: () => true,
			isTypeScriptFile: () => true,
			scan: (document) => {
				scans += 1;
				return {
					document,
					language: "typescript" as const,
					excluded: [],
					diagnostics: [],
					isExcluded: () => false,
				};
			},
			parse: () => undefined as never,
		} satisfies SourceScannerService;
		const workspace = createSourceWorkspace({ fileSystem, scanner });

		workspace.collect(["**/*"], root);
		source = "export const Card = 2;";
		workspace.collect(["**/*"], root);

		expect(scans).toBe(2);
	});

	test("incremental invalidation rereads only the changed document", () => {
		const root = "/virtual-incremental-project";
		const first = `${root}/first.ts`;
		const second = `${root}/second.ts`;
		const sources = new Map([
			[first, "export const first = 1;"],
			[second, "export const second = 1;"],
		]);
		const reads = new Map<string, number>();
		const fileSystem: SourceWorkspaceFileSystem = {
			readFile: (path) => {
				reads.set(path, (reads.get(path) ?? 0) + 1);
				return sources.get(path) ?? "";
			},
			stat: (path) => ({
				isFile: () => sources.has(path),
				isDirectory: () => path === root,
			}),
			glob: () => ["first.ts", "second.ts"],
		};
		const scanner = {
			registry: {} as SourceScannerService["registry"],
			languageForFile: () => "typescript" as const,
			isSupportedFile: () => true,
			isScriptFile: () => true,
			isTypeScriptFile: () => true,
			scan: (document) => ({
				document,
				language: "typescript" as const,
				excluded: [],
				diagnostics: [],
				isExcluded: () => false,
			}),
			parse: () => undefined as never,
		} satisfies SourceScannerService;
		const workspace = createSourceWorkspace({ fileSystem, scanner });

		workspace.collect(["**/*"], root);
		sources.set(first, "export const first = 2;");
		workspace.invalidate(first);
		workspace.collect(["**/*"], root);

		expect(reads).toEqual(
			new Map([
				[first, 2],
				[second, 1],
			]),
		);
	});
});
