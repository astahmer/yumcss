import { isSafeCssValue, normalizeCssValue } from "./value-normalization.ts";

const FIRST_THAT_WORKS_PREFIX = "\u0000yumcss:first-that-works:";

declare const firstThatWorksBrand: unique symbol;

/** Opaque CSS value carrying an ordered fallback declaration list. */
export type FirstThatWorksValue = string & {
	readonly [firstThatWorksBrand]: true;
};

type FirstThatWorksScalar = string | number;
type FirstThatWorksArguments = readonly [
	FirstThatWorksScalar,
	FirstThatWorksScalar,
	...FirstThatWorksScalar[],
];

/**
 * Create a CSS fallback chain whose first value is preferred by the browser.
 * YumCSS emits the values in reverse order so later, more capable
 * declarations win when the browser supports them.
 *
 * @example
 * ```ts
 * import { createCss, firstThatWorks } from "yumcss/css";
 *
 * const css = createCss(preset);
 * css.class({ position: firstThatWorks("sticky", "-webkit-sticky", "fixed") });
 * ```
 *
 * @param values - At least two non-empty strings or finite numbers, ordered
 *   from the preferred value to the oldest fallback.
 * @returns An opaque value accepted by CSS style properties.
 * @category styling
 * @since 0.1.0
 */
export const firstThatWorks = (...values: FirstThatWorksArguments): FirstThatWorksValue => {
	if (values.length < 2 || values.some((value) => !isSafeCssValue(value))) {
		throw new Error(
			"yumcss: firstThatWorks requires at least two non-empty strings or finite numbers.",
		);
	}
	return `${FIRST_THAT_WORKS_PREFIX}${JSON.stringify(values)}` as FirstThatWorksValue;
};

export const encodeFirstThatWorks = (values: readonly FirstThatWorksScalar[]): string =>
	`${FIRST_THAT_WORKS_PREFIX}${JSON.stringify(values)}`;

export const decodeFirstThatWorks = (
	value: string,
): readonly FirstThatWorksScalar[] | undefined => {
	if (!value.startsWith(FIRST_THAT_WORKS_PREFIX)) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(value.slice(FIRST_THAT_WORKS_PREFIX.length));
	} catch {
		return undefined;
	}
	if (!Array.isArray(parsed) || parsed.length < 2 || parsed.some((entry) => !isSafeCssValue(entry)))
		return undefined;
	return parsed;
};

export const isEncodedFirstThatWorks = (value: unknown): value is FirstThatWorksValue =>
	typeof value === "string" && decodeFirstThatWorks(value) !== undefined;

export const isCompilableCssValue = (value: unknown): value is string | number =>
	isSafeCssValue(value) || isEncodedFirstThatWorks(value);

export const normalizeFirstThatWorks = (
	property: string,
	value: string | number,
	normalize: (property: string, value: string | number) => string = normalizeCssValue,
): string => {
	if (typeof value !== "string") return normalize(property, value);
	const values = decodeFirstThatWorks(value);
	if (values === undefined) return normalize(property, value);
	return encodeFirstThatWorks(values.map((entry) => normalize(property, entry)));
};
