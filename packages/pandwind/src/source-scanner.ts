import { parseSync, type ParseResult } from "oxc-parser";
import { walk, type OxcNode } from "./tw/literal.ts";

/** Versioned, package-level source analysis protocol shared by every lane. */
export const SOURCE_SCANNER_SCHEMA = "pandwind.source-scanner/2" as const;
export const SOURCE_SCANNER_PLUGIN_SCHEMA = "pandwind.source-scanner-plugin/1" as const;

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
	detect(document: SourceDocument): SourceLanguageAdapter | undefined;
	scan(document: SourceDocument): SourceScanResult;
}

export interface SourceLanguageClassifier {
	languageForFile(file: string): SourceLanguage;
	isSupportedFile(file: string): boolean;
	isScriptFile(file: string): boolean;
}

/** Shared scanner facade consumed by build, analyze, codemod, and collection.
 * Keeping file/language/parser policy here prevents each consumer from growing
 * its own extension table or parser compatibility shim. */
export interface SourceScannerService {
	readonly registry: SourceScannerRegistry;
	languageForFile(file: string): SourceLanguage;
	isSupportedFile(file: string): boolean;
	isScriptFile(file: string): boolean;
	scan(document: SourceDocument): SourceScanResult;
	parse(document: SourceDocument): ParseResult;
}

export const SOURCE_SCANNER_CONTRACT_SCHEMA = "pandwind.source-scanner-contract/1" as const;

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

export function sourceLanguageForFile(file: string): SourceLanguage {
	return SOURCE_LANGUAGE_CLASSIFIER.languageForFile(file);
}

export function isSupportedSourceFile(file: string): boolean {
	return SOURCE_LANGUAGE_CLASSIFIER.isSupportedFile(file);
}

export function isScriptSourceFile(file: string): boolean {
	return SOURCE_LANGUAGE_CLASSIFIER.isScriptFile(file);
}

const isOxcLanguage = (language: SourceLanguage): boolean =>
	language === "typescript" ||
	language === "tsx" ||
	language === "javascript" ||
	language === "jsx";

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
	const language = document.language ?? sourceLanguageForFile(document.file);
	if (!isOxcLanguage(language))
		throw new Error(`source language ${language} does not expose an oxc program`);
	return parseSync(document.file, document.source, {
		sourceType: "module",
		lang: language === "tsx" || language === "jsx" ? "tsx" : "ts",
	});
}

/** Mask comments and literal strings while keeping supported style templates actionable. */
export function computeExcludedRanges(
	source: string,
	file: string,
): { excluded: Array<[number, number]>; isExcluded(start: number): boolean } {
	const language = sourceLanguageForFile(file);
	if (!isOxcLanguage(language)) {
		const ranges = lexicalExcludedRanges(source);
		return {
			excluded: ranges.map(({ start, end }) => [start, end]),
			isExcluded: (start) => ranges.some((range) => start >= range.start && start < range.end),
		};
	}
	const parsed = parseSourceProgram({ file, source, language });
	const excluded: Array<[number, number]> = [];
	for (const comment of (
		parsed as unknown as { comments?: Array<{ start?: number; end?: number }> }
	).comments ?? []) {
		if (typeof comment.start === "number" && typeof comment.end === "number")
			excluded.push([comment.start, comment.end]);
	}
	const supportedStyleQuasis: Array<[number, number]> = [];
	walk(parsed.program as unknown as OxcNode, (node) => {
		const n = node as {
			type?: string;
			start?: number;
			end?: number;
			tag?: { start?: number; end?: number };
			quasi?: { start?: number; end?: number };
		};
		if (typeof n.start !== "number" || typeof n.end !== "number") return;
		if (n.type === "Comment") {
			excluded.push([n.start, n.end]);
			return;
		}
		if (n.type === "TaggedTemplateExpression" && n.tag !== undefined) {
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
		if (n.type === "Literal" || n.type === "TemplateLiteral") excluded.push([n.start, n.end]);
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
	const runtimeBoundary =
		document.runtimeBoundary ??
		(/^[\s\S]*['"]use client['"]/.test(document.source)
			? SourceRuntimeBoundary.Client
			: /^[\s\S]*['"]use server['"]/.test(document.source)
				? SourceRuntimeBoundary.Server
				: SourceRuntimeBoundary.Shared);
	let excluded: SourceRange[] = [];
	if (isOxcLanguage(language)) {
		try {
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

export function createSourceLanguageClassifier(
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
			const extension = `.${file.split(".").pop()?.toLowerCase() ?? ""}`;
			return languagesByExtension.get(extension) ?? "unknown";
		},
		isSupportedFile(file) {
			return this.languageForFile(file) !== "unknown";
		},
		isScriptFile(file) {
			return isOxcLanguage(this.languageForFile(file));
		},
	};
}

export const SOURCE_LANGUAGE_CLASSIFIER = createSourceLanguageClassifier(SOURCE_LANGUAGE_ADAPTERS);

export const BUILTIN_SOURCE_SCANNER_PLUGIN: SourceScannerPlugin = {
	schema: SOURCE_SCANNER_PLUGIN_SCHEMA,
	id: "pandwind-source-languages",
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
			for (const adapter of plugin.adapters) registry.register(adapter);
			plugins.set(plugin.id, plugin);
			return registry;
		},
		languageForFile: (file) => classifier.languageForFile(file),
		isSupportedFile: (file) => classifier.isSupportedFile(file),
		isScriptFile: (file) => classifier.isScriptFile(file),
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
	scan: (document) => SOURCE_SCANNER.scan(document),
	parse: (document) =>
		parseSourceProgram({
			...document,
			language: document.language ?? SOURCE_SCANNER.languageForFile(document.file),
		}),
};

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
