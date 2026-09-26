import type {
	TokenDocument,
	TokenEntry,
	TokenGroup,
	TokenJsonValue,
	TokenMetadata,
	TokenResolverDocument,
	TokenValue,
} from "./token-document.ts";

const serializeValue = (value: TokenValue): TokenJsonValue => {
	switch (value.kind) {
		case "string":
		case "number":
		case "boolean":
			return value.value;
		case "null":
			return null;
		case "reference":
			return value.syntax === "json-pointer" ? { $ref: value.target } : value.authored;
		case "array":
			return value.items.map(serializeValue);
		case "object":
			return Object.fromEntries(
				Object.entries(value.entries).map(([key, entry]) => [key, serializeValue(entry)]),
			);
		case "contextual":
			throw new Error(
				"DTCG cannot serialize contextual values without an explicit context selection",
			);
	}
};

const serializeMetadata = (metadata: TokenMetadata): Record<string, TokenJsonValue> => ({
	...(metadata.type === undefined ? {} : { $type: metadata.type }),
	...(metadata.description === undefined ? {} : { $description: metadata.description }),
	...(metadata.deprecated === undefined ? {} : { $deprecated: metadata.deprecated }),
	...(metadata.extensions === undefined ? {} : { $extensions: metadata.extensions }),
	...metadata.sourceMetadata,
});

const serializeEntry = (entry: TokenEntry): Record<string, TokenJsonValue> => ({
	...serializeMetadata(entry),
	...(entry.value.kind === "reference" && entry.value.syntax === "json-pointer"
		? { $ref: entry.value.target }
		: { $value: serializeValue(entry.value) }),
});

const serializeGroup = (group: TokenGroup): Record<string, TokenJsonValue> => ({
	...serializeMetadata(group),
	...(group.extends === undefined ? {} : { $extends: group.extends }),
	...(group.root === undefined ? {} : { $root: serializeEntry(group.root) }),
	...Object.fromEntries(
		Object.entries(group.children).map(([key, child]) => [
			key,
			child.kind === "token" ? serializeEntry(child) : serializeGroup(child),
		]),
	),
});

/** Serialize a previously validated document as DTCG 2025.10 JSON. */
export const serializeDtcgTokenDocument = (document: TokenDocument): string =>
	`${JSON.stringify(serializeGroup(document.root), null, "\t")}\n`;

/** Serialize a validated Resolver sidecar, retaining its authored source shape. */
export const serializeTokenResolverDocument = (resolver: TokenResolverDocument): string =>
	`${JSON.stringify(
		resolver.sourceDocument ?? {
			...resolver.sourceMetadata,
			version: resolver.version,
			...(resolver.name === undefined ? {} : { name: resolver.name }),
			...(resolver.description === undefined ? {} : { description: resolver.description }),
			sets: Object.fromEntries(
				Object.entries(resolver.sets).map(([id, set]) => [
					id,
					{
						...set.sourceMetadata,
						sources: set.sources,
					},
				]),
			),
			modifiers: Object.fromEntries(
				Object.entries(resolver.modifiers).map(([id, modifier]) => [
					id,
					{
						...modifier.sourceMetadata,
						contexts: modifier.contexts,
						...(modifier.default === undefined ? {} : { default: modifier.default }),
					},
				]),
			),
			resolutionOrder: resolver.resolutionOrder,
		},
		null,
		"\t",
	)}\n`;
