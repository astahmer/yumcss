import { CodemodAdapterId } from "../identifiers.ts";
import { createStylesheetAdapter } from "./stylesheet-adapter.ts";

export const authoredCssAdapter = createStylesheetAdapter({
	id: CodemodAdapterId.AuthoredCss,
	name: "css",
	extensions: [".css"],
	packages: { packages: [] },
	classStringArtifact: {
		kind: "global",
		outputExtension: ".css",
		importSpecifierExtension: ".css",
	},
	keyframesArtifact: {
		outputExtension: ".css",
		importSpecifierExtension: ".css",
	},
	reactComponentArtifact: {
		outputExtension: ".css",
		importSpecifierExtension: ".css",
	},
});
