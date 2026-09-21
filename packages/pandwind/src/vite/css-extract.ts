/** CSS extraction composition root. Concrete policies live in sibling modules. */
import type { StyleObject } from "../types/typings.ts";
import { DesignCssArtifactExtractor } from "./css-artifact-extractor.ts";
import { CssDiagnosticScanner, CssSourceScannerService } from "./css-source-scanner.ts";
import { PandwindPatternAdapter } from "./css-pattern-adapter.ts";
import { StaticCssCallRewriter } from "./css-call-rewriter.ts";
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

class ComposedCssExtractionService implements CssExtractionService {
	readonly scanner: CssSourceScanner;
	readonly artifacts: CssArtifactExtractor;
	readonly diagnostics: CssDiagnosticReporter;
	readonly rewriter: CssCallRewriter;

	constructor(
		scanner: CssSourceScanner,
		artifacts: CssArtifactExtractor,
		diagnostics: CssDiagnosticReporter,
		rewriter: CssCallRewriter,
	) {
		this.scanner = scanner;
		this.artifacts = artifacts;
		this.diagnostics = diagnostics;
		this.rewriter = rewriter;
	}

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
		new StaticCssCallRewriter(options.preset, options.className, {
			namespace: options.namespace,
			tokenVariableNames: options.tokenVariableNames,
		});
	return new ComposedCssExtractionService(scanner, artifacts, diagnostics, rewriter);
}

/** Scanner-only composition root for consumers that do not need a preset. */
export const createCssSourceScanner = (matchers: readonly (string | RegExp)[]): CssSourceScanner =>
	new CssSourceScannerService(matchers);
