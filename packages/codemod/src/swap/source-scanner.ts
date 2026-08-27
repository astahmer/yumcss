import { computeExcludedRanges } from "../sources.ts";

/** Versioned, language-neutral source scanner protocol. */
export const SOURCE_SCANNER_SCHEMA = "pandwind.source-scanner/1" as const;

export type SourceLanguage =
	| "typescript"
	| "tsx"
	| "javascript"
	| "jsx"
	| "vue"
	| "svelte"
	| "astro"
	| (string & {});

export interface SourceDocument {
	readonly file: string;
	readonly source: string;
	readonly language?: SourceLanguage;
	readonly root?: string;
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
	isExcluded(start: number): boolean;
	readonly diagnostics: readonly SourceScanDiagnostic[];
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

const languageForFile = (file: string): SourceLanguage => {
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
			} as Record<string, SourceLanguage>
		)[extension ?? ""] ?? "unknown"
	);
};

function scanDocument(document: SourceDocument): SourceScanResult {
	const excluded: SourceRange[] = [];
	const diagnostics: SourceScanDiagnostic[] = [];
	try {
		const mask = computeExcludedRanges(document.source, document.file);
		excluded.push(...mask.excluded.map(([start, end]) => ({ start, end })));
	} catch (error) {
		diagnostics.push({
			kind: "parse",
			message: error instanceof Error ? error.message : "unable to parse source exclusions",
		});
	}
	const language = document.language ?? languageForFile(document.file);
	if (language === "unknown")
		diagnostics.push({ kind: "language", message: `no registered language for ${document.file}` });
	const excludedSet = excluded;
	return {
		document,
		language,
		excluded: excludedSet,
		isExcluded: (start) => excludedSet.some((range) => start >= range.start && start < range.end),
		diagnostics,
	};
}

const makeAdapter = (id: string, languages: readonly SourceLanguage[]): SourceLanguageAdapter => ({
	schema: SOURCE_SCANNER_SCHEMA,
	id,
	languages,
	detect: (document) => {
		const language = document.language ?? languageForFile(document.file);
		return languages.includes(language);
	},
	scan: scanDocument,
});

/** Built-ins share one scanner implementation; only language detection varies. */
export const SOURCE_LANGUAGE_ADAPTERS: readonly SourceLanguageAdapter[] = [
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
		detect(document) {
			return registry.adapters.find((adapter) => adapter.detect(document));
		},
		scan(document) {
			const adapter = registry.detect(document);
			if (adapter === undefined) {
				return {
					...scanDocument(document),
					diagnostics: [
						...scanDocument(document).diagnostics,
						{ kind: "language", message: `no source scanner matched ${document.file}` },
					],
				};
			}
			return adapter.scan(document);
		},
	};
	for (const adapter of initial) registry.register(adapter);
	return registry;
}
