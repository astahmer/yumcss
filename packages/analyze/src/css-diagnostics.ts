import {
	createCssSourceScanner,
	type CssCallSite,
	type CssDiagnostic,
} from "pandwind/vite/css-extract";

export type {
	AuthoredCssImport,
	CssCallSite,
	CssDiagnostic,
	CssDiagnosticKind,
} from "pandwind/vite/css-extract";

export interface AnalyzeSourceFile {
	file: string;
	content: string;
}

export interface CssAnalysisReport {
	authoredCss: Array<import("pandwind/vite/css-extract").AuthoredCssImport>;
	cssNamesByFile: Map<string, ReadonlySet<string>>;
	cssSources: Array<CssCallSite>;
	cssDiagnostics: Array<CssDiagnostic>;
}

export interface CssReportCollector {
	add(file: AnalyzeSourceFile): void;
	finish(): CssAnalysisReport;
}

const DEFAULT_MATCHERS = ["css", "design"] as const;

/** Collect all CSS observations while parsing each source file only once. */
export function collectCssReport(
	files: ReadonlyArray<AnalyzeSourceFile>,
	matchers: ReadonlyArray<string | RegExp> = DEFAULT_MATCHERS,
): CssAnalysisReport {
	const collector = createCssReportCollector(matchers);
	for (const file of files) collector.add(file);
	return collector.finish();
}

export function createCssReportCollector(
	matchers: ReadonlyArray<string | RegExp> = DEFAULT_MATCHERS,
): CssReportCollector {
	const scanner = createCssSourceScanner(matchers);
	const report: CssAnalysisReport = {
		authoredCss: [],
		cssNamesByFile: new Map(),
		cssSources: [],
		cssDiagnostics: [],
	};
	return {
		add({ file, content }) {
			const inspection = scanner.inspect(content, file);
			report.cssNamesByFile.set(file, inspection.cssNames);
			report.authoredCss.push(...inspection.authoredCss);
			report.cssSources.push(...inspection.cssSources);
			report.cssDiagnostics.push(...inspection.cssDiagnostics);
		},
		finish: () => report,
	};
}

/** Collect explicit web stylesheet imports without parsing their CSS. */
export function collectAuthoredCssImports(
	files: ReadonlyArray<AnalyzeSourceFile>,
): Array<import("pandwind/vite/css-extract").AuthoredCssImport> {
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
	imports: ReadonlyArray<import("pandwind/vite/css-extract").AuthoredCssImport>,
): string {
	if (imports.length === 0) return "";
	return [
		"authored css imports:",
		...imports.map(
			(css) => `    ^ ${css.file}:${css.line}:${css.column} — ${css.source} (${css.kind})`,
		),
	].join("\n");
}
