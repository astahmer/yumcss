type PresetRecord = Readonly<Record<string, unknown>>;

export type PresetTokenVocabulary = Readonly<
	Record<string, Readonly<Record<string, string>>>
>;

const isRecord = (value: unknown): value is PresetRecord =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Return the authored token names accepted by each property in a resolved preset. */
export const presetTokenVocabularyByProperty = (preset: unknown): PresetTokenVocabulary => {
	if (!isRecord(preset) || !isRecord(preset.properties)) return {};
	const tokenGroups = isRecord(preset.tokens) ? preset.tokens : {};
	const namesToIds = new Map<string, string[]>();
	for (const group of Object.keys(tokenGroups).toSorted()) {
		const tokens = tokenGroups[group];
		if (!isRecord(tokens)) continue;
		for (const name of Object.keys(tokens).toSorted()) {
			const ids = namesToIds.get(name) ?? [];
			ids.push(`${group}::${name}`);
			namesToIds.set(name, ids);
		}
	}

	const vocabulary: Record<string, Record<string, string>> = {};
	for (const property of Object.keys(preset.properties).toSorted()) {
		const propertyConfig = preset.properties[property];
		if (!isRecord(propertyConfig)) continue;
		const propertyVocabulary: Record<string, string> = {};
		for (const name of Object.keys(propertyConfig).toSorted()) {
			if (name === "$tokens") {
				const group = propertyConfig[name];
				if (typeof group !== "string" || !isRecord(tokenGroups[group])) continue;
				for (const tokenName of Object.keys(tokenGroups[group]).toSorted()) {
					const ids = namesToIds.get(tokenName) ?? [];
					propertyVocabulary[tokenName] = ids.length === 1 ? ids[0]! : `$${tokenName}`;
				}
				continue;
			}
			if (name.startsWith("$")) continue;
			const ids = namesToIds.get(name) ?? [];
			propertyVocabulary[name] = ids.length === 1 ? ids[0]! : `$${name}`;
		}
		if (Object.keys(propertyVocabulary).length > 0)
			vocabulary[property] = propertyVocabulary;
	}
	return vocabulary;
};
