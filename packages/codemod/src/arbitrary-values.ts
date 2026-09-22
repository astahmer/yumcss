import type { PandwindMeta } from "./meta.ts";
import { collectStaticClassLiterals, type StaticClassLiteral } from "./class-sorter.ts";
import {
	TokenCatalog,
	tokenGroupsForProperty,
	type TokenCatalogMatch,
	type TokenCatalogNearestMatch,
} from "./swap/tokens.ts";
import { parseArbitraryToken, tokenizeClassList } from "./tokens.ts";

export interface ArbitraryValueSource {
	readonly file: string;
	readonly source: string;
}

export interface ArbitraryValueOccurrence {
	readonly file: string;
	/** Range of the static class literal containing the arbitrary token. */
	readonly start: number;
	readonly end: number;
	readonly token: string;
	readonly variants: readonly string[];
	readonly prefix: string | undefined;
	readonly property: string | undefined;
	readonly properties: readonly string[];
	readonly value: string;
}

export interface ArbitraryValueProposal {
	/** Stable report key: normalized properties and the arbitrary value. */
	readonly key: string;
	readonly value: string;
	readonly properties: readonly string[];
	readonly count: number;
	readonly files: readonly string[];
	readonly tokens: readonly string[];
	readonly occurrences: readonly ArbitraryValueOccurrence[];
	readonly exactTokens: readonly TokenCatalogMatch[];
	readonly nearestTokens: readonly TokenCatalogNearestMatch[];
}

export interface ArbitraryValueProposalOptions {
	readonly maxDistance?: number;
	readonly maxSuggestions?: number;
	readonly minOccurrences?: number;
}

export interface ArbitraryValueProposalReport {
	readonly occurrences: readonly ArbitraryValueOccurrence[];
	readonly proposals: readonly ArbitraryValueProposal[];
}

const propertyName = (value: string): string =>
	value
		.replace(/^-+/u, "")
		.replace(/-([a-z])/gu, (_, character: string) => character.toUpperCase());

const propertiesForPrefix = (meta: PandwindMeta, prefix: string): readonly string[] => {
	const conflicts = meta.conflicts.get(prefix);
	if (conflicts === undefined) return [];
	const values = conflicts["*"] ?? Object.values(conflicts).flat();
	return [...new Set(values.map(propertyName))].toSorted();
};

const propertiesForArbitrary = (
	meta: PandwindMeta,
	parsed: ReturnType<typeof parseArbitraryToken>,
): readonly string[] => {
	if (parsed === null) return [];
	if (parsed.property !== undefined) return [propertyName(parsed.property)];
	if (parsed.prefix === undefined) return [];
	return propertiesForPrefix(meta, parsed.prefix);
};

const groupsForProperties = (properties: readonly string[]): readonly string[] =>
	[...new Set(properties.flatMap((property) => tokenGroupsForProperty(property)))].toSorted();

const exactMatches = (
	catalog: TokenCatalog | undefined,
	properties: readonly string[],
	value: string,
): readonly TokenCatalogMatch[] => {
	if (catalog === undefined) return [];
	const groups = groupsForProperties(properties);
	return groups
		.map((group) => catalog.findUnique([group], value))
		.filter((match): match is TokenCatalogMatch => match !== undefined);
};

const nearestMatches = (
	catalog: TokenCatalog | undefined,
	properties: readonly string[],
	value: string,
	options: ArbitraryValueProposalOptions,
): readonly TokenCatalogNearestMatch[] => {
	if (catalog === undefined) return [];
	return catalog.nearest(groupsForProperties(properties), value, {
		maxDistance: options.maxDistance,
		maxResults: options.maxSuggestions,
	});
};

const occurrenceFromToken = (
	file: string,
	literal: StaticClassLiteral,
	token: string,
	meta: PandwindMeta,
): ArbitraryValueOccurrence | undefined => {
	const parsed = parseArbitraryToken(token, meta);
	if (parsed === null) return undefined;
	const properties = propertiesForArbitrary(meta, parsed);
	return {
		file,
		start: literal.start,
		end: literal.end,
		token,
		variants: parsed.variants,
		prefix: parsed.prefix,
		property:
			parsed.property === undefined
				? properties.length === 1
					? properties[0]
					: undefined
				: propertyName(parsed.property),
		properties,
		value: parsed.value,
	};
};

const occurrencesForSource = (
	source: ArbitraryValueSource,
	meta: PandwindMeta,
): readonly ArbitraryValueOccurrence[] => {
	const occurrences: ArbitraryValueOccurrence[] = [];
	for (const literal of collectStaticClassLiterals(source.source, source.file)) {
		for (const token of tokenizeClassList(literal.value)) {
			const occurrence = occurrenceFromToken(source.file, literal, token, meta);
			if (occurrence !== undefined) occurrences.push(occurrence);
		}
	}
	return occurrences;
};

const proposalKey = (occurrence: ArbitraryValueOccurrence): string =>
	`${occurrence.properties.join(",")}\u0000${occurrence.value}`;

export const extractArbitraryValueProposals = (
	sources: readonly ArbitraryValueSource[],
	meta: PandwindMeta,
	options: ArbitraryValueProposalOptions = {},
): ArbitraryValueProposalReport => {
	const occurrences = sources.flatMap((source) => occurrencesForSource(source, meta));
	const catalog = TokenCatalog.fromAnyTokens(meta.tokens);
	const grouped = new Map<string, ArbitraryValueOccurrence[]>();
	for (const occurrence of occurrences) {
		const key = proposalKey(occurrence);
		const group = grouped.get(key);
		if (group === undefined) grouped.set(key, [occurrence]);
		else group.push(occurrence);
	}
	const minimum = Math.max(1, options.minOccurrences ?? 1);
	const proposals = [...grouped.entries()]
		.filter(([, group]) => group.length >= minimum)
		.map(([key, group]) => {
			const first = group[0]!;
			const properties = first.properties;
			return {
				key,
				value: first.value,
				properties,
				count: group.length,
				files: [...new Set(group.map((occurrence) => occurrence.file))].toSorted(),
				tokens: [...new Set(group.map((occurrence) => occurrence.token))].toSorted(),
				occurrences: group,
				exactTokens: exactMatches(catalog, properties, first.value),
				nearestTokens: nearestMatches(catalog, properties, first.value, options),
			};
		})
		.toSorted((left, right) => right.count - left.count || left.key.localeCompare(right.key));
	return { occurrences, proposals };
};
