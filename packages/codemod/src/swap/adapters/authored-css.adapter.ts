import { CodemodAdapterId } from "../identifiers.ts";
import { createStylesheetAdapter } from "./stylesheet-adapter.ts";

export const authoredCssAdapter = createStylesheetAdapter({
	id: CodemodAdapterId.AuthoredCss,
	name: "css",
	extensions: [".css"],
	packages: { packages: [] },
});
