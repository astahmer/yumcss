import { toOxcNode } from "./oxc-node.ts";
import { parseSync, type ParseResult } from "oxc-parser";
import { walk, type OxcNode } from "./tw/literal.ts";
import { NodeKind } from "./ast-node-kind.ts";

/** Versioned, package-level source analysis protocol shared by every lane. */
export const SOURCE_SCANNER_SCHEMA = "yumcss.source-scanner/1" as const;
export const SOURCE_SCANNER_PLUGIN_SCHEMA = "yumcss.source-scanner-plugin/1" as const;

export const SourceLanguageAdapterId = {
	ReactJsx: "jsx-react",
	PreactJsx: "jsx-preact",
	SolidJsx: "jsx-solid",
	QwikJsx: "jsx-qwik",
	Mdx: "mdx",
	EcmaScript: "typescript",
	Vue: "vue",
	Svelte: "svelte",
	Astro: "astro",
} as const;
export type SourceLanguageAdapterId =
	(typeof SourceLanguageAdapterId)[keyof typeof SourceLanguageAdapterId];

export const SourceRuntimeBoundary = {
	Shared: "shared",
	Client: "client",
	Server: "server",
} as const;
export type SourceRuntimeBoundary =
	(typeof SourceRuntimeBoundary)[keyof typeof SourceRuntimeBoundary];

export type SourceLanguage =
	| "typescript"
	| "tsx"
	| "javascript"
	| "jsx"
	| "vue"
	| "svelte"
	| "astro"
	| "mdx"
	| (string & {});

export type SourceFramework =
	| "react"
	| "preact"
	| "solid"
	| "qwik"
	| "vue"
	| "svelte"
	| "astro"
	| "mdx"
	| (string & {});

export interface SourceDocument {
	readonly file: string;
	readonly source: string;
	readonly language?: SourceLanguage;
	readonly root?: string;
	readonly framework?: SourceFramework;
	readonly runtimeBoundary?: SourceRuntimeBoundary;
}

export interface SourceRange {
	readonly start: number;
	readonly end: number;
}

export interface SourceScanDiagnostic {
	readonly kind: "language" | "parse";
	readonly message: string;
}

export interface SourceScanResult {
	readonly document: SourceDocument;
	readonly language: SourceLanguage;
	/** Parsed program shared by AST consumers when the language exposes one. */
	readonly program?: OxcNode;
	readonly excluded: readonly SourceRange[];
	readonly diagnostics: readonly SourceScanDiagnostic[];
	readonly framework?: SourceFramework;
	readonly runtimeBoundary?: SourceRuntimeBoundary;
	isExcluded(start: number): boolean;
}

export interface SourceLanguageAdapter {
	readonly schema: typeof SOURCE_SCANNER_SCHEMA;
	readonly id: string;
	readonly languages: readonly SourceLanguage[];
	/** File suffixes owned by this adapter; custom adapters may omit this. */
	readonly extensions?: readonly string[];
	detect(document: SourceDocument): boolean;
	scan(document: SourceDocument): SourceScanResult;
}

export interface SourceScannerPlugin {
	readonly schema: typeof SOURCE_SCANNER_PLUGIN_SCHEMA;
	readonly id: string;
	readonly adapters: readonly SourceLanguageAdapter[];
}

export interface SourceScannerRegistry {
	readonly plugins: readonly SourceScannerPlugin[];
	readonly adapters: readonly SourceLanguageAdapter[];
	register(adapter: SourceLanguageAdapter): SourceScannerRegistry;
	registerPlugin(plugin: SourceScannerPlugin): SourceScannerRegistry;
	languageForFile(file: string): SourceLanguage;
	isSupportedFile(file: string): boolean;
	isScriptFile(file: string): boolean;
	isTypeScriptFile(file: string): boolean;
	detect(document: SourceDocument): SourceLanguageAdapter | undefined;
	scan(document: SourceDocument): SourceScanResult;
}

interface SourceLanguageClassifier {
	languageForFile(file: string): SourceLanguage;
	isSupportedFile(file: string): boolean;
	isScriptFile(file: string): boolean;
	isTypeScriptFile(file: string): boolean;
}

/** Shared scanner facade consumed by build, analyze, codemod, and collection.
 * Keeping file/language/parser policy here prevents each consumer from growing
 * its own extension table or parser-selection policy. */
export interface SourceScannerService {
	readonly registry: SourceScannerRegistry;
	languageForFile(file: string): SourceLanguage;
	isSupportedFile(file: string): boolean;
	isScriptFile(file: string): boolean;
	isTypeScriptFile(file: string): boolean;
	scan(document: SourceDocument): SourceScanResult;
	parse(document: SourceDocument): ParseResult;
}

export const SOURCE_SCANNER_CONTRACT_SCHEMA = "yumcss.source-scanner-contract/1" as const;

export interface SourceScannerContractFixture {
	readonly adapter: string;
	readonly document: SourceDocument;
	readonly language?: SourceLanguage;
	readonly framework?: SourceFramework;
}

export interface SourceScannerContractFailure {
	readonly adapter: string;
	readonly phase: "registration" | "detection" | "scan";
	readonly message: string;
}

export interface SourceScannerContractResult {
	readonly schema: typeof SOURCE_SCANNER_CONTRACT_SCHEMA;
	readonly valid: boolean;
	readonly checked: readonly string[];
	readonly failures: readonly SourceScannerContractFailure[];
}

export interface SourceScannerContractSuite {
	run(
		registry: SourceScannerRegistry,
		fixtures: readonly SourceScannerContractFixture[],
	): SourceScannerContractResult;
}

const fileWithoutQuery = (file: string): string => file.split(/[?#]/u, 1)[0] ?? file;

function sourceLanguageForFile(file: string): SourceLanguage {
	return SOURCE_LANGUAGE_CLASSIFIER.languageForFile(fileWithoutQuery(file));
}

const isOxcLanguage = (language: SourceLanguage): boolean =>
	language === "typescript" ||
	language === "tsx" ||
	language === "javascript" ||
	language === "jsx";

const scriptLanguageFromText = (text: string): SourceLanguage => {
	if (/\blang\s*=\s*["'](?:tsx|jsx)["']/iu.test(text)) return "tsx";
	if (/\blang\s*=\s*["'](?:ts|typescript)["']/iu.test(text)) return "typescript";
	if (/\blang\s*=\s*["']jsx["']/iu.test(text)) return "jsx";
	return "javascript";
};

const scriptLanguageFromFile = (file: string): SourceLanguage | undefined => {
	const match = /(?:lang[.=])(?:tsx|jsx|ts|typescript|js|javascript)(?:&|$)/iu.exec(file);
	if (match?.[0] === undefined) return undefined;
	return scriptLanguageFromText(match[0]);
};

interface EmbeddedScriptSource {
	readonly source: string;
	readonly language: SourceLanguage;
}

const maskOutsideRanges = (source: string, ranges: readonly SourceRange[]): string => {
	const characters = source.split("");
	for (let index = 0; index < characters.length; index++) {
		if (ranges.some((range) => index >= range.start && index < range.end)) continue;
		if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
	}
	return characters.join("");
};

const languageForScriptRanges = (ranges: readonly { language: SourceLanguage }[]) =>
	ranges.some((range) => range.language === "tsx" || range.language === "jsx")
		? "tsx"
		: ranges.some((range) => range.language === "typescript")
			? "typescript"
			: "javascript";

const embeddedScriptSource = (document: SourceDocument): EmbeddedScriptSource | undefined => {
	const language = document.language ?? sourceLanguageForFile(document.file);
	if (language !== "vue" && language !== "svelte") return undefined;
	const blocks = [...document.source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)];
	if (blocks.length === 0) {
		if (
			(language === "vue" && /<(?:template|style)\b/iu.test(document.source)) ||
			(language === "svelte" && /<[a-z][\w:.-]*(?:\s|\/?>)/iu.test(document.source))
		)
			return undefined;
		return {
			source: document.source,
			language: scriptLanguageFromFile(document.file) ?? "typescript",
		};
	}
	const ranges = blocks.map((block) => {
		const contentStart = (block.index ?? 0) + block[0].indexOf(">") + 1;
		const content = block[2] ?? "";
		return {
			start: contentStart,
			end: contentStart + content.length,
			language: scriptLanguageFromText(block[1] ?? ""),
		};
	});
	return {
		source: maskOutsideRanges(document.source, ranges),
		language: languageForScriptRanges(ranges),
	};
};

const embeddedAstroSource = (document: SourceDocument): EmbeddedScriptSource | undefined => {
	const frontmatter = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u.exec(document.source);
	if (frontmatter === null) return undefined;
	const content = frontmatter[1] ?? "";
	const contentStart = (frontmatter.index ?? 0) + frontmatter[0].indexOf("\n") + 1;
	const script = content.split("");
	const excluded = lexicalExcludedRanges(content);
	// Astro permits top-level return inside its render function; blanking the keyword preserves OXC offsets.
	for (const match of content.matchAll(/\breturn\b/gu)) {
		const start = match.index ?? 0;
		if (excluded.some((range) => start >= range.start && start < range.end)) continue;
		for (let index = start; index < start + match[0].length; index++) script[index] = " ";
	}
	const ranges = [{ start: contentStart, end: contentStart + content.length }];
	const source = maskOutsideRanges(document.source, ranges).split("");
	for (let index = 0; index < script.length; index++) source[contentStart + index] = script[index]!;
	return { source: source.join(""), language: "typescript" };
};

const parserDocument = (document: SourceDocument): SourceDocument | undefined => {
	const language = document.language ?? sourceLanguageForFile(document.file);
	if (isOxcLanguage(language)) return { ...document, language };
	if (language === "astro") {
		const embedded = embeddedAstroSource(document);
		return embedded === undefined
			? undefined
			: { ...document, source: embedded.source, language: embedded.language };
	}
	const embedded = embeddedScriptSource(document);
	return embedded === undefined
		? undefined
		: { ...document, source: embedded.source, language: embedded.language };
};

/**
 * Shared parsed-program cache for the document boundary. Analyzer, codemod,
 * Vite, and collection may all inspect the same unchanged module during one
 * build. Keep one bounded entry per file and replace it when either source or
 * language changes; this shares AST work without retaining an unbounded
 * repository or trusting filesystem mtimes for correctness.
 */
const SOURCE_PARSE_CACHE_CAP = 512;
const sourceParseCache = new Map<
	string,
	{ readonly source: string; readonly language: SourceLanguage; readonly result: ParseResult }
>();

function lexicalExcludedRanges(source: string): SourceRange[] {
	const ranges: SourceRange[] = [];
	const pattern =
		/\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g;
	for (const match of source.matchAll(pattern)) {
		const start = match.index ?? 0;
		ranges.push({ start, end: start + match[0].length });
	}
	return ranges;
}

function mdxExcludedRanges(source: string): SourceRange[] {
	const ranges: SourceRange[] = [];
	let fence: { start: number; end: number } | undefined;
	let lineStart = 0;
	for (const line of source.split("\n")) {
		const lineEnd = lineStart + line.length;
		if (/^\s*```/.test(line)) {
			if (fence === undefined) fence = { start: lineStart, end: lineEnd + 1 };
			else {
				fence.end = lineEnd + 1;
				ranges.push(fence);
				fence = undefined;
			}
			lineStart = lineEnd + 1;
			continue;
		}
		if (
			fence === undefined &&
			!/^\s*(?:import|export|const|let|var|function|class|type|interface|[<{])/.test(line)
		)
			ranges.push({ start: lineStart, end: lineEnd + 1 });
		lineStart = lineEnd + 1;
	}
	if (fence !== undefined) ranges.push({ start: fence.start, end: source.length });
	return ranges;
}

/** Parse an ECMAScript-family document using the same language selection as scanning. */
export function parseSourceProgram(document: SourceDocument): ParseResult {
	const parsedDocument = parserDocument(document);
	if (parsedDocument === undefined) {
		const language = document.language ?? sourceLanguageForFile(document.file);
		throw new Error(`source language ${language} does not expose an oxc program`);
	}
	const language = parsedDocument.language ?? sourceLanguageForFile(document.file);
	const cached = sourceParseCache.get(document.file);
	if (cached?.source === document.source && cached.language === language) return cached.result;
	const result = parseSync(document.file, parsedDocument.source, {
		sourceType: "module",
		lang:
			language === "javascript" || language === "jsx" ? "jsx" : language === "tsx" ? "tsx" : "ts",
	});
	if (sourceParseCache.size >= SOURCE_PARSE_CACHE_CAP) {
		const oldest = sourceParseCache.keys().next().value;
		if (oldest !== undefined) sourceParseCache.delete(oldest);
	}
	sourceParseCache.set(document.file, { source: document.source, language, result });
	return result;
}

const runtimeBoundaryFromProgram = (program: ParseResult["program"]): SourceRuntimeBoundary => {
	for (const statement of program.body) {
		if (statement.type !== "ExpressionStatement" || statement.directive === undefined) break;
		if (statement.directive === "use client") return SourceRuntimeBoundary.Client;
		if (statement.directive === "use server") return SourceRuntimeBoundary.Server;
	}
	return SourceRuntimeBoundary.Shared;
};

/** Mask comments and literal strings while keeping supported style templates actionable. */
export function computeExcludedRanges(
	source: string,
	file: string,
): { excluded: Array<[number, number]>; isExcluded(start: number): boolean } {
	const parsedDocument = parserDocument({ file, source });
	if (parsedDocument === undefined) {
		const ranges = lexicalExcludedRanges(source);
		return {
			excluded: ranges.map(({ start, end }) => [start, end]),
			isExcluded: (start) => ranges.some((range) => start >= range.start && start < range.end),
		};
	}
	const parsed = parseSourceProgram({ file, source });
	const excluded: Array<[number, number]> = [];
	for (const comment of parsed.comments) {
		if (typeof comment.start === "number" && typeof comment.end === "number")
			excluded.push([comment.start, comment.end]);
	}
	const supportedStyleQuasis: Array<[number, number]> = [];
	walk(parsed.program, (node) => {
		const n = node as {
			type?: string;
			start?: number;
			end?: number;
			tag?: { start?: number; end?: number };
			quasi?: { start?: number; end?: number };
		};
		if (typeof n.start !== "number" || typeof n.end !== "number") return;
		// Comments never appear in the program AST (they are handled separately
		// via `parsed.comments` above), so there is no comment branch here.
		if (n.type === NodeKind.TaggedTemplateExpression && n.tag !== undefined) {
			const tagText = source.slice(n.tag.start ?? 0, n.tag.end ?? 0);
			if (
				/^\s*(?:styled\b|css\b|keyframes\b)/.test(tagText) &&
				typeof n.start === "number" &&
				typeof n.end === "number" &&
				typeof n.quasi?.start === "number" &&
				typeof n.quasi.end === "number"
			) {
				// Matchers start at `css`/`styled`, not at the opening backtick.
				supportedStyleQuasis.push([n.start, n.end]);
				supportedStyleQuasis.push([n.quasi.start, n.quasi.end]);
			}
			return;
		}
		if (n.type === NodeKind.Literal || n.type === NodeKind.TemplateLiteral)
			excluded.push([n.start, n.end]);
	});
	const filtered = excluded
		.filter(([start, end]) => !supportedStyleQuasis.some(([qs, qe]) => start >= qs && end <= qe))
		.toSorted((a, b) => a[0] - b[0]);
	return {
		excluded: filtered,
		isExcluded(start) {
			let lo = 0;
			let hi = filtered.length - 1;
			while (lo <= hi) {
				const mid = (lo + hi) >> 1;
				const [rangeStart, rangeEnd] = filtered[mid]!;
				if (start < rangeStart) hi = mid - 1;
				else if (start >= rangeEnd) lo = mid + 1;
				else return true;
			}
			return false;
		},
	};
}

function scanDocument(document: SourceDocument): SourceScanResult {
	const language = document.language ?? sourceLanguageForFile(document.file);
	const diagnostics: SourceScanDiagnostic[] = [];
	let program: OxcNode | undefined;
	let runtimeBoundary = document.runtimeBoundary ?? SourceRuntimeBoundary.Shared;
	let excluded: SourceRange[] = [];
	if (parserDocument(document) !== undefined) {
		try {
			const parsed = parseSourceProgram({ ...document, language });
			program = toOxcNode(parsed.program);
			if (document.runtimeBoundary === undefined)
				runtimeBoundary = runtimeBoundaryFromProgram(parsed.program);
			diagnostics.push(
				...parsed.errors.map((error) => ({ kind: "parse" as const, message: error.message })),
			);
			excluded = computeExcludedRanges(document.source, document.file).excluded.map(
				([start, end]) => ({ start, end }),
			);
		} catch (error) {
			diagnostics.push({
				kind: "parse",
				message: error instanceof Error ? error.message : "unable to parse source",
			});
		}
	} else if (language === "unknown") {
		diagnostics.push({ kind: "language", message: `no registered language for ${document.file}` });
	} else {
		excluded =
			language === "mdx"
				? mdxExcludedRanges(document.source)
				: lexicalExcludedRanges(document.source);
	}
	return {
		document,
		language,
		...(program === undefined ? {} : { program }),
		excluded,
		diagnostics,
		runtimeBoundary,
		isExcluded: (start) => excluded.some((range) => start >= range.start && start < range.end),
	};
}

const extensionForLanguage = (language: SourceLanguage): string | undefined =>
	({
		typescript: ".ts",
		tsx: ".tsx",
		javascript: ".js",
		jsx: ".jsx",
		vue: ".vue",
		svelte: ".svelte",
		astro: ".astro",
		mdx: ".mdx",
	})[language as keyof Record<string, string>];

const languageForAdapterExtension = (
	adapter: SourceLanguageAdapter,
	extension: string,
): SourceLanguage | undefined => {
	const normalized = extension.toLowerCase();
	return (
		adapter.languages.find(
			(language) => extensionForLanguage(language)?.toLowerCase() === normalized,
		) ?? adapter.languages[0]
	);
};

const makeAdapter = (id: string, languages: readonly SourceLanguage[]): SourceLanguageAdapter => ({
	schema: SOURCE_SCANNER_SCHEMA,
	id,
	languages,
	extensions: languages
		.map(extensionForLanguage)
		.filter((extension): extension is string => extension !== undefined),
	detect: (document) =>
		languages.includes(document.language ?? sourceLanguageForFile(document.file)),
	scan: scanDocument,
});

const makeFrameworkAdapter = (
	id: string,
	framework: SourceFramework,
	languages: readonly SourceLanguage[],
	patterns: readonly RegExp[],
): SourceLanguageAdapter => ({
	schema: SOURCE_SCANNER_SCHEMA,
	id,
	languages,
	extensions: languages
		.map(extensionForLanguage)
		.filter((extension): extension is string => extension !== undefined),
	detect: (document) =>
		languages.includes(document.language ?? sourceLanguageForFile(document.file)) &&
		patterns.some((pattern) => pattern.test(document.source)),
	scan: (document) => ({ ...scanDocument(document), framework }),
});

export const SOURCE_LANGUAGE_ADAPTERS: readonly SourceLanguageAdapter[] = [
	makeFrameworkAdapter(
		SourceLanguageAdapterId.ReactJsx,
		"react",
		["typescript", "tsx", "javascript", "jsx"],
		[/from\s+["'](?:react|react-dom|@emotion\/react|styled-components)["']/],
	),
	makeFrameworkAdapter(
		SourceLanguageAdapterId.PreactJsx,
		"preact",
		["typescript", "tsx", "javascript", "jsx"],
		[/from\s+["'](?:preact|@preact\/)[^"']*["']/],
	),
	makeFrameworkAdapter(
		SourceLanguageAdapterId.SolidJsx,
		"solid",
		["typescript", "tsx", "javascript", "jsx"],
		[/from\s+["']solid-js(?:\/|["'])/],
	),
	makeFrameworkAdapter(
		SourceLanguageAdapterId.QwikJsx,
		"qwik",
		["typescript", "tsx", "javascript", "jsx"],
		[/from\s+["']@builder\.io\/qwik(?:\/|["'])/],
	),
	makeAdapter(SourceLanguageAdapterId.Mdx, ["mdx"]),
	makeAdapter(SourceLanguageAdapterId.EcmaScript, ["typescript", "tsx", "javascript", "jsx"]),
	makeFrameworkAdapter(SourceLanguageAdapterId.Vue, "vue", ["vue"], [/^[\s\S]*$/]),
	makeFrameworkAdapter(SourceLanguageAdapterId.Svelte, "svelte", ["svelte"], [/^[\s\S]*$/]),
	makeFrameworkAdapter(SourceLanguageAdapterId.Astro, "astro", ["astro"], [/^[\s\S]*$/]),
];

function createSourceLanguageClassifier(
	adapters: readonly SourceLanguageAdapter[],
): SourceLanguageClassifier {
	const languagesByExtension = new Map<string, SourceLanguage>();
	for (const adapter of adapters) {
		const extensions = adapter.extensions ?? [];
		for (const extension of extensions) {
			const language = languageForAdapterExtension(adapter, extension);
			if (language !== undefined && !languagesByExtension.has(extension.toLowerCase()))
				languagesByExtension.set(extension.toLowerCase(), language);
		}
	}
	return {
		languageForFile(file) {
			const normalizedFile = fileWithoutQuery(file);
			const extension = `.${normalizedFile.split(".").pop()?.toLowerCase() ?? ""}`;
			return languagesByExtension.get(extension) ?? "unknown";
		},
		isSupportedFile(file) {
			return this.languageForFile(file) !== "unknown";
		},
		isScriptFile(file) {
			const language = this.languageForFile(file);
			return (
				isOxcLanguage(language) ||
				language === "vue" ||
				language === "svelte" ||
				language === "astro"
			);
		},
		isTypeScriptFile(file) {
			const language = this.languageForFile(file);
			return language === "typescript" || language === "tsx";
		},
	};
}

const SOURCE_LANGUAGE_CLASSIFIER = createSourceLanguageClassifier(SOURCE_LANGUAGE_ADAPTERS);

export const BUILTIN_SOURCE_SCANNER_PLUGIN: SourceScannerPlugin = {
	schema: SOURCE_SCANNER_PLUGIN_SCHEMA,
	id: "yumcss-source-languages",
	adapters: SOURCE_LANGUAGE_ADAPTERS,
};

export function createSourceScannerRegistry(
	initial?: readonly SourceLanguageAdapter[],
): SourceScannerRegistry {
	const adapters = new Map<string, SourceLanguageAdapter>();
	const plugins = new Map<string, SourceScannerPlugin>();
	let classifier = createSourceLanguageClassifier([]);
	const registry: SourceScannerRegistry = {
		get plugins() {
			return [...plugins.values()];
		},
		get adapters() {
			return [...adapters.values()];
		},
		register(adapter) {
			if (adapter.schema !== SOURCE_SCANNER_SCHEMA)
				throw new Error(`unsupported source scanner schema: ${adapter.schema}`);
			if (adapters.has(adapter.id))
				throw new Error(`source scanner already registered: ${adapter.id}`);
			adapters.set(adapter.id, adapter);
			classifier = createSourceLanguageClassifier([...adapters.values()]);
			return registry;
		},
		registerPlugin(plugin) {
			if (plugin.schema !== SOURCE_SCANNER_PLUGIN_SCHEMA)
				throw new Error(`unsupported source scanner plugin schema: ${plugin.schema}`);
			if (plugins.has(plugin.id))
				throw new Error(`source scanner plugin already registered: ${plugin.id}`);
			const pluginAdapterIds = new Set<string>();
			for (const adapter of plugin.adapters) {
				if (adapter.schema !== SOURCE_SCANNER_SCHEMA)
					throw new Error(`unsupported source scanner schema: ${adapter.schema}`);
				if (adapters.has(adapter.id) || pluginAdapterIds.has(adapter.id))
					throw new Error(`source scanner already registered: ${adapter.id}`);
				pluginAdapterIds.add(adapter.id);
			}
			const nextAdapters = [...adapters.values(), ...plugin.adapters];
			const nextClassifier = createSourceLanguageClassifier(nextAdapters);
			for (const adapter of plugin.adapters) adapters.set(adapter.id, adapter);
			plugins.set(plugin.id, plugin);
			classifier = nextClassifier;
			return registry;
		},
		languageForFile: (file) => classifier.languageForFile(file),
		isSupportedFile: (file) => classifier.isSupportedFile(file),
		isScriptFile: (file) => classifier.isScriptFile(file),
		isTypeScriptFile: (file) => classifier.isTypeScriptFile(file),
		detect: (document) => registry.adapters.find((adapter) => adapter.detect(document)),
		scan(document) {
			const adapter = registry.detect(document);
			if (adapter !== undefined) return adapter.scan(document);
			const fallback = scanDocument(document);
			return {
				...fallback,
				diagnostics: [
					...fallback.diagnostics,
					{ kind: "language", message: `no source scanner matched ${document.file}` },
				],
			};
		},
	};
	if (initial === undefined) registry.registerPlugin(BUILTIN_SOURCE_SCANNER_PLUGIN);
	else for (const adapter of initial) registry.register(adapter);
	return registry;
}

export const SOURCE_SCANNER = createSourceScannerRegistry();

export const SOURCE_SCANNER_SERVICE: SourceScannerService = {
	registry: SOURCE_SCANNER,
	// Route all callers through the live registry. This is what makes a
	// registered scanner plugin effective outside the registry object itself.
	languageForFile: (file) => SOURCE_SCANNER.languageForFile(file),
	isSupportedFile: (file) => SOURCE_SCANNER.isSupportedFile(file),
	isScriptFile: (file) => SOURCE_SCANNER.isScriptFile(file),
	isTypeScriptFile: (file) => SOURCE_SCANNER.isTypeScriptFile(file),
	scan: (document) => SOURCE_SCANNER.scan(document),
	parse: (document) =>
		parseSourceProgram({
			...document,
			language: document.language ?? SOURCE_SCANNER.languageForFile(document.file),
		}),
};

export {
	SourceBindings,
	SourceBindingKind,
	SourceCallSiteKind,
	SourceHostUseKind,
	type SourceBinding,
	type SourceCallSite,
	type SourceBindingIndex,
	type SourceExportAll,
	type SourceModuleReference,
	type SourceReexport,
	type SourceHostUse,
} from "./source-bindings.ts";
export {
	SOURCE_PROJECT_BINDINGS_SCHEMA,
	createSourceProjectBindingIndex,
	type SourceProjectBindingIndex,
	type SourceProjectBindingLoader,
} from "./source-project.ts";

/**
 * Validate scanner substitutions at the language boundary. Consumers depend
 * only on `SourceScannerRegistry`; a custom language adapter can therefore
 * replace a built-in implementation without changing codemod or build code.
 */
export function createSourceScannerContractSuite(): SourceScannerContractSuite {
	return {
		run(registry, fixtures) {
			const fixtureById = new Map(fixtures.map((fixture) => [fixture.adapter, fixture]));
			const checked: string[] = [];
			const failures: SourceScannerContractFailure[] = [];
			for (const adapter of registry.adapters) {
				checked.push(adapter.id);
				const fixture = fixtureById.get(adapter.id);
				if (fixture === undefined) {
					failures.push({
						adapter: adapter.id,
						phase: "registration",
						message: "language adapter has no conformance fixture",
					});
					continue;
				}
				if (!adapter.detect(fixture.document)) {
					failures.push({
						adapter: adapter.id,
						phase: "detection",
						message: `adapter did not detect ${fixture.document.file}`,
					});
					continue;
				}
				try {
					const result = adapter.scan(fixture.document);
					if (!adapter.languages.includes(result.language))
						failures.push({
							adapter: adapter.id,
							phase: "scan",
							message: `scan returned unsupported language ${result.language}`,
						});
					if (fixture.language !== undefined && result.language !== fixture.language)
						failures.push({
							adapter: adapter.id,
							phase: "scan",
							message: `expected language ${fixture.language}, received ${result.language}`,
						});
					if (fixture.framework !== undefined && result.framework !== fixture.framework)
						failures.push({
							adapter: adapter.id,
							phase: "scan",
							message: `expected framework ${fixture.framework}, received ${String(result.framework)}`,
						});
				} catch (error) {
					failures.push({
						adapter: adapter.id,
						phase: "scan",
						message: error instanceof Error ? error.message : "scanner threw a non-error value",
					});
				}
			}
			for (const fixture of fixtures)
				if (registry.adapters.every((adapter) => adapter.id !== fixture.adapter))
					failures.push({
						adapter: fixture.adapter,
						phase: "registration",
						message: "fixture targets an unregistered language adapter",
					});
			return {
				schema: SOURCE_SCANNER_CONTRACT_SCHEMA,
				valid: failures.length === 0,
				checked,
				failures,
			};
		},
	};
}
