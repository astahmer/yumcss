/** CSS extraction composition root. Concrete policies live in sibling modules. */
import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import { normalizeStrategy } from "../css/class-name-strategy.ts";
import type { StyleObject } from "../types/typings.ts";
import { DesignCssArtifactExtractor } from "./css-artifact-extractor.ts";
import {
	CssDiagnosticScanner,
	cssSourceMatches,
	CssSourceScannerService,
} from "./css-source-scanner.ts";
import { PandwindPatternAdapter } from "./css-pattern-adapter.ts";
import { TailwindCssCallRewriter } from "./css-call-rewriter.ts";
import type {
	AuthoredCssImport,
	CssArtifactExtractor,
	CssCallRewriter,
	CssCallSite,
	CssDiagnostic,
	CssDiagnosticReporter,
	CssExtractionService,
	CssExtractorOptions,
	CssFileExtraction,
	CssSourceInspection,
	CssSourceScanner,
	ExtractedCssStyle,
	InlineCssResult,
} from "./css-extraction-contracts.ts";
import type { CssPreset } from "./css-extraction-contracts.ts";

export type {
	AuthoredCssImport,
	CssCallSite,
	CssDiagnostic,
	CssDiagnosticKind,
	CssFileExtraction,
	CssPreset,
	CssSourceInspection,
	CssSourceProvenance,
	CssSourceScanner,
	ExtractedCssStyle,
	InlineCssResult,
} from "./css-extraction-contracts.ts";

export interface CssExtractionServiceOptions extends CssExtractorOptions {
	readonly scanner?: CssSourceScanner;
	readonly artifacts?: CssArtifactExtractor;
	readonly diagnostics?: CssDiagnosticReporter;
	readonly rewriter?: CssCallRewriter;
}

class NoopCssCallRewriter implements CssCallRewriter {
	inline(code: string): InlineCssResult {
		return { code, inlined: 0 };
	}
}

class ComposedCssExtractionService implements CssExtractionService {
	constructor(
		readonly scanner: CssSourceScanner,
		readonly artifacts: CssArtifactExtractor,
		readonly diagnostics: CssDiagnosticReporter,
		readonly rewriter: CssCallRewriter,
	) {}

	findImports(code: string, id: string): ReadonlySet<string> {
		return this.scanner.findImports(code, id);
	}
	inspect(code: string, id: string): CssSourceInspection {
		return this.scanner.inspect(code, id);
	}
	findCallSites(code: string, id: string, names: ReadonlySet<string>): readonly CssCallSite[] {
		return this.scanner.findCallSites(code, id, names);
	}
	findAuthoredImports(code: string, id: string): readonly AuthoredCssImport[] {
		return this.scanner.findAuthoredImports(code, id);
	}
	extract(code: string, id: string, names: ReadonlySet<string>): ExtractedCssStyle[] {
		return this.artifacts.extract(code, id, names);
	}
	extractStyles(code: string, id: string, names: ReadonlySet<string>): StyleObject[] {
		return this.extract(code, id, names).map(({ style }) => style);
	}
	extractFile(code: string, id: string): CssFileExtraction {
		return this.artifacts.extractFile(code, id);
	}
	findVarKeys(code: string, id: string, names: ReadonlySet<string>): readonly string[] {
		return this.scanner.findVarKeys(code, id, names);
	}
	diagnose(code: string, id: string, names: ReadonlySet<string>): readonly CssDiagnostic[] {
		return this.diagnostics.diagnose(code, id, names);
	}
	inline(code: string, id: string, names: ReadonlySet<string>): InlineCssResult {
		return this.rewriter.inline(code, id, names);
	}
}

export function createCssExtractionService(
	options: CssExtractionServiceOptions,
): CssExtractionService {
	const scanner = options.scanner ?? new CssSourceScannerService(options.matchers);
	const artifacts =
		options.artifacts ??
		new DesignCssArtifactExtractor(scanner, options.preset, [new PandwindPatternAdapter(scanner)]);
	const diagnostics = options.diagnostics ?? new CssDiagnosticScanner();
	const rewriter =
		options.rewriter ??
		(options.className === undefined
			? new NoopCssCallRewriter()
			: new TailwindCssCallRewriter(options.preset, normalizeStrategy(options.className)!));
	return new ComposedCssExtractionService(scanner, artifacts, diagnostics, rewriter);
}

export function isCssSource(source: string, matchers: readonly (string | RegExp)[]): boolean {
	return cssSourceMatches(source, matchers);
}

const scannerOnly = (matchers: readonly (string | RegExp)[]) =>
	new CssSourceScannerService(matchers);

export function findCssImports(
	code: string,
	id: string,
	matchers: readonly (string | RegExp)[],
): ReadonlySet<string> {
	return scannerOnly(matchers).findImports(code, id);
}
export function inspectCssSource(
	code: string,
	id: string,
	matchers: readonly (string | RegExp)[],
): CssSourceInspection {
	return scannerOnly(matchers).inspect(code, id);
}
export function findAuthoredCssImports(code: string, id: string): readonly AuthoredCssImport[] {
	return scannerOnly([]).findAuthoredImports(code, id);
}
export function findCssCallSites(
	code: string,
	id: string,
	names: ReadonlySet<string>,
): readonly CssCallSite[] {
	return scannerOnly([]).findCallSites(code, id, names);
}
export function diagnoseCssSources(
	code: string,
	id: string,
	names: ReadonlySet<string>,
): readonly CssDiagnostic[] {
	return new CssDiagnosticScanner().diagnose(code, id, names);
}
export function extractCssSources(
	code: string,
	id: string,
	names: ReadonlySet<string>,
	preset: CssPreset,
): readonly ExtractedCssStyle[] {
	return createCssExtractionService({ matchers: [], preset }).extract(code, id, names);
}
export function extractCssStyles(
	code: string,
	id: string,
	names: ReadonlySet<string>,
	preset: CssPreset,
): readonly StyleObject[] {
	return createCssExtractionService({ matchers: [], preset }).extractStyles(code, id, names);
}
export function extractVarKeys(
	code: string,
	id: string,
	names: ReadonlySet<string>,
): readonly string[] {
	return scannerOnly([]).findVarKeys(code, id, names);
}
export function extractCssFile(
	code: string,
	id: string,
	matchers: readonly (string | RegExp)[],
	preset: CssPreset,
): CssFileExtraction {
	return createCssExtractionService({ matchers, preset }).extractFile(code, id);
}
export function inlineCssCalls(
	code: string,
	id: string,
	names: ReadonlySet<string>,
	preset: CssPreset,
	className: AnyClassNameStrategy,
): InlineCssResult {
	return createCssExtractionService({ matchers: [], preset, className }).inline(code, id, names);
}
