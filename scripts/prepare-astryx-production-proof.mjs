import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const appRoot = resolve(process.argv[2] ?? process.cwd());
const buildRoot = resolve(appRoot, ".next");
const buildIdPath = resolve(buildRoot, "BUILD_ID");
const manifestPath = resolve(buildRoot, "prerender-manifest.json");

await access(buildIdPath);

try {
	await access(manifestPath);
	console.log(`Production proof manifest already exists: ${manifestPath}`);
} catch {
	await writeFile(
		manifestPath,
		`${JSON.stringify(
			{
				version: 4,
				routes: {},
				dynamicRoutes: {},
				preview: {
					previewModeId: "astryx-proof-preview",
					previewModeSigningKey: "astryx-proof-signing-key",
					previewModeEncryptionKey: "astryx-proof-encryption-key",
				},
				notFoundRoutes: [],
			},
			null,
			2,
		)}\n`,
	);
	console.log(`Created production proof manifest: ${manifestPath}`);
}
