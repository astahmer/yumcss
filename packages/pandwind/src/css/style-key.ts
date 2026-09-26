export type StyleConditions = Readonly<Record<string, string | readonly string[]>>;

const isConditionPathPart = (part: string, conditions: StyleConditions): boolean =>
	part.startsWith("_") || Object.hasOwn(conditions, part) || /[&>+~:[\],.#*\s]/.test(part);

export const isEmptyCondition = (part: string, conditions: StyleConditions): boolean => {
	const value = conditions[part];
	return value === "" || (Array.isArray(value) && value.every((item) => item === ""));
};

/** Find the CSS property in a flattened condition/property path. */
export const cssPropertyFromKey = (key: string, conditions: StyleConditions = {}): string => {
	if (!key.includes("__")) return key;
	const parts = key.split("__");
	for (let index = parts.length - 1; index >= 0; index -= 1) {
		const part = parts[index]!;
		if (!isConditionPathPart(part, conditions)) return part;
	}
	return parts.at(-1) ?? "";
};

/** Canonicalize a flattened path with condition segments before its property. */
export const canonicalStyleKey = (key: string, conditions: StyleConditions = {}): string => {
	if (!key.includes("__")) return key;
	const parts = key.split("__").filter((part) => part !== "");
	if (parts.length < 2) return parts[0] ?? "";
	const property = cssPropertyFromKey(key, conditions);
	const propertyIndex = parts.lastIndexOf(property);
	if (propertyIndex < 0) return parts.toSorted().join("__");
	const conditionParts = parts
		.filter((_part, index) => index !== propertyIndex)
		.filter((part) => !isEmptyCondition(part, conditions))
		.toSorted();
	conditionParts.push(property);
	return conditionParts.join("__");
};
