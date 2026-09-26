import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { createLocalTokenSourceLoader } from "../src/swap/resolver-file-loader.ts";

describe("local DTCG Resolver source loader", () => {
	test("loads files under the project root and rejects external paths and URLs", async () => {
		const temporaryRoot = mkdtempSync(join(tmpdir(), "pandwind-token-sources-"));
		const projectRoot = join(temporaryRoot, "project");
		const tokenDirectory = join(projectRoot, "src", "tokens");
		const resolverPath = join(tokenDirectory, "tokens.resolver.json");
		const sourcePath = join(tokenDirectory, "base.tokens.json");
		const outsidePath = join(temporaryRoot, "outside.tokens.json");
		mkdirSync(tokenDirectory, { recursive: true });
		const source = JSON.stringify({ numeric: { $type: "number", $value: 1 } });
		writeFileSync(sourcePath, source);
		writeFileSync(outsidePath, source);
		try {
			const loader = createLocalTokenSourceLoader(resolverPath, projectRoot);
			const loaded = await loader.load("./base.tokens.json");
			expect(loaded.root.children.numeric).toMatchObject({
				kind: "token",
				effectiveType: "number",
			});
			await expect(loader.load("../../../outside.tokens.json")).rejects.toThrow(
				"outside the project root",
			);
			await expect(loader.load(pathToFileURL(outsidePath).href)).rejects.toThrow(
				"outside the project root",
			);
			await expect(loader.load("https://example.com/tokens.json")).rejects.toThrow(
				"local file references",
			);
		} finally {
			rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});

	test("resolves symlinks before applying the project-root boundary", async () => {
		const temporaryRoot = mkdtempSync(join(tmpdir(), "pandwind-token-symlinks-"));
		const projectRoot = join(temporaryRoot, "project");
		const tokenDirectory = join(projectRoot, "tokens");
		const resolverPath = join(tokenDirectory, "tokens.resolver.json");
		const outsidePath = join(temporaryRoot, "outside.tokens.json");
		mkdirSync(tokenDirectory, { recursive: true });
		writeFileSync(outsidePath, JSON.stringify({ numeric: { $type: "number", $value: 1 } }));
		symlinkSync(outsidePath, join(tokenDirectory, "linked.tokens.json"));
		try {
			const loader = createLocalTokenSourceLoader(resolverPath, projectRoot);
			await expect(loader.load("./linked.tokens.json")).rejects.toThrow("outside the project root");
		} finally {
			rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});
});
