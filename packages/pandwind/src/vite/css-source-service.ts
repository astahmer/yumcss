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
	diagnoseCssSources,
	extractCssFile,
	extractCssSources,
	findAuthoredCssImports,
	findCssCallSites,
	findCssImports,
	inlineCssCalls,
	inspectCssSource,
} from "./css-extract.ts";

export interface CssSourceService {
	findCssImports(code: string, id: string, matchers: Array<string | RegExp>): Set<string>;
	inspect(code: string, id: string, matchers: Array<string | RegExp>): CssSourceInspection;
	findCallSites(code: string, id: string, cssNames: ReadonlySet<string>): Array<CssCallSite>;
	diagnose(code: string, id: string, cssNames: ReadonlySet<string>): Array<CssDiagnostic>;
	findAuthoredImports(code: string, id: string): Array<AuthoredCssImport>;
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

/** Shared source-facing CSS service used by Vite, unplugin, and analyzers. */
export class DefaultCssSourceService implements CssSourceService {
	findCssImports(code: string, id: string, matchers: Array<string | RegExp>): Set<string> {
		return findCssImports(code, id, matchers);
	}

	inspect(code: string, id: string, matchers: Array<string | RegExp>): CssSourceInspection {
		return inspectCssSource(code, id, matchers);
	}

	findCallSites(code: string, id: string, cssNames: ReadonlySet<string>): Array<CssCallSite> {
		return findCssCallSites(code, id, cssNames);
	}

	diagnose(code: string, id: string, cssNames: ReadonlySet<string>): Array<CssDiagnostic> {
		return diagnoseCssSources(code, id, cssNames);
	}

	findAuthoredImports(code: string, id: string): Array<AuthoredCssImport> {
		return findAuthoredCssImports(code, id);
	}

	extract(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
	): Array<ExtractedCssStyle> {
		return extractCssSources(code, id, cssNames, preset);
	}

	extractFile(
		code: string,
		id: string,
		matchers: Array<string | RegExp>,
		preset: CssPreset,
	): CssFileExtraction {
		return extractCssFile(code, id, matchers, preset);
	}

	inline(
		code: string,
		id: string,
		cssNames: ReadonlySet<string>,
		preset: CssPreset,
		className: AnyClassNameStrategy,
	): InlineCssResult {
		return inlineCssCalls(code, id, cssNames, preset, className);
	}
}

export const createCssSourceService = (): CssSourceService => new DefaultCssSourceService();
