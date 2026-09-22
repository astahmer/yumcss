import { createUnsafeCss } from "pandwind/unsafe/css";
import { createStylesheet } from "pandwind/css/create-stylesheet";
import { createHostStyleRegistry } from "pandwind/host";
import {
	createPandwindLibArtifact,
	createPandwindLibCompatibility,
	validatePandwindLibArtifact,
} from "pandwind/vite/lib-artifact";
import { createSourceScannerRegistry, SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { createSourceWorkspace } from "pandwind/source/workspace";
import { createCssExtractionService } from "pandwind/vite/css-extract";
import { createInlineTwPluginCore, pandwindVite, stackFoldVite } from "pandwind/vite";
import { pandwindUnplugin, pandwindUnpluginCss } from "pandwind/unplugin";
import { examplePreset } from "@pandwind/example-preset";

const css = createUnsafeCss();
const stylesheet = createStylesheet(examplePreset);
const host = createHostStyleRegistry();
const compatibility = createPandwindLibCompatibility(examplePreset);
const artifact = createPandwindLibArtifact({
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
const vite = pandwindVite();
const stack = stackFoldVite();
const unplugin = pandwindUnplugin;
const unpluginCss = pandwindUnpluginCss;

export const workload = {
	artifact,
	cssOutput: css.class({ color: "red" }),
	declarations: stylesheet.generate([css.raw({ color: "red", padding: 4 })]),
	extraction: extraction.inspect("const value = 1", "button.ts"),
	host: host.get("react")?.classProps("button"),
	inline,
	libValidation: validatePandwindLibArtifact(artifact),
	scan: SOURCE_SCANNER_SERVICE.scan(source),
	scanner,
	stack,
	unplugin,
	unpluginCss,
	vite,
	workspace,
};
