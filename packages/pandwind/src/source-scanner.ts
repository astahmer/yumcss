import { parseSync, type ParseResult } from "oxc-parser";
import { walk, type OxcNode } from "./tw/literal.ts";

/** Versioned, package-level source analysis protocol shared by every lane. */
export const SOURCE_SCANNER_SCHEMA = "pandwind.source-scanner/2" as const;

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
	isExcluded(start: number): boolean;
}

export interface SourceLanguageAdapter {
	readonly schema: typeof SOURCE_SCANNER_SCHEMA;
	readonly id: string;
	readonly languages: readonly SourceLanguage[];
	detect(document: SourceDocument): boolean;
	scan(document: SourceDocument): SourceScanResult;
}

export interface SourceScannerRegistry {
	readonly adapters: readonly SourceLanguageAdapter[];
	register(adapter: SourceLanguageAdapter): SourceScannerRegistry;
	detect(document: SourceDocument): SourceLanguageAdapter | undefined;
	scan(document: SourceDocument): SourceScanResult;
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

export function sourceLanguageForFile(file: string): SourceLanguage {
	const extension = file.split(".").pop()?.toLowerCase();
	return (
		(
			{
				ts: "typescript",
				tsx: "tsx",
				js: "javascript",
				jsx: "jsx",
				vue: "vue",
				svelte: "svelte",
				astro: "astro",
				mdx: "mdx",
			} as Record<string, SourceLanguage>
		)[extension ?? ""] ?? "unknown"
	);
}

export function isSupportedSourceFile(file: string): boolean {
	return sourceLanguageForFile(file) !== "unknown";
}

export function isScriptSourceFile(file: string): boolean {
	return isOxcLanguage(sourceLanguageForFile(file));
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
		isExcluded: (start) => excluded.some((range) => start >= range.start && start < range.end),
	};
}

const makeAdapter = (id: string, languages: readonly SourceLanguage[]): SourceLanguageAdapter => ({
	schema: SOURCE_SCANNER_SCHEMA,
	id,
	languages,
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
	detect: (document) =>
		languages.includes(document.language ?? sourceLanguageForFile(document.file)) &&
		patterns.some((pattern) => pattern.test(document.source)),
	scan: (document) => ({ ...scanDocument(document), framework }),
});

export const SOURCE_LANGUAGE_ADAPTERS: readonly SourceLanguageAdapter[] = [
	makeFrameworkAdapter(
		"jsx-react",
		"react",
		["typescript", "tsx", "javascript", "jsx"],
		[/from\s+["'](?:react|react-dom|@emotion\/react|styled-components)["']/],
	),
	makeFrameworkAdapter(
		"jsx-preact",
		"preact",
		["typescript", "tsx", "javascript", "jsx"],
		[/from\s+["'](?:preact|@preact\/)[^"']*["']/],
	),
	makeFrameworkAdapter(
		"jsx-solid",
		"solid",
		["typescript", "tsx", "javascript", "jsx"],
		[/from\s+["']solid-js(?:\/|["'])/],
	),
	makeFrameworkAdapter(
		"jsx-qwik",
		"qwik",
		["typescript", "tsx", "javascript", "jsx"],
		[/from\s+["']@builder\.io\/qwik(?:\/|["'])/],
	),
	makeAdapter("mdx", ["mdx"]),
	makeAdapter("typescript", ["typescript", "tsx", "javascript", "jsx"]),
	makeAdapter("vue", ["vue"]),
	makeAdapter("svelte", ["svelte"]),
	makeAdapter("astro", ["astro"]),
];

export function createSourceScannerRegistry(
	initial: readonly SourceLanguageAdapter[] = SOURCE_LANGUAGE_ADAPTERS,
): SourceScannerRegistry {
	const adapters = new Map<string, SourceLanguageAdapter>();
	const registry: SourceScannerRegistry = {
		get adapters() {
			return [...adapters.values()];
		},
		register(adapter) {
			if (adapter.schema !== SOURCE_SCANNER_SCHEMA)
				throw new Error(`unsupported source scanner schema: ${adapter.schema}`);
			if (adapters.has(adapter.id))
				throw new Error(`source scanner already registered: ${adapter.id}`);
			adapters.set(adapter.id, adapter);
			return registry;
		},
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
	for (const adapter of initial) registry.register(adapter);
	return registry;
}

export const SOURCE_SCANNER = createSourceScannerRegistry();

export const SOURCE_SCANNER_SERVICE: SourceScannerService = {
	registry: SOURCE_SCANNER,
	languageForFile: sourceLanguageForFile,
	isSupportedFile: isSupportedSourceFile,
	isScriptFile: isScriptSourceFile,
	scan: (document) => SOURCE_SCANNER.scan(document),
	parse: parseSourceProgram,
};
