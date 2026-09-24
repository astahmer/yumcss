import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { CompilerPreviewUiPort } from "./ui-provider.ts";

let cached: string | null = null;

export const createNodeCompilerPreviewUiProvider = (): CompilerPreviewUiPort => ({
	loadIndexHtml: async () => {
		if (cached !== null) return cached;
		const artifact = fileURLToPath(
			new URL("../../dist/compiler-preview-ui/index.html", import.meta.url),
		);
		try {
			cached = await readFile(artifact, "utf8");
		} catch {
			throw new Error(
				"Compiler Preview UI is not built; run the pandwind-analyze package build first",
			);
		}
		return cached;
	},
});
