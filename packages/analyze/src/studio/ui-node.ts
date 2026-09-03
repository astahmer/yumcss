import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { StudioUiPort } from "./ui-provider.ts";

let cached: string | null = null;

/**
 * Production transport: serves the prebuilt single-file studio app emitted by
 * the package build. A missing artifact is an explicit setup error instead of
 * a silently degraded page.
 */
export const createNodeStudioUiProvider = (): StudioUiPort => ({
	loadIndexHtml: async () => {
		if (cached !== null) return cached;
		const artifact = fileURLToPath(new URL("../../dist/studio-ui/index.html", import.meta.url));
		try {
			cached = await readFile(artifact, "utf8");
		} catch {
			throw new Error("studio ui is not built; run the pandwind-analyze package build first");
		}
		return cached;
	},
});
