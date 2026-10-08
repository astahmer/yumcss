/** Independent oracle: execute the installed Panda generator's actual artifacts. */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveConfig } from "@pandacss/config";
import { Generator } from "@pandacss/generator";

export const pandaOracle = async (config: Parameters<typeof resolveConfig>[0]["config"] = {}) => {
	const directory = mkdtempSync(join(tmpdir(), "yumcss-panda-oracle-"));
	try {
		const resolved = await resolveConfig(
			{
				config: { ...config, outdir: "styled-system" },
				dependencies: [],
				path: join(directory, "panda.config.ts"),
			},
			directory,
		);
		const generator = new Generator(resolved);
		mkdirSync(join(directory, "css"));
		for (const artifact of generator.getArtifacts(["helpers", "css-fn"])) {
			for (const file of artifact.files) {
				if (!file.file.endsWith(".mjs")) continue;
				if (file.code === undefined)
					throw new Error("Panda emitted a runtime artifact without code");
				writeFileSync(
					join(directory, artifact.id === "helpers" ? "" : "css", file.file),
					file.code,
				);
			}
		}
		const generated = await import(pathToFileURL(join(directory, "css/css.mjs")).href);
		return {
			css: generated.css as (style: Record<string, unknown>) => string,
			propClasses: Object.fromEntries(generator.utility.entries()),
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};
