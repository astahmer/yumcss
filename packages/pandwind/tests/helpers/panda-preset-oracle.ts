/**
 * @pandacss/config oracle: the installed Panda resolver reading Panda's stock
 * default configuration, loaded from the workspace root (it is reachable only
 * as a phantom dependency of the root's @pandacss/config, so the pandwind
 * package's own dependency graph stays unchanged).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PandaConfig } from "../../../../scripts/promote-panda-preset.ts";

const rootRequire = createRequire(new URL("../../../../package.json", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

interface PandaConfigLoader {
	readonly resolveConfig: (
		options: {
			readonly config: Record<string, unknown>;
			readonly dependencies: ReadonlyArray<string>;
			readonly path: string;
		},
		cwd: string,
	) => Promise<{ readonly config: PandaConfig }>;
}

interface ResolvedPandaConfig {
	readonly config: PandaConfig;
	readonly version: string;
}

let cached: Promise<ResolvedPandaConfig> | undefined;

export const pandaConfig = (): Promise<ResolvedPandaConfig> => {
	cached ??= (async () => {
		const packagePath = rootRequire.resolve("@pandacss/config/package.json");
		const version = (JSON.parse(readFileSync(packagePath, "utf8")) as { version: string }).version;
		const loader = (await import(
			packagePath.replace("/package.json", "/dist/index.mjs")
		)) as PandaConfigLoader;
		const { config } = await loader.resolveConfig(
			{ config: {}, dependencies: [], path: join(repositoryRoot, "panda.config.ts") },
			repositoryRoot,
		);
		return { config, version };
	})();
	return cached;
};
