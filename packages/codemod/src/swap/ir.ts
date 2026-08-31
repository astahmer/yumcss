/**
 * The swap pivot IR (plans/022) — the neutral intermediate every source API
 * parses into and every target API emits from. Deliberately the same level
 * as the backends IR of plan 021: flat, condition-nested, RESOLVED.
 *
 * Conversions are lossless-in-intent: anything a target cannot represent is
 * carried in `residuals` and re-emitted verbatim next to a skip marker,
 * never silently dropped.
 */

/** One resolved declaration: `conditions + prop + value`. */
export interface SwapEntry {
	/** Variant chain, OUTERMOST first: ["hover", "dark"]. Bare props = []. */
	conditions: string[];
	/** camelCase canonical CSS property. */
	prop: string;
	/**
	 * Resolved value as written by the source (design-vocab entries carry
	 * concrete values — `#3182ce` — because resolveDesignStyle already ran;
	 * css-literal entries keep the authored text, tokens included).
	 */
	value: string | true | number;
}

export type SwapResidualKind =
	/** A non-literal value (identifier, template literal, spread). */
	| "dynamic"
	/** No typed utility / bridge coverage for this pair in the target. */
	| "unknown-value"
	/** The target API has no representation for this declaration at all. */
	| "unrepresentable";

export interface SwapResidual {
	kind: SwapResidualKind;
	/** The offending source text (call fragment / utility / value). */
	text: string;
	/** Human hint for --report and the skip-marker comment. */
	hint?: string;
	/**
	 * The target kept this semantic in an explicit escape hatch or runtime
	 * carrier. Preserved residuals remain reportable, but do not invalidate the
	 * replacement; every other residual is fail-closed by the swap runner.
	 */
	preserved?: boolean;
}

export interface SwapIR {
	entries: SwapEntry[];
	residuals: SwapResidual[];
}
