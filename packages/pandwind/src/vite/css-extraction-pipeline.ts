import { SOURCE_SCANNER_SERVICE } from "../source-scanner.ts";
import {
	diagnoseCssSources,
	extractCssFile,
	extractCssSources,
	findAuthoredCssImports,
	findCssCallSites,
	findCssImports,
	inlineCssCalls,
	inspectCssSource,
	type CssPreset,
} from "./css-extract.ts";
import type {
	ArtifactExtractor,
	CallRewriter,
	CallSiteClassifier,
	CssExtractionPorts,
	DiagnosticReporter,
	ProvenanceProvider,
	SourceScanner,
} from "./css-extraction-ports.ts";
import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import type {
	CssSourceInspection,
	CssCallSite,
	AuthoredCssImport,
	CssDiagnostic,
	CssFileExtraction,
	ExtractedCssStyle,
	InlineCssResult,
} from "./css-extract.ts";

export interface CssExtractionPipeline extends CssExtractionPorts {
	findImports(code: string, id: string, matchers: Array<string | RegExp>): Set<string>;
	inspect(code: string, id: string, matchers: Array<string | RegExp>): CssSourceInspection;
	findCallSites(code: string, id: string, cssNames: ReadonlySet<string>): Array<CssCallSite>;
	findAuthoredImports(code: string, id: string): Array<AuthoredCssImport>;
	diagnose(code: string, id: string, cssNames: ReadonlySet<string>): Array<CssDiagnostic>;
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
	inline(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
		className: AnyClassNameStrategy,
	): InlineCssResult;
}

const defaultScanner: SourceScanner = {
	parse: (input) => SOURCE_SCANNER_SERVICE.parse(input),
	languageForFile: (file) => SOURCE_SCANNER_SERVICE.languageForFile(file),
};

const defaultProvenance: ProvenanceProvider = {
	locate(source, start, _end) {
		const before = source.slice(0, start);
		return { line: before.split("\n").length, column: start - before.lastIndexOf("\n") };
	},
};

const defaultClassifier: CallSiteClassifier = {
	findImports: findCssImports,
	inspect: inspectCssSource,
	findCallSites: findCssCallSites,
	findAuthoredImports: findAuthoredCssImports,
};

const defaultExtractor: ArtifactExtractor = {
	extract: extractCssSources,
	extractFile: extractCssFile,
};

const defaultDiagnostics: DiagnosticReporter = { diagnose: diagnoseCssSources };
const defaultRewriter: CallRewriter = { inline: inlineCssCalls };

const defaults: CssExtractionPorts = {
	scanner: defaultScanner,
	classifier: defaultClassifier,
	extractor: defaultExtractor,
	provenance: defaultProvenance,
	rewriter: defaultRewriter,
	diagnostics: defaultDiagnostics,
};

class DefaultCssExtractionPipeline implements CssExtractionPipeline {
	constructor(readonly ports: CssExtractionPorts = defaults) {}

	get scanner(): SourceScanner {
		return this.ports.scanner;
	}
	get classifier(): CallSiteClassifier {
		return this.ports.classifier;
	}
	get extractor(): ArtifactExtractor {
		return this.ports.extractor;
	}
	get provenance(): ProvenanceProvider {
		return this.ports.provenance;
	}
	get rewriter(): CallRewriter {
		return this.ports.rewriter;
	}
	get diagnostics(): DiagnosticReporter {
		return this.ports.diagnostics;
	}

	findImports(code: string, id: string, matchers: Array<string | RegExp>): Set<string> {
		return this.classifier.findImports(code, id, matchers);
	}
	inspect(code: string, id: string, matchers: Array<string | RegExp>): CssSourceInspection {
		return this.classifier.inspect(code, id, matchers);
	}
	findCallSites(code: string, id: string, cssNames: ReadonlySet<string>): Array<CssCallSite> {
		return this.classifier.findCallSites(code, id, cssNames);
	}
	findAuthoredImports(code: string, id: string): Array<AuthoredCssImport> {
		return this.classifier.findAuthoredImports(code, id);
	}
	diagnose(code: string, id: string, cssNames: ReadonlySet<string>): Array<CssDiagnostic> {
		return this.diagnostics.diagnose(code, id, cssNames);
	}
	extract(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
	): Array<ExtractedCssStyle> {
		return this.extractor.extract(code, id, cssNames, preset);
	}
	extractFile(
		code: string,
		id: string,
		matchers: Array<string | RegExp>,
		preset: CssPreset,
	): CssFileExtraction {
		return this.extractor.extractFile(code, id, matchers, preset);
	}
	inline(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
		className: AnyClassNameStrategy,
	): InlineCssResult {
		return this.rewriter.inline(code, id, cssNames, preset, className);
	}
}

export const createCssExtractionPipeline = (
	ports?: Partial<CssExtractionPorts>,
): CssExtractionPipeline => new DefaultCssExtractionPipeline({ ...defaults, ...ports });
