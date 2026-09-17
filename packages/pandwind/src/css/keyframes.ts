import murmurHash from "../lib/murmur-hash2.ts";
import type { StyleObject } from "../types/typings.ts";

/** Declarations authored for one `@keyframes` step. */
export type KeyframeStep = StyleObject;
/** Steps authored for one `css.keyframes(...)` body, keyed by `from`, `to`, or a percentage. */
export type KeyframeBody = Record<string, KeyframeStep>;

/** One step of a keyframe body after `from`/`to` normalization. */
export interface NormalizedKeyframeStep {
	readonly name: string;
	readonly declarations: KeyframeStep;
}

const DEFAULT_KEYFRAMES_NAMESPACE = "pw";

export const normalizeKeyframeStepName = (step: string): string =>
	step === "from" ? "0%" : step === "to" ? "100%" : step;

const stepPosition = (name: string): number | undefined => {
	const position = Number.parseFloat(name);
	return Number.isFinite(position) ? position : undefined;
};

/** Numeric positions first, in ascending order; named steps follow in code-unit order. */
export const compareKeyframeStepNames = (left: string, right: string): number => {
	const leftPosition = stepPosition(left);
	const rightPosition = stepPosition(right);
	if (leftPosition !== undefined && rightPosition !== undefined) {
		if (leftPosition !== rightPosition) return leftPosition - rightPosition;
	} else if (leftPosition !== undefined) return -1;
	else if (rightPosition !== undefined) return 1;
	return left < right ? -1 : left > right ? 1 : 0;
};

export const normalizeKeyframeSteps = (body: KeyframeBody): NormalizedKeyframeStep[] =>
	Object.entries(body)
		.map(([step, declarations]) => ({ name: normalizeKeyframeStepName(step), declarations }))
		.toSorted((left, right) => compareKeyframeStepNames(left.name, right.name));

const isFlatKeyframeDeclarations = (value: unknown): value is KeyframeStep =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.values(value).every(
		(declaration) =>
			typeof declaration !== "object" || declaration === null || Array.isArray(declaration),
	);

/**
 * True for a body the build lane can emit: one declaration map per step and no
 * nested selector inside a step. A step has no selector, so a nested condition
 * could only be dropped silently; those bodies stay on the runtime call and
 * remain visible to diagnostics.
 */
export const isLiteralKeyframeBody = (value: unknown): value is KeyframeBody =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.values(value).every(isFlatKeyframeDeclarations);

const canonicalDeclarations = (declarations: KeyframeStep): unknown =>
	typeof declarations === "object" && declarations !== null
		? Object.keys(declarations)
				.toSorted()
				.map((property) => [property, declarations[property]])
		: declarations;

/**
 * Deterministic form of an authored keyframe body. `from`/`to` spellings,
 * step order, and declaration order carry no CSS semantics here, so both the
 * runtime factory and the build lane derive one name from one canonical body.
 */
export const canonicalKeyframeBody = (body: KeyframeBody): string =>
	JSON.stringify(
		normalizeKeyframeSteps(body).map(({ name, declarations }) => [
			name,
			canonicalDeclarations(declarations),
		]),
	);

/** Animation name for an authored body: `${namespace}-kf-${hash}`. */
export const keyframeName = (body: KeyframeBody, namespace = DEFAULT_KEYFRAMES_NAMESPACE): string =>
	`${namespace}-kf-${murmurHash(canonicalKeyframeBody(body))}`;
