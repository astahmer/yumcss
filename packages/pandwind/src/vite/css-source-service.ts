import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import { createCssExtractionService } from "./css-extract.ts";
import type {
	AuthoredCssImport,
	CssArtifactExtractor,
	CssCallRewriter,
	CssCallSite,
	CssDiagnostic,
	CssDiagnosticReporter,
	CssExtractionService,
	CssFileExtraction,
	CssPreset,
	CssSourceInspection,
	CssSourceScanner,
	ExtractedCssStyle,
	InlineCssResult,
} from "./css-extraction-contracts.ts";
import { CssDiagnosticScanner, CssSourceScannerService } from "./css-source-scanner.ts";

export interface CssSourceService {
	findCssImports(code: string, id: string, matchers: Array<string | RegExp>): ReadonlySet<string>;
	inspect(code: string, id: string, matchers: Array<string | RegExp>): CssSourceInspection;
	findCallSites(code: string, id: string, cssNames: ReadonlySet<string>): readonly CssCallSite[];
	diagnose(code: string, id: string, cssNames: ReadonlySet<string>): readonly CssDiagnostic[];
	findAuthoredImports(code: string, id: string): readonly AuthoredCssImport[];
	extract(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
	): readonly ExtractedCssStyle[];
	extractFile(
		code: string,
		id: string,
		matchers: Array<string | RegExp>,
		preset: CssPreset,
	): CssFileExtraction;
	inline(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
		className: AnyClassNameStrategy,
	): InlineCssResult;
}

export interface CssSourceServiceDependencies {
	readonly scanner?: CssSourceScanner;
	readonly artifacts?: CssArtifactExtractor;
	readonly diagnostics?: CssDiagnosticReporter;
	readonly rewriter?: CssCallRewriter;
}

/** Shared source-facing CSS service used by Vite, unplugin, and analyzers. */
class DefaultCssSourceService implements CssSourceService {
	private readonly dependencies: CssSourceServiceDependencies;

	constructor(dependencies: CssSourceServiceDependencies = {}) {
		this.dependencies = dependencies;
	}

	private scanner(matchers: readonly (string | RegExp)[]): CssSourceScanner {
		return this.dependencies.scanner ?? new CssSourceScannerService(matchers);
	}

	private extraction(
		matchers: readonly (string | RegExp)[],
		preset: CssPreset,
		className?: AnyClassNameStrategy,
	): CssExtractionService {
		return createCssExtractionService({
			matchers,
			preset,
			className,
			scanner: this.dependencies.scanner,
			artifacts: this.dependencies.artifacts,
			diagnostics: this.dependencies.diagnostics,
			rewriter: this.dependencies.rewriter,
		});
	}

	findCssImports(code: string, id: string, matchers: Array<string | RegExp>): ReadonlySet<string> {
		return this.scanner(matchers).findImports(code, id);
	}

	inspect(code: string, id: string, matchers: Array<string | RegExp>): CssSourceInspection {
		return this.scanner(matchers).inspect(code, id);
	}

	findCallSites(code: string, id: string, cssNames: ReadonlySet<string>): readonly CssCallSite[] {
		return this.scanner([]).findCallSites(code, id, cssNames);
	}

	diagnose(code: string, id: string, cssNames: ReadonlySet<string>): readonly CssDiagnostic[] {
		return (this.dependencies.diagnostics ?? new CssDiagnosticScanner()).diagnose(
			code,
			id,
			cssNames,
		);
	}

	findAuthoredImports(code: string, id: string): readonly AuthoredCssImport[] {
		return this.scanner([]).findAuthoredImports(code, id);
	}

	extract(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
	): readonly ExtractedCssStyle[] {
		return this.extraction([], preset).extract(code, id, cssNames);
	}

	extractFile(
		code: string,
		id: string,
		matchers: Array<string | RegExp>,
		preset: CssPreset,
	): CssFileExtraction {
		return this.extraction(matchers, preset).extractFile(code, id);
	}

	inline(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
		className: AnyClassNameStrategy,
	): InlineCssResult {
		return this.extraction([], preset, className).inline(code, id, cssNames);
	}
}

export const createCssSourceService = (
	dependencies: CssSourceServiceDependencies = {},
): CssSourceService => new DefaultCssSourceService(dependencies);
