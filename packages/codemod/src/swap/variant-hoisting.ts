import type { YumCSSMeta } from "../meta.ts";

export type VariantTarget = "tw" | "design";

const DATA_ARIA_VARIANT = /^(?:group|peer)-(?:data|aria)-\[/u;

const isKnownVariant = (meta: YumCSSMeta, value: string): boolean =>
	meta.variants.has(value) || DATA_ARIA_VARIANT.test(value) || value === "*" || value === "**";

const normalizeConditionName = (value: string): string => value.replace(/^_+/u, "");

const compoundVariantPath = (meta: YumCSSMeta, value: string): readonly string[] | undefined => {
	if (value.includes(":")) {
		const parts = value.split(":").map(normalizeConditionName);
		return parts.every((part) => isKnownVariant(meta, part)) ? parts : undefined;
	}
	if (isKnownVariant(meta, value)) return [value];
	const parts = value.split("-");
	if (
		parts.length === 2 &&
		parts.every((part) => isKnownVariant(meta, normalizeConditionName(part)))
	)
		return parts.map(normalizeConditionName);
	return undefined;
};

/**
 * Normalize the condition spelling used by one styling dialect into the
 * outermost-first condition path carried by SwapIR.
 */
export const variantPathForKey = (meta: YumCSSMeta, key: string): readonly string[] | undefined =>
	compoundVariantPath(meta, normalizeConditionName(key));

/** Normalize every condition in an IR entry without accepting unknown variants. */
export const normalizeVariantPath = (
	meta: YumCSSMeta,
	conditions: readonly string[],
): readonly string[] | undefined => {
	const normalized: string[] = [];
	for (const condition of conditions) {
		const path = variantPathForKey(meta, condition);
		if (path === undefined) return undefined;
		normalized.push(...path);
	}
	return normalized;
};

/** Render one condition key for a target's native nested-object spelling. */
export const variantKeyForTarget = (condition: string, target: VariantTarget): string => {
	if (condition.startsWith("&") || condition.startsWith("@")) return condition;
	return target === "design" ? `_${condition}` : condition;
};
