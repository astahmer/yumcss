import { relative, resolve } from "node:path";
import { createStylesheet } from "yumcss/css/create-stylesheet";
import type { CssCascade } from "yumcss/css";
import type { CssConfigReturn } from "yumcss/types/typings";
import {
	createYumCSSLibArtifact,
	createYumCSSLibCompatibility,
	hashYumCSSLibSource,
	type YumCSSLibArtifact,
} from "yumcss/vite/lib-artifact";
import { createCssExtractionService } from "yumcss/vite/css-extract";
import { createSourceWorkspace, type SourceWorkspace } from "yumcss/source/workspace";

const DEFAULT_SOURCE_PATTERNS = ["**/*"] as const;
const DEFAULT_CSS_SOURCES = ["css", "design"] as const;
const IGNORED_SOURCE = /(?:^|[\\/])(?:node_modules|dist|\.git)(?:[\\/]|$)/u;

export interface BuildYumCSSLibOptions {
	readonly root: string;
	readonly preset: CssConfigReturn;
	readonly sourcePatterns?: readonly string[];
	readonly cssSources?: readonly string[];
	readonly namespace?: string;
	readonly cascade?: CssCascade;
	readonly sourceWorkspace?: SourceWorkspace;
}

export interface BuildYumCSSLibResult {
	readonly artifact: YumCSSLibArtifact;
	readonly files: readonly string[];
}

export const buildYumCSSLib = (options: BuildYumCSSLibOptions): BuildYumCSSLibResult => {
	const root = resolve(options.root);
	const sourcePatterns = options.sourcePatterns ?? DEFAULT_SOURCE_PATTERNS;
	const cssSources = [...(options.cssSources ?? DEFAULT_CSS_SOURCES)];
	const sourceWorkspace = options.sourceWorkspace ?? createSourceWorkspace();
	const files = sourceWorkspace
		.files(sourcePatterns, root)
		.filter((file) => !IGNORED_SOURCE.test(file));
	const extraction = createCssExtractionService({
		matchers: cssSources,
		preset: options.preset,
		namespace: options.namespace,
	});
	const sheet = createStylesheet(
		options.preset,
		{ namespace: options.namespace },
		{ tokens: "used" },
	);
	const documents = files.flatMap((file) => sourceWorkspace.read([file]));
	const sources = documents.map((document) => ({
		path: relative(root, document.path).replaceAll("\\", "/"),
		hash: hashYumCSSLibSource(document.source),
	}));

	for (const document of documents) {
		const extracted = extraction.extractFile(document.source, document.path);
		for (const { style } of extracted.sources) sheet.process([style]);
		for (const key of extracted.varKeys) sheet.processVarKey(key);
	}
	const web = sheet.gen.web();

	return {
		artifact: createYumCSSLibArtifact({
			compatibility: createYumCSSLibCompatibility(options.preset, {
				namespace: options.namespace,
				cascade: options.cascade,
			}),
			sources,
			tokens: sheet.gen.tokenEntries(),
			web,
			atomic: sheet.gen.atomicEntries(),
			vars: sheet.gen.varEntries(),
		}),
		files,
	};
};
