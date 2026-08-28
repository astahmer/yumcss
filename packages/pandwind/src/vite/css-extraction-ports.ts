import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import type {
	AuthoredCssImport,
	CssCallSite,
	CssDiagnostic,
	CssFileExtraction,
	CssPreset,
	CssSourceInspection,
	ExtractedCssStyle,
	InlineCssResult,
} from "./css-extract.ts";

/** Parser/language-selection boundary shared by every CSS extraction consumer. */
export interface SourceScanner {
	parse(input: { file: string; source: string; language?: string }): unknown;
	languageForFile(file: string): string;
}

/** Identifies CSS bindings and call sites without deciding how they are emitted. */
export interface CallSiteClassifier {
	findImports(code: string, id: string, matchers: Array<string | RegExp>): Set<string>;
	inspect(code: string, id: string, matchers: Array<string | RegExp>): CssSourceInspection;
	findCallSites(code: string, id: string, cssNames: ReadonlySet<string>): Array<CssCallSite>;
	findAuthoredImports(code: string, id: string): Array<AuthoredCssImport>;
}

/** Converts classified static calls into semantic styles and extracted artifacts. */
export interface ArtifactExtractor {
	extract(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
	): Array<ExtractedCssStyle>;
	extractFile(
		code: string,
		id: string,
		matchers: Array<string | RegExp>,
		preset: CssPreset,
	): CssFileExtraction;
}

/** Owns source-offset to line/column conversion and provenance construction. */
export interface ProvenanceProvider {
	locate(source: string, start: number, end: number): { line: number; column: number };
}

/** Rewrites source calls when static artifacts can replace their runtime form. */
export interface CallRewriter {
	inline(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
		className: AnyClassNameStrategy,
	): InlineCssResult;
}

/** Reports unsupported or unextracted source constructs. */
export interface DiagnosticReporter {
	diagnose(code: string, id: string, cssNames: ReadonlySet<string>): Array<CssDiagnostic>;
}

export interface CssExtractionPorts {
	readonly scanner: SourceScanner;
	readonly classifier: CallSiteClassifier;
	readonly extractor: ArtifactExtractor;
	readonly provenance: ProvenanceProvider;
	readonly rewriter: CallRewriter;
	readonly diagnostics: DiagnosticReporter;
}
