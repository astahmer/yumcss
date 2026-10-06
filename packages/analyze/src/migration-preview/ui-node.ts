import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { MigrationPreviewUiPort } from "./ui-provider.ts";

let cached: string | null = null;

/**
 * Production transport: serves the prebuilt single-file migration-preview app emitted by
 * the package build. A missing artifact is an explicit setup error instead of
 * a silently degraded page.
 */
export const createNodeMigrationPreviewUiProvider = (): MigrationPreviewUiPort => ({
	loadIndexHtml: async () => {
		if (cached !== null) return cached;
		const artifact = fileURLToPath(
			new URL("../../dist/migration-preview-ui/index.html", import.meta.url),
		);
		try {
			cached = await readFile(artifact, "utf8");
		} catch {
			throw new Error(
				"Migration Preview UI is not built; run the yumcss-analyze package build first",
			);
		}
		return cached;
	},
});
