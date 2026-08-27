/** Compatibility projection; the shared scanner lives in the core pandwind package. */
export {
	SOURCE_SCANNER,
	SOURCE_SCANNER_SCHEMA,
	SOURCE_LANGUAGE_ADAPTERS,
	computeExcludedRanges,
	createSourceScannerRegistry,
	parseSourceProgram,
} from "pandwind/source";
export type {
	SourceDocument,
	SourceLanguage,
	SourceLanguageAdapter,
	SourceRange,
	SourceScanDiagnostic,
	SourceScanResult,
	SourceScannerRegistry,
} from "pandwind/source";
