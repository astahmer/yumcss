import { CodemodAdapterId } from "../identifiers.ts";
import { createStylesheetAdapter } from "./stylesheet-adapter.ts";

export const cssModulesAdapter = createStylesheetAdapter({
	id: CodemodAdapterId.CssModules,
	name: "css-modules",
	extensions: [".module.css", ".module.scss", ".module.sass"],
	packages: { packages: [] },
	composition: "partial",
});

export default cssModulesAdapter;
