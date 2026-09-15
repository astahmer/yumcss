import { presetConditions } from "pandwind/preset";

type PandwindConditionValue = string | readonly string[];

const builtInConditionAliases = new Set(
	Object.keys(presetConditions)
		.filter((name) => name.startsWith("_"))
		.map((name) => name.slice(1)),
);

const canonicalConditionName = (name: string): string =>
	name.startsWith("_") || !builtInConditionAliases.has(name) ? name : `_${name}`;

/** Keep built-in Pandwind conditions on their underscore spelling. */
export const canonicalizePandwindConditions = (
	conditions: Readonly<Record<string, PandwindConditionValue>>,
): Record<string, PandwindConditionValue> => {
	const canonical: Record<string, PandwindConditionValue> = {};
	for (const [name, value] of Object.entries(conditions)) {
		const canonicalName = canonicalConditionName(name);
		if (Object.hasOwn(canonical, canonicalName) && !name.startsWith("_")) continue;
		canonical[canonicalName] = value;
	}
	return canonical;
};
