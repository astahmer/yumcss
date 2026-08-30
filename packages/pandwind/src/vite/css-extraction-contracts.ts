import type { OxcNode } from "../tw/literal.ts";
import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	StyleObject,
} from "../types/typings.ts";

export type CssPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;

export interface CssSourceProvenance {
	readonly file: string;
	readonly start: number;
	readonly end: number;
	readonly line: number;
	readonly column: number;
	readonly callKind: "css" | "css.class" | "css.raw" | "css.group" | "pattern";
}

export interface CssCallSite extends CssSourceProvenance {
	readonly staticArguments: number;
	readonly dynamicArguments: number;
	rules?: Array<{ id: string; css: string }>;
}

export type CssDiagnosticKind = "unsupported-construct" | "missing-extraction";

export interface CssDiagnostic {
	readonly kind: CssDiagnosticKind;
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly start: number;
	readonly end: number;
	readonly message: string;
	readonly suggestion: string;
}

export interface AuthoredCssImport {
	readonly file: string;
	readonly source: string;
	readonly start: number;
	readonly end: number;
	readonly line: number;
	readonly column: number;
	readonly kind: "side-effect" | "binding";
}

export interface CssSourceInspection {
	readonly authoredCss: readonly AuthoredCssImport[];
	readonly cssNames: ReadonlySet<string>;
	readonly cssSources: readonly CssCallSite[];
	readonly cssDiagnostics: readonly CssDiagnostic[];
}

export interface ExtractedCssStyle {
	readonly style: StyleObject;
	readonly provenance: CssSourceProvenance;
}

export interface CssFileExtraction {
	readonly sources: ExtractedCssStyle[];
	readonly varKeys: string[];
}

export interface InlineCssResult {
	readonly code: string;
	readonly inlined: number;
}

export interface CssSourceScanner {
	matches(source: string): boolean;
	parse(code: string, id: string): OxcNode;
	findImports(code: string, id: string): ReadonlySet<string>;
	inspect(code: string, id: string): CssSourceInspection;
	findAuthoredImports(code: string, id: string): readonly AuthoredCssImport[];
	findCallSites(code: string, id: string, names: ReadonlySet<string>): readonly CssCallSite[];
	findVarKeys(code: string, id: string, names: ReadonlySet<string>): readonly string[];
}

export interface CssArtifactExtractor {
	extract(code: string, id: string, names: ReadonlySet<string>): ExtractedCssStyle[];
	extractFile(code: string, id: string): CssFileExtraction;
}

export interface CssCallRewriter {
	inline(code: string, id: string, names: ReadonlySet<string>): InlineCssResult;
}

export interface CssDiagnosticReporter {
	diagnose(code: string, id: string, names: ReadonlySet<string>): readonly CssDiagnostic[];
}

export interface CssPatternAdapter {
	readonly id: string;
	canHandle(name: string): boolean;
	extract(code: string, id: string, preset: CssPreset): readonly ExtractedCssStyle[];
}

export interface CssExtractionService {
	readonly scanner: CssSourceScanner;
	readonly artifacts: CssArtifactExtractor;
	readonly diagnostics: CssDiagnosticReporter;
	readonly rewriter: CssCallRewriter;
	findImports(code: string, id: string): ReadonlySet<string>;
	inspect(code: string, id: string): CssSourceInspection;
	findCallSites(code: string, id: string, names: ReadonlySet<string>): readonly CssCallSite[];
	findAuthoredImports(code: string, id: string): readonly AuthoredCssImport[];
	extract(code: string, id: string, names: ReadonlySet<string>): ExtractedCssStyle[];
	extractStyles(code: string, id: string, names: ReadonlySet<string>): StyleObject[];
	extractFile(code: string, id: string): CssFileExtraction;
	findVarKeys(code: string, id: string, names: ReadonlySet<string>): readonly string[];
	diagnose(code: string, id: string, names: ReadonlySet<string>): readonly CssDiagnostic[];
	inline(code: string, id: string, names: ReadonlySet<string>): InlineCssResult;
}

export type CssExtractorOptions = {
	readonly matchers: readonly (string | RegExp)[];
	readonly preset: CssPreset;
	readonly className?: AnyClassNameStrategy;
};
