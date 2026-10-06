import { createUnsafeCss } from "yumcss/unsafe/css";
import { createStylesheet } from "yumcss/css/create-stylesheet";
import { createHostStyleRegistry } from "yumcss/host";
import {
	createYumCSSLibArtifact,
	createYumCSSLibCompatibility,
	validateYumCSSLibArtifact,
} from "yumcss/vite/lib-artifact";
import { createSourceScannerRegistry, SOURCE_SCANNER_SERVICE } from "yumcss/source";
import { createSourceWorkspace } from "yumcss/source/workspace";
import { createCssExtractionService } from "yumcss/vite/css-extract";
import { createInlineTwPluginCore, yumcssVite, stackFoldVite } from "yumcss/vite";
import { yumcssUnplugin, yumcssUnpluginCss } from "yumcss/unplugin";
import { examplePreset } from "@yumcss/example-preset";

const css = createUnsafeCss();
const stylesheet = createStylesheet(examplePreset);
const host = createHostStyleRegistry();
const compatibility = createYumCSSLibCompatibility(examplePreset);
const artifact = createYumCSSLibArtifact({
	compatibility,
	sources: [{ path: "src/button.tsx", hash: "button" }],
	tokens: [],
	web: "",
	atomic: [],
	vars: [],
});
const source = {
	file: "button.ts",
	source: 'export const value = "button";',
	language: "typescript" as const,
};
const scanner = createSourceScannerRegistry();
const workspace = createSourceWorkspace();
const extraction = createCssExtractionService({
	matchers: ["css"],
	preset: examplePreset,
});
const inline = createInlineTwPluginCore();
const vite = yumcssVite();
const stack = stackFoldVite();
const unplugin = yumcssUnplugin;
const unpluginCss = yumcssUnpluginCss;

export const workload = {
	artifact,
	cssOutput: css.class({ color: "red" }),
	declarations: stylesheet.generate([css.raw({ color: "red", padding: 4 })]),
	extraction: extraction.inspect("const value = 1", "button.ts"),
	host: host.get("react")?.classProps("button"),
	inline,
	libValidation: validateYumCSSLibArtifact(artifact),
	scan: SOURCE_SCANNER_SERVICE.scan(source),
	scanner,
	stack,
	unplugin,
	unpluginCss,
	vite,
	workspace,
};
