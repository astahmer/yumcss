import {
	diagnoseCssSources,
	findCssCallSites,
	findCssImports,
	type CssCallSite,
	type CssDiagnostic,
} from "../../pandwind/src/vite/css-extract.ts";

export type {
	CssCallSite,
	CssDiagnostic,
	CssDiagnosticKind,
} from "../../pandwind/src/vite/css-extract.ts";

export interface AnalyzeSourceFile {
	file: string;
	content: string;
}

const DEFAULT_MATCHERS = ["css", "design"] as const;

/** Collect CSS call provenance for analyze and inspector consumers. */
export function collectCssProvenance(
	files: ReadonlyArray<AnalyzeSourceFile>,
	matchers: ReadonlyArray<string | RegExp> = DEFAULT_MATCHERS,
): Array<CssCallSite> {
	return files.flatMap(({ file, content }) => {
		const names = findCssImports(content, file, [...matchers]);
		return findCssCallSites(content, file, names);
	});
}

/** Collect actionable extractor diagnostics for analyze and inspector consumers. */
export function collectCssDiagnostics(
	files: ReadonlyArray<AnalyzeSourceFile>,
	matchers: ReadonlyArray<string | RegExp> = DEFAULT_MATCHERS,
): Array<CssDiagnostic> {
	return files.flatMap(({ file, content }) => {
		const names = findCssImports(content, file, [...matchers]);
		return diagnoseCssSources(content, file, names);
	});
}

export function formatCssDiagnostics(diagnostics: ReadonlyArray<CssDiagnostic>): string {
	if (diagnostics.length === 0) return "";
	return [
		"css diagnostics:",
		...diagnostics.map(
			(d) => `    ^ ${d.file}:${d.line}:${d.column} — ${d.kind}: ${d.message} ${d.suggestion}`,
		),
	].join("\n");
}
