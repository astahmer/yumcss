/** Public façade for compile-time cx() folding. */
import type { TwConfig, OnUnresolved } from "./inline.ts";
import type { CxFoldContext, ConstantScope } from "./cx-static-evaluator.ts";
import {
	CxCallRewriter,
	type CxCompilerOptions,
	type CxCompilerPorts,
} from "./cx-call-rewriter.ts";
import { cxImportScanner, type CxImportInfo } from "./cx-import-scanner.ts";
import type { UnresolvedToken } from "./unresolved.ts";

export type {
	ConstantScope,
	CxFoldContext,
	KnownConstant,
	StaticEval,
} from "./cx-static-evaluator.ts";
export { collectModuleConstants, evalStaticCx } from "./cx-static-evaluator.ts";
export type { CxImportInfo } from "./cx-import-scanner.ts";
export type { CxCompilerOptions, CxCompilerPorts } from "./cx-call-rewriter.ts";
export { defaultCxCompilerPorts } from "./cx-call-rewriter.ts";

export interface InlineResult {
	readonly code: string;
	readonly inlined: number;
	readonly unresolved?: UnresolvedToken[];
}

export interface InlineCxCallsOptions extends CxCompilerOptions {
	readonly importedConstants?: ConstantScope;
	readonly fold?: CxFoldContext;
	readonly constants?: boolean;
	readonly partialFold?: boolean;
	readonly onUnresolved?: OnUnresolved;
}

export function findCxImports(
	code: string,
	id: string,
	isCxSource: (source: string) => boolean,
): CxImportInfo {
	return cxImportScanner.find(code, id, isCxSource);
}

export function inlineCxCalls(
	code: string,
	id: string,
	config: TwConfig,
	cxNames: ReadonlySet<string>,
	options: InlineCxCallsOptions = {},
	ports?: CxCompilerPorts,
): InlineResult {
	return new CxCallRewriter(ports).rewrite(code, id, config, cxNames, options);
}
