/** CSS cascade strategies for generated Pandwind rules. */
export type CssCascadeMode = "specificity" | "layers";

/** Options for a named native cascade layer for generated Pandwind rules. */
export interface CssCascadeLayerOptions {
	readonly mode: "layers";
	readonly layer: string;
}

/** Cascade policy accepted by CSS factories, sheets, and extractors. */
export type CssCascade = CssCascadeMode | CssCascadeLayerOptions;

export const DEFAULT_CASCADE_LAYER = "pandwind";

const CASCADE_LAYER_SEGMENT =
	/^(?:-?(?:[A-Za-z_]|[^\u0000-\u007F])(?:[A-Za-z0-9_-]|[^\u0000-\u007F])*|--(?:[A-Za-z0-9_-]|[^\u0000-\u007F])+)$/u;

export const isValidCascadeLayerName = (value: string): boolean =>
	value.length > 0 && value.split(".").every((segment) => CASCADE_LAYER_SEGMENT.test(segment));

export interface ResolvedCssCascade {
	readonly mode: CssCascadeMode | undefined;
	readonly layer: string | undefined;
}

export const resolveCssCascade = (cascade: CssCascade | undefined): ResolvedCssCascade => {
	if (cascade === undefined) return { mode: undefined, layer: undefined };
	if (cascade === "specificity") return { mode: "specificity", layer: undefined };
	if (cascade === "layers") return { mode: "layers", layer: DEFAULT_CASCADE_LAYER };
	if (
		cascade.mode !== "layers" ||
		typeof cascade.layer !== "string" ||
		!isValidCascadeLayerName(cascade.layer)
	)
		throw new Error("pandwind: cascade layer must be a non-empty dotted CSS identifier path");
	return { mode: "layers", layer: cascade.layer };
};

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
	const target = css.includes("::") ? "::" : "{";
	return css.replace(target, `${marker}${target}`);
};

/** Decorate a complete rule set with stable StyleX-like priority bands. */
export const decorateCascadeRules = <TRule extends { css: string; priority: number }>(
	rules: readonly TRule[],
	cascade: CssCascade | undefined,
	priorityUniverse: readonly TRule[] = rules,
): readonly TRule[] => {
	const { mode } = resolveCssCascade(cascade);
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

export const wrapCascadeLayer = (css: string, cascade: CssCascade | undefined): string => {
	const { mode, layer } = resolveCssCascade(cascade);
	return mode === "layers" && css !== "" ? `@layer ${layer}{${css}}` : css;
};
