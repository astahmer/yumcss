import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { CompilerPreviewUiPort } from "./ui-provider.ts";

let cached: string | null = null;

export const createNodeCompilerPreviewUiProvider = (): CompilerPreviewUiPort => ({
	loadIndexHtml: async (assetToken) => {
		if (cached === null) {
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
		}
		return cached.replaceAll(
			"./assets/",
			`/_ui/${assetToken}/assets/`,
		);
	},
	loadAsset: async (path) => {
		if (!/^assets\/[a-zA-Z0-9_-]+\.(?:js|css)$/.test(path)) return null;
		const artifact = fileURLToPath(
			new URL(`../../dist/compiler-preview-ui/${path}`, import.meta.url),
		);
		try {
			return {
				content: await readFile(artifact),
				contentType: path.endsWith(".css")
					? "text/css; charset=utf-8"
					: "application/javascript; charset=utf-8",
			};
		} catch {
			return null;
		}
	},
});
