import {
	inspectCssSource,
	type CssCallSite,
	type CssDiagnostic,
} from "../../pandwind/src/vite/css-extract.ts";

export type {
	AuthoredCssImport,
	CssCallSite,
	CssDiagnostic,
	CssDiagnosticKind,
} from "../../pandwind/src/vite/css-extract.ts";

export interface AnalyzeSourceFile {
	file: string;
	content: string;
}

export interface CssAnalysisReport {
	authoredCss: Array<import("../../pandwind/src/vite/css-extract.ts").AuthoredCssImport>;
	cssNamesByFile: Map<string, ReadonlySet<string>>;
	cssSources: Array<CssCallSite>;
	cssDiagnostics: Array<CssDiagnostic>;
}

const DEFAULT_MATCHERS = ["css", "design"] as const;

/** Collect all CSS observations while parsing each source file only once. */
export function collectCssReport(
	files: ReadonlyArray<AnalyzeSourceFile>,
	matchers: ReadonlyArray<string | RegExp> = DEFAULT_MATCHERS,
): CssAnalysisReport {
	return files.reduce<CssAnalysisReport>(
		(report, { file, content }) => {
			const inspection = inspectCssSource(content, file, [...matchers]);
			report.cssNamesByFile.set(file, inspection.cssNames);
			report.authoredCss.push(...inspection.authoredCss);
			report.cssSources.push(...inspection.cssSources);
			report.cssDiagnostics.push(...inspection.cssDiagnostics);
			return report;
		},
		{ authoredCss: [], cssNamesByFile: new Map(), cssSources: [], cssDiagnostics: [] },
	);
}

/** Collect explicit web stylesheet imports without parsing their CSS. */
export function collectAuthoredCssImports(
	files: ReadonlyArray<AnalyzeSourceFile>,
): Array<import("../../pandwind/src/vite/css-extract.ts").AuthoredCssImport> {
	return collectCssReport(files).authoredCss;
}

/** Collect CSS call provenance for analyze and inspector consumers. */
export function collectCssProvenance(
	files: ReadonlyArray<AnalyzeSourceFile>,
	matchers: ReadonlyArray<string | RegExp> = DEFAULT_MATCHERS,
): Array<CssCallSite> {
	return collectCssReport(files, matchers).cssSources;
}

/** Collect actionable extractor diagnostics for analyze and inspector consumers. */
export function collectCssDiagnostics(
	files: ReadonlyArray<AnalyzeSourceFile>,
	matchers: ReadonlyArray<string | RegExp> = DEFAULT_MATCHERS,
): Array<CssDiagnostic> {
	return collectCssReport(files, matchers).cssDiagnostics;
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

export function formatAuthoredCssImports(
	imports: ReadonlyArray<import("../../pandwind/src/vite/css-extract.ts").AuthoredCssImport>,
): string {
	if (imports.length === 0) return "";
	return [
		"authored css imports:",
		...imports.map(
			(css) => `    ^ ${css.file}:${css.line}:${css.column} — ${css.source} (${css.kind})`,
		),
	].join("\n");
}
