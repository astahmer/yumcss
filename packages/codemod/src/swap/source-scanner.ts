/** Compatibility projection; the shared scanner lives in the core pandwind package. */
export {
	SOURCE_SCANNER,
	SOURCE_SCANNER_SERVICE,
	SOURCE_SCANNER_SCHEMA,
	SOURCE_LANGUAGE_ADAPTERS,
	computeExcludedRanges,
	createSourceScannerRegistry,
	isScriptSourceFile,
	isSupportedSourceFile,
	parseSourceProgram,
	sourceLanguageForFile,
} from "pandwind/source";
export type {
	SourceDocument,
	SourceFramework,
	SourceLanguage,
	SourceLanguageAdapter,
	SourceRange,
	SourceScanDiagnostic,
	SourceScanResult,
	SourceScannerRegistry,
	SourceScannerService,
} from "pandwind/source";
