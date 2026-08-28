import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { buildAgentsDocument } from "./agents-json.ts";
import { extractTwConfig } from "../vite/inline.ts";

export interface GeneratedDesignSystem {
	readonly typesDts: string;
	readonly twTs: string;
	readonly themeBlock: string;
	readonly utilityCount: number;
	readonly variantCount: number;
}

export interface CodegenWriteOptions {
	readonly outDir: string;
	readonly agents?: boolean;
}

export class CodegenArtifactWriter {
	write(artifacts: GeneratedDesignSystem, options: CodegenWriteOptions): void {
		writeFileSync(resolve(options.outDir, "types.d.ts"), artifacts.typesDts);
		writeFileSync(resolve(options.outDir, "tw.ts"), artifacts.twTs);
		if (options.agents === true) {
			const config = extractTwConfig(artifacts.twTs);
			if (config === undefined) throw new Error("pandwind tw:codegen: could not extract config for agents.json");
			const doc = buildAgentsDocument({
				typesDts: artifacts.typesDts,
				config,
				themeBlock: artifacts.themeBlock,
				artifactDir: options.outDir,
			});
			writeFileSync(resolve(options.outDir, "pandwind.agents.json"), `${JSON.stringify(doc, null, "\t")}\n`);
		}
		if (artifacts.themeBlock !== "") writeFileSync(resolve(options.outDir, "pandwind-theme.css"), `${artifacts.themeBlock}\n`);
	}
}
