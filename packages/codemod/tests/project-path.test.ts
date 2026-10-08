import {
	mkdirSync,
	mkdtempSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { MigrationFilePlan } from "../src/swap/migration-file-plan.ts";
import {
	createProjectPathBoundary,
	normalizeProjectRelativePath,
} from "../src/swap/project-path.ts";

test("normalizes project-relative aliases and rejects escapes", () => {
	expect(normalizeProjectRelativePath("src/./styles.ts")).toBe("src/styles.ts");
	expect(normalizeProjectRelativePath("src\\styles.ts")).toBe("src/styles.ts");
	expect(() => normalizeProjectRelativePath("../outside.ts")).toThrow("project-relative");
	expect(() => normalizeProjectRelativePath("/outside.ts")).toThrow("project-relative");
});

test("project path boundary permits internal symlinks and rejects escaping or dangling links", () => {
	const root = mkdtempSync(join(tmpdir(), "yumcss-codemod-path-root-"));
	const outside = mkdtempSync(join(tmpdir(), "yumcss-codemod-path-outside-"));
	try {
		mkdirSync(join(root, "target"));
		writeFileSync(join(root, "target", "sentinel.ts"), "inside");
		symlinkSync(join(root, "target"), join(root, "internal"), "dir");
		symlinkSync(outside, join(root, "escape"), "dir");
		symlinkSync(join(outside, "missing.ts"), join(root, "dangling.ts"), "file");
		symlinkSync(join(root, "target", "sentinel.ts"), join(root, "file-link.ts"), "file");
		const pathBoundary = createProjectPathBoundary(root);

		expect(pathBoundary.root).toBe(realpathSync(root));
		expect(pathBoundary.relative(join(root, "target", "sentinel.ts"))).toBe("target/sentinel.ts");
		expect(pathBoundary.relative(join(root, "file-link.ts"))).toBe("target/sentinel.ts");
		expect(pathBoundary.resolve("internal/new.ts")).toBe(
			join(pathBoundary.root, "target", "new.ts"),
		);
		expect(pathBoundary.resolveEntry("file-link.ts")).toBe(join(pathBoundary.root, "file-link.ts"));
		expect(() => pathBoundary.resolve("escape/new.ts")).toThrow("path escapes project root");
		expect(() => pathBoundary.resolve("dangling.ts")).toThrow("unresolved project symlink");
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	}
});

test("project path boundary detects root replacement during a migration", () => {
	const parent = mkdtempSync(join(tmpdir(), "yumcss-codemod-path-rebind-"));
	const root = join(parent, "project");
	const displaced = join(parent, "project-before-replacement");
	try {
		mkdirSync(root);
		const pathBoundary = createProjectPathBoundary(root);
		renameSync(root, displaced);
		expect(() => pathBoundary.resolve("new.ts")).toThrow("project root changed");
		mkdirSync(root);
		expect(() => pathBoundary.resolve("new.ts")).toThrow("project root changed");
	} finally {
		rmSync(parent, { recursive: true, force: true });
	}
});

test("migration plans merge internal file-symlink aliases before conflict checks", () => {
	const root = mkdtempSync(join(tmpdir(), "yumcss-codemod-path-plan-"));
	try {
		const baseline = "export const value = 0;";
		writeFileSync(join(root, "config.ts"), baseline);
		symlinkSync(join(root, "config.ts"), join(root, "alias.ts"), "file");
		const pathBoundary = createProjectPathBoundary(root);
		const canonicalizePath = pathBoundary.relative;

		const identical = MigrationFilePlan.compose({
			canonicalizePath,
			changes: [
				{ path: "config.ts", expectedContent: baseline, content: "export const value = 1;" },
				{ path: "alias.ts", expectedContent: baseline, content: "export const value = 1;" },
			],
		});
		expect(identical).toEqual([
			{ path: "config.ts", expectedContent: baseline, content: "export const value = 1;" },
		]);
		expect(() =>
			MigrationFilePlan.compose({
				canonicalizePath,
				changes: [
					{ path: "config.ts", expectedContent: baseline, content: "export const value = 1;" },
					{ path: "alias.ts", expectedContent: baseline, content: "export const value = 2;" },
				],
			}),
		).toThrow("conflicting non-import file change config.ts");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
