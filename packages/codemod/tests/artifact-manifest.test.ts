import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import {
	buildGeneratedArtifactManifest,
	checkGeneratedArtifactManifest,
	YUMCSS_GENERATED_BUDGET_SCHEMA,
	GeneratedArtifactOwnershipTag,
	YUMCSS_GENERATED_MANIFEST_SCHEMA,
	hashGeneratedContent,
} from "../src/tw/index.ts";

describe("generated artifact manifest", () => {
	test("hashes inputs and classifies generated ownership deterministically", () => {
		const manifest = buildGeneratedArtifactManifest({
			inputs: [
				{ path: "src/theme.css", content: "@theme;" },
				{ path: "src/tailwind.css", content: "@import 'tailwindcss';" },
			],
			artifacts: [
				{
					path: "src/tw.ts",
					ownership: GeneratedArtifactOwnershipTag.Runtime,
					content: "export const tw = 1;",
				},
				{
					path: "src/bridge.ts",
					ownership: GeneratedArtifactOwnershipTag.Optional,
					content: "export const bridge = {};",
				},
			],
		});

		expect(manifest).toEqual({
			schema: YUMCSS_GENERATED_MANIFEST_SCHEMA,
			generator: "yumcss-codemod tw generate",
			inputs: [
				{
					path: "src/tailwind.css",
					hash: hashGeneratedContent("@import 'tailwindcss';"),
				},
				{ path: "src/theme.css", hash: hashGeneratedContent("@theme;") },
			],
			artifacts: [
				{
					path: "src/bridge.ts",
					ownership: GeneratedArtifactOwnershipTag.Optional,
					hash: hashGeneratedContent("export const bridge = {};"),
				},
				{
					path: "src/tw.ts",
					ownership: GeneratedArtifactOwnershipTag.Runtime,
					hash: hashGeneratedContent("export const tw = 1;"),
				},
			],
		});
	});

	test("verifies consumer manifests, budgets, and stale artifacts", () => {
		const root = mkdtempSync(join(tmpdir(), "yumcss-generated-check-"));
		try {
			mkdirSync(join(root, "src"), { recursive: true });
			const input = "@import 'tailwindcss';";
			const artifact = "export const tw = 1;";
			writeFileSync(join(root, "src/tailwind.css"), input);
			writeFileSync(join(root, "src/tw.ts"), artifact);
			const manifest = buildGeneratedArtifactManifest({
				inputs: [{ path: "src/tailwind.css", content: input }],
				artifacts: [
					{
						path: "src/tw.ts",
						ownership: GeneratedArtifactOwnershipTag.Runtime,
						content: artifact,
					},
				],
			});
			writeFileSync(join(root, "src/yumcss.generated.json"), JSON.stringify(manifest));
			const budget = {
				schema: YUMCSS_GENERATED_BUDGET_SCHEMA,
				artifacts: {
					"src/tw.ts": {
						ownership: GeneratedArtifactOwnershipTag.Runtime,
						maxRawBytes: artifact.length,
						maxGzipBytes: 100,
					},
				},
			} as const;

			expect(checkGeneratedArtifactManifest(root, undefined, budget).valid).toBe(true);
			writeFileSync(join(root, "src/tw.ts"), `${artifact} changed`);
			const stale = checkGeneratedArtifactManifest(root, undefined, budget);
			expect(stale.valid).toBe(false);
			expect(stale.failures).toContain("artifact is stale: src/tw.ts");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
