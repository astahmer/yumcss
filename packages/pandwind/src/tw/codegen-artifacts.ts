/** File/artifact boundary for Tailwind code generation. */

export interface DesignSystemArtifacts {
	readonly typesDts: string;
	readonly twTs: string;
}

export interface DesignSystemArtifactBundle extends DesignSystemArtifacts {
	readonly themeBlock?: string;
	readonly agentsJson?: string;
}

export interface DesignSystemArtifactWriter {
	write(outputDir: string, artifacts: DesignSystemArtifactBundle): void;
}

export class FileSystemDesignSystemArtifactWriter implements DesignSystemArtifactWriter {
	constructor(
		private readonly writeFile: (path: string, contents: string) => void,
		private readonly resolvePath: (directory: string, file: string) => string,
	) {}

	write(outputDir: string, artifacts: DesignSystemArtifactBundle): void {
		this.writeFile(this.resolvePath(outputDir, "types.d.ts"), artifacts.typesDts);
		this.writeFile(this.resolvePath(outputDir, "tw.ts"), artifacts.twTs);
		if (artifacts.agentsJson !== undefined) {
			this.writeFile(this.resolvePath(outputDir, "pandwind.agents.json"), artifacts.agentsJson);
		}
		if (artifacts.themeBlock !== undefined && artifacts.themeBlock !== "") {
			this.writeFile(
				this.resolvePath(outputDir, "pandwind-theme.css"),
				`${artifacts.themeBlock}\n`,
			);
		}
	}
}
