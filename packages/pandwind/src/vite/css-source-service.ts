import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import type {
	CssPreset,
	CssFileExtraction,
	CssSourceInspection,
	CssCallSite,
	CssDiagnostic,
	ExtractedCssStyle,
	AuthoredCssImport,
	InlineCssResult,
} from "./css-extract.ts";
import {
	createCssExtractionPipeline,
	type CssExtractionPipeline,
} from "./css-extraction-pipeline.ts";
import type { CssExtractionPorts } from "./css-extraction-ports.ts";

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

/** Shared source-facing CSS service used by Vite, unplugin, and analyzers. */
class DefaultCssSourceService implements CssSourceService {
	constructor(private readonly pipeline: CssExtractionPipeline = createCssExtractionPipeline()) {}

	findCssImports(code: string, id: string, matchers: Array<string | RegExp>): ReadonlySet<string> {
		return this.pipeline.findImports(code, id, matchers);
	}

	inspect(code: string, id: string, matchers: Array<string | RegExp>): CssSourceInspection {
		return this.pipeline.inspect(code, id, matchers);
	}

	findCallSites(code: string, id: string, cssNames: ReadonlySet<string>): readonly CssCallSite[] {
		return this.pipeline.findCallSites(code, id, cssNames);
	}

	diagnose(code: string, id: string, cssNames: ReadonlySet<string>): readonly CssDiagnostic[] {
		return this.pipeline.diagnose(code, id, cssNames);
	}

	findAuthoredImports(code: string, id: string): readonly AuthoredCssImport[] {
		return this.pipeline.findAuthoredImports(code, id);
	}

	extract(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
	): readonly ExtractedCssStyle[] {
		return this.pipeline.extract(code, id, cssNames, preset);
	}

	extractFile(
		code: string,
		id: string,
		matchers: Array<string | RegExp>,
		preset: CssPreset,
	): CssFileExtraction {
		return this.pipeline.extractFile(code, id, matchers, preset);
	}

	inline(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
		className: AnyClassNameStrategy,
	): InlineCssResult {
		return this.pipeline.inline(code, id, cssNames, preset, className);
	}
}

export const createCssSourceService = (ports?: Partial<CssExtractionPorts>): CssSourceService =>
	new DefaultCssSourceService(createCssExtractionPipeline(ports));
