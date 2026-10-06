import { presetConditions } from "yumcss/preset";

type YumCSSConditionValue = string | readonly string[];

const isConditionSelector = (value: YumCSSConditionValue): value is string =>
	typeof value === "string";

const builtInConditionAliases = new Set(
	Object.keys(presetConditions)
		.filter((name) => name.startsWith("_"))
		.map((name) => name.slice(1)),
);

const selectorConditionAliases = new Map<string, string>();
for (const [name, selector] of Object.entries(presetConditions)) {
	if (!isConditionSelector(selector)) continue;
	for (const match of selector.matchAll(/(::?)([a-z][a-z-]*)/gu)) {
		const pseudo = match[2]!;
		if (pseudo === "is" || pseudo === "not" || pseudo === "where" || pseudo === "has") continue;
		const candidate = `&${match[1]}${pseudo}`;
		if (!selectorConditionAliases.has(candidate)) selectorConditionAliases.set(candidate, name);
	}
}

export const canonicalYumCSSConditionName = (name: string): string =>
	name.startsWith("_") || !builtInConditionAliases.has(name) ? name : `_${name}`;

export const isYumCSSConditionName = (name: string): boolean =>
	Object.hasOwn(presetConditions, canonicalYumCSSConditionName(name));

export const yumcssConditionNameForSelector = (selector: string): string | undefined => {
	const direct = selectorConditionAliases.get(selector);
	if (direct !== undefined) return direct;
	const normalized = selector.replaceAll('"', "").replaceAll("'", "");
	const direction = /^&:where\(\[dir=(ltr|rtl)\]\s+\*\)$/u.exec(normalized)?.[1];
	return direction === undefined ? undefined : `_${direction}`;
};

/** Keep built-in YumCSS conditions on their underscore spelling. */
export const canonicalizeYumCSSConditions = (
	conditions: Readonly<Record<string, YumCSSConditionValue>>,
): Record<string, YumCSSConditionValue> => {
	const canonical: Record<string, YumCSSConditionValue> = {};
	for (const [name, value] of Object.entries(conditions)) {
		const canonicalName = canonicalYumCSSConditionName(name);
		if (Object.hasOwn(canonical, canonicalName) && !name.startsWith("_")) continue;
		canonical[canonicalName] = value;
	}
	return canonical;
};
