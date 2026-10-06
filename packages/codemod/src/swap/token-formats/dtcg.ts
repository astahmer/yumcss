import {
	TokenFormatId,
	type TokenFormatAdapter,
	type TokenFormatExportOptions,
	type TokenFormatLoss,
} from "../token-format-contracts.ts";
import {
	createTokenDocument,
	parseDtcgResolverDocument,
	parseDtcgTokenDocument,
	TokenDocumentValidationError,
	serializeDtcgTokenDocument,
	serializeTokenResolverDocument,
	type TokenDocument,
	type TokenEntry,
	type TokenGroup,
	type TokenJsonValue,
	type TokenNode,
	type TokenValue,
} from "../token-document.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const contextValues = (document: TokenDocument): ReadonlyMap<string, ReadonlySet<string>> => {
	const sources = new Map<string, Set<string>>();
	const visitValue = (value: TokenValue): void => {
		if (value.kind === "contextual") {
			const contexts = sources.get(value.source) ?? new Set<string>();
			Object.keys(value.values).forEach((context) => contexts.add(context));
			sources.set(value.source, contexts);
		} else if (value.kind === "array") value.items.forEach(visitValue);
		else if (value.kind === "object") Object.values(value.entries).forEach(visitValue);
	};
	const visitGroup = (group: TokenGroup): void => {
		if (group.root !== undefined) visitValue(group.root.value);
		for (const child of Object.values(group.children)) {
			if (child.kind === "token") visitValue(child.value);
			else visitGroup(child);
		}
	};
	visitGroup(document.root);
	return sources;
};

const containsContextualValue = (value: TokenValue): boolean => {
	if (value.kind === "contextual") return true;
	if (value.kind === "array") return value.items.some(containsContextualValue);
	if (value.kind === "object") return Object.values(value.entries).some(containsContextualValue);
	return false;
};

const nestedContextLosses = (document: TokenDocument): readonly TokenFormatLoss[] => {
	const losses: TokenFormatLoss[] = [];
	const pointer = (segments: readonly string[]): string =>
		`/${segments.map((segment) => segment.replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
	const visitValue = (
		value: TokenValue,
		segments: readonly string[],
		tokenValue: boolean,
	): void => {
		if (value.kind === "contextual") {
			if (!tokenValue)
				losses.push({
					path: pointer(segments),
					feature: "nested resolver context",
					reason:
						"DTCG Resolver sidecars project one whole token value per context; nested contextual values cannot be represented safely",
				});
			return;
		}
		if (value.kind === "array") {
			value.items.forEach((item, index) => visitValue(item, [...segments, String(index)], false));
			return;
		}
		if (value.kind === "object")
			for (const [name, child] of Object.entries(value.entries))
				visitValue(child, [...segments, name], false);
	};
	const visitEntry = (entry: TokenEntry, segments: readonly string[]): void => {
		visitValue(entry.value, [...segments, "$value"], true);
	};
	const visitGroup = (group: TokenGroup, segments: readonly string[]): void => {
		if (group.root !== undefined) visitEntry(group.root, [...segments, "$root"]);
		for (const [name, child] of Object.entries(group.children)) {
			if (child.kind === "token") visitEntry(child, [...segments, name]);
			else visitGroup(child, [...segments, name]);
		}
	};
	visitGroup(document.root, []);
	return losses;
};

const projectValue = (
	value: TokenValue,
	context: string | undefined,
	source: string | undefined,
	base: boolean,
): TokenValue | undefined => {
	if (value.kind === "contextual") {
		if (base) return value.values.base;
		if (source !== value.source || context === undefined) return undefined;
		return value.values[context];
	}
	if (!base) return undefined;
	if (value.kind === "array") {
		const items = value.items.map((item) => projectValue(item, context, source, base));
		return items.some((item) => item === undefined)
			? undefined
			: { kind: "array", items: items.flatMap((item) => (item === undefined ? [] : [item])) };
	}
	if (value.kind === "object") {
		const entries = Object.entries(value.entries).map(
			([key, item]) => [key, projectValue(item, context, source, base)] as const,
		);
		if (entries.some(([, item]) => item === undefined)) return undefined;
		return {
			kind: "object",
			entries: Object.fromEntries(entries.map(([key, item]) => [key, item!])),
		};
	}
	return value;
};

const projectEntry = (
	entry: TokenEntry,
	context: string | undefined,
	source: string | undefined,
	base: boolean,
): TokenEntry | undefined => {
	if (entry.value.kind !== "contextual" && containsContextualValue(entry.value)) return undefined;
	const value = projectValue(entry.value, context, source, base);
	return value === undefined ? undefined : { ...entry, value };
};

const projectGroup = (
	group: TokenGroup,
	context: string | undefined,
	source: string | undefined,
	base: boolean,
): TokenGroup => {
	const children: Record<string, TokenNode> = {};
	for (const [name, child] of Object.entries(group.children)) {
		if (child.kind === "token") {
			const entry = projectEntry(child, context, source, base);
			if (entry !== undefined) children[name] = entry;
		} else children[name] = projectGroup(child, context, source, base);
	}
	const root =
		group.root === undefined ? undefined : projectEntry(group.root, context, source, base);
	const { root: _root, ...groupWithoutRoot } = group;
	return {
		...groupWithoutRoot,
		...(root === undefined ? {} : { root }),
		children,
	};
};

const removeAtPath = (group: TokenGroup, segments: readonly string[]): TokenGroup => {
	const [name, ...remaining] = segments;
	if (name === undefined) return group;
	if (name === "$root") {
		if (group.root === undefined) return group;
		const { root: _root, ...rest } = group;
		return rest;
	}
	if (name.startsWith("$")) {
		switch (name) {
			case "$type": {
				const { type: _type, ...rest } = group;
				return rest;
			}
			case "$description": {
				const { description: _description, ...rest } = group;
				return rest;
			}
			case "$deprecated": {
				const { deprecated: _deprecated, ...rest } = group;
				return rest;
			}
			case "$extensions": {
				const { extensions: _extensions, ...rest } = group;
				return rest;
			}
			case "$extends": {
				const { extends: _extends, ...rest } = group;
				return rest;
			}
			case "$ref": {
				const { sourceMetadata, ...rest } = group;
				if (sourceMetadata === undefined) return group;
				const { $ref: _reference, ...remainingMetadata } = sourceMetadata;
				return {
					...rest,
					...(Object.keys(remainingMetadata).length === 0
						? {}
						: { sourceMetadata: remainingMetadata }),
				};
			}
			default:
				return group;
		}
	}
	const child = group.children[name];
	if (child === undefined) return group;
	if (child.kind === "token" || remaining.length === 0) {
		const children = { ...group.children };
		delete children[name];
		return { ...group, children };
	}
	const nextChild = removeAtPath(child, remaining);
	return nextChild === child
		? group
		: { ...group, children: { ...group.children, [name]: nextChild } };
};

const validatedProjection = (
	input: TokenDocument,
): {
	readonly document: TokenDocument;
	readonly text: string;
	readonly losses: readonly TokenFormatLoss[];
} => {
	let document = input;
	const losses: TokenFormatLoss[] = [];
	const maximumAttempts = 1 + JSON.stringify(input.root).length;
	for (let attempt = 0; attempt < maximumAttempts; attempt++) {
		const text = serializeDtcgTokenDocument(document);
		try {
			return { document: parseDtcgTokenDocument(text), text, losses };
		} catch (error) {
			if (!(error instanceof TokenDocumentValidationError)) throw error;
			let root = document.root;
			let removedAny = false;
			for (const diagnostic of error.diagnostics) {
				const segments = diagnostic.path
					.split("/")
					.slice(1)
					.map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
				const prior = root;
				root = removeAtPath(root, segments);
				removedAny ||= JSON.stringify(prior) !== JSON.stringify(root);
				losses.push({
					path: diagnostic.path,
					feature: "unsupported DTCG token",
					reason: diagnostic.message,
				});
			}
			if (!removedAny) throw error;
			document = createTokenDocument({
				format: document.format,
				formatVersion: document.formatVersion,
				root,
				sourceLosses: document.sourceLosses,
				sourceText: document.sourceFingerprint,
			});
		}
	}
	throw new Error("codemod tokens: DTCG projection did not converge");
};

const uniqueName = (names: Readonly<Record<string, unknown>>, preferred: string): string => {
	let name = preferred;
	let suffix = 2;
	while (Object.hasOwn(names, name)) name = `${preferred}${suffix++}`;
	return name;
};

const resolverSidecar = (
	document: TokenDocument,
	baseDocument: TokenDocument,
	sources: ReadonlyMap<string, ReadonlySet<string>>,
): { readonly text: string; readonly losses: readonly TokenFormatLoss[] } | undefined => {
	const hasVariants = [...sources.values()].some((contexts) =>
		[...contexts].some((context) => context !== "base"),
	);
	if (document.resolver === undefined && !hasVariants) return undefined;
	if (document.resolver !== undefined && !hasVariants)
		return { text: serializeTokenResolverDocument(document.resolver), losses: [] };
	const previous = document.resolver?.sourceDocument;
	const sourceDocument = isRecord(previous)
		? previous
		: document.resolver === undefined
			? {}
			: (JSON.parse(serializeTokenResolverDocument(document.resolver)) as Record<string, unknown>);
	const sets = isRecord(sourceDocument.sets) ? sourceDocument.sets : {};
	const modifiers = isRecord(sourceDocument.modifiers) ? sourceDocument.modifiers : {};
	const resolutionOrder = Array.isArray(sourceDocument.resolutionOrder)
		? sourceDocument.resolutionOrder
		: [];
	const baseName = uniqueName(sets, "yumcssBaseTokens");
	const nextSets: Record<string, unknown> = {
		...sets,
		[baseName]: { sources: [JSON.parse(serializeDtcgTokenDocument(baseDocument))] },
	};
	const nextModifiers: Record<string, unknown> = { ...modifiers };
	const nextOrder = [...resolutionOrder, { $ref: `#/sets/${baseName}` }];
	const losses: TokenFormatLoss[] = [];
	for (const [source, contexts] of sources) {
		const variants = [...contexts].filter((context) => context !== "base").toSorted();
		if (variants.length === 0) continue;
		const modifierName = uniqueName(
			nextModifiers,
			`yumcss${source[0]?.toUpperCase() ?? ""}${source.slice(1)}Contexts`,
		);
		const contextSources: Record<string, unknown[]> = { base: [] };
		for (const context of variants) {
			const overlay = createTokenDocument({
				format: document.format,
				formatVersion: document.formatVersion,
				root: projectGroup(document.root, context, source, false),
				sourceText: `${document.sourceFingerprint}:${source}:${context}`,
			});
			const validOverlay = validatedProjection(overlay);
			losses.push(
				...validOverlay.losses.map((loss) => ({
					...loss,
					feature: `resolver context '${source}=${context}'`,
				})),
			);
			contextSources[context] = [JSON.parse(validOverlay.text) as TokenJsonValue];
		}
		nextModifiers[modifierName] = { contexts: contextSources, default: "base" };
		nextOrder.push({ $ref: `#/modifiers/${modifierName}` });
	}
	const version = document.resolver?.version ?? "2025.10";
	const combined = parseDtcgResolverDocument(
		JSON.stringify({
			...sourceDocument,
			version,
			sets: nextSets,
			modifiers: nextModifiers,
			resolutionOrder: nextOrder,
		}),
	);
	return { text: serializeTokenResolverDocument(combined), losses };
};

export const dtcgTokenFormat: TokenFormatAdapter = {
	schema: "yumcss.token-format/1",
	id: TokenFormatId.Dtcg,
	canImport: true,
	canExport: true,
	fidelity: {
		import: "lossless",
		export: "partial",
		preserves: [
			"hierarchy",
			"typed values",
			"references",
			"resolver contexts",
			"standard metadata",
			"extensions",
		],
		mayLose: [
			"nested contextual values",
			"resolver contexts when no sidecar is requested",
			"unsupported DTCG values",
		],
	},
	importText: parseDtcgTokenDocument,
	export(document, options: TokenFormatExportOptions = {}) {
		const sources = contextValues(document);
		const nestedLosses = nestedContextLosses(document);
		const projected = validatedProjection(
			createTokenDocument({
				format: document.format,
				formatVersion: document.formatVersion,
				root: projectGroup(document.root, undefined, undefined, true),
				sourceLosses: document.sourceLosses,
				sourceText: document.sourceFingerprint,
			}),
		);
		const sidecar =
			options.resolverSidecar === true
				? resolverSidecar(document, parseDtcgTokenDocument(projected.text), sources)
				: undefined;
		const losses: TokenFormatLoss[] = [
			...projected.losses,
			...nestedLosses,
			...(sidecar?.losses ?? []),
			...(document.resolver !== undefined && options.resolverSidecar !== true
				? [
						{
							path: "/resolver",
							feature: "resolver contexts",
							reason: "DTCG Resolver is a separate document; pass --resolver-out to write it",
						},
					]
				: []),
			...(options.resolverSidecar !== true
				? [...sources].flatMap(([source, contexts]) =>
						[...contexts]
							.filter((context) => context !== "base")
							.map((context) => ({
								path: `/contexts/${source}/${context}`,
								feature: "resolver contexts",
								reason:
									"DTCG contextual values require a Resolver sidecar; pass --resolver-out to preserve them",
							})),
					)
				: []),
		];
		return {
			text: projected.text,
			...(sidecar === undefined ? {} : { resolverText: sidecar.text }),
			fidelity: { status: losses.length === 0 ? "lossless" : "lossy", losses },
		};
	},
};
