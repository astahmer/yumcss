import { relative, resolve } from "node:path";
import { createStylesheet } from "pandwind/css/create-stylesheet";
import type { CssCascade } from "pandwind/css";
import type { CssConfigReturn } from "pandwind/types/typings";
import {
	createPandwindLibArtifact,
	createPandwindLibCompatibility,
	hashPandwindLibSource,
	type PandwindLibArtifact,
} from "pandwind/vite/lib-artifact";
import { createCssExtractionService } from "pandwind/vite/css-extract";
import { createSourceWorkspace, type SourceWorkspace } from "pandwind/source/workspace";

const DEFAULT_SOURCE_PATTERNS = ["**/*"] as const;
const DEFAULT_CSS_SOURCES = ["css", "design"] as const;
const IGNORED_SOURCE = /(?:^|[\\/])(?:node_modules|dist|\.git)(?:[\\/]|$)/u;

export interface BuildPandwindLibOptions {
	readonly root: string;
	readonly preset: CssConfigReturn;
	readonly sourcePatterns?: readonly string[];
	readonly cssSources?: readonly string[];
	readonly namespace?: string;
	readonly cascade?: CssCascade;
	readonly sourceWorkspace?: SourceWorkspace;
}

export interface BuildPandwindLibResult {
	readonly artifact: PandwindLibArtifact;
	readonly files: readonly string[];
}

export const buildPandwindLib = (options: BuildPandwindLibOptions): BuildPandwindLibResult => {
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
		hash: hashPandwindLibSource(document.source),
	}));

	for (const document of documents) {
		const extracted = extraction.extractFile(document.source, document.path);
		for (const { style } of extracted.sources) sheet.process([style]);
		for (const key of extracted.varKeys) sheet.processVarKey(key);
	}

	return {
		artifact: createPandwindLibArtifact({
			compatibility: createPandwindLibCompatibility(options.preset, {
				namespace: options.namespace,
				cascade: options.cascade,
			}),
			sources,
			tokens: sheet.gen.tokenEntries(),
			atomic: sheet.gen.atomicEntries(),
			vars: sheet.gen.varEntries(),
		}),
		files,
	};
};
