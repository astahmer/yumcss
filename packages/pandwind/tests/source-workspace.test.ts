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

		expect(workspace.schema).toBe("pandwind.source-workspace/1");
		expect(files).toEqual([join(root, "Card.tsx"), join(root, "nested", "Card.vue")]);
		expect(documents.map((document) => document.scan.framework)).toEqual(["react", "vue"]);
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
});
