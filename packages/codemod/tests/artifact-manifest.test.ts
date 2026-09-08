import { describe, expect, test } from "vitest";
import {
	buildGeneratedArtifactManifest,
	GeneratedArtifactOwnershipTag,
	PANDWIND_GENERATED_MANIFEST_SCHEMA,
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
			schema: PANDWIND_GENERATED_MANIFEST_SCHEMA,
			generator: "pandwind-codemod tw generate",
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
});
