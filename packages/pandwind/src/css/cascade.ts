/** CSS cascade strategies for generated Pandwind rules. */
export type CssCascadeMode = "specificity" | "layers";

const CASCADE_LAYER_NAME = "pandwind";

const SPECIFICITY_MARKER = ":not(#\\#)";

/**
 * Add one StyleX-compatible specificity level to a serialized style rule.
 * The marker contributes an ID selector without adding a matching element.
 */
export const addSpecificityLevel = (css: string, level: number): string => {
	if (level <= 0 || css.startsWith("@keyframes")) return css;
	const firstOpening = css.indexOf("{");
	if (css.startsWith("@") && firstOpening === css.lastIndexOf("{")) return css;
	const marker = SPECIFICITY_MARKER.repeat(level);
	const insertionPoint = css.includes("::") ? css.indexOf("::") : css.lastIndexOf("{");
	if (insertionPoint < 0) return css;
	return `${css.slice(0, insertionPoint)}${marker}${css.slice(insertionPoint)}`;
};

/** Decorate a complete rule set with stable StyleX-like priority bands. */
export const decorateCascadeRules = <TRule extends { css: string; priority: number }>(
	rules: readonly TRule[],
	mode: CssCascadeMode | undefined,
	priorityUniverse: readonly TRule[] = rules,
): readonly TRule[] => {
	if (mode !== "specificity" || rules.length === 0) return rules;
	const priorities = Array.from(new Set(priorityUniverse.map((rule) => rule.priority))).toSorted(
		(left, right) => left - right,
	);
	// StyleX starts its first band at zero because its compiler controls both
	// sides of the comparison. Pandwind starts at one so the opt-in mode also
	// beats an ordinary one-class host rule in the first generated band.
	const levels = new Map(priorities.map((priority, index) => [priority, index + 1] as const));
	return rules.map((rule) => {
		const level = levels.get(rule.priority);
		return level === undefined ? rule : { ...rule, css: addSpecificityLevel(rule.css, level) };
	});
};

export const wrapCascadeLayer = (css: string, mode: CssCascadeMode | undefined): string =>
	mode === "layers" && css !== "" ? `@layer ${CASCADE_LAYER_NAME}{${css}}` : css;
