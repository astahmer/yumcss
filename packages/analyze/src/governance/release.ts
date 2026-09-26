import {
	parseTokenDocument,
	type TokenDocument,
	type TokenEntry,
	type TokenGroup,
	type TokenJsonValue,
	type TokenValue,
} from "pandwind-codemod/swap/token-document";
import type { GovernanceCoverageBoundary, TokenGovernanceReport } from "./contracts.ts";
import {
	TOKEN_RELEASE_CHANGE_KINDS,
	TOKEN_RELEASE_REPORT_SCHEMA,
	TokenReleaseChangeKind,
	type TokenReleaseChange,
	type TokenReleaseChangeKind as TokenReleaseChangeKindValue,
	type TokenReleaseComparisonInputs,
	type TokenReleaseReport,
	type TokenReleaseTokenState,
} from "./release-contracts.ts";

interface FlatToken {
	readonly path: string;
	readonly segments: readonly string[];
	readonly state: TokenReleaseTokenState;
	readonly references: readonly string[];
}

interface FlatGroup {
	readonly path: string;
	readonly segments: readonly string[];
	readonly metadata: TokenJsonValue;
	readonly empty: boolean;
}

interface FlatDocument {
	readonly tokens: ReadonlyMap<string, FlatToken>;
	readonly groups: ReadonlyMap<string, FlatGroup>;
	readonly contexts: ReadonlyMap<string, TokenJsonValue>;
	readonly contextTokenPaths: ReadonlyMap<string, string>;
}

const escapePointer = (segment: string): string =>
	segment.replaceAll("~", "~0").replaceAll("/", "~1");

const pointerFor = (segments: readonly string[]): string =>
	segments.length === 0 ? "" : `/${segments.map(escapePointer).join("/")}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const canonicalJson = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (isRecord(value)) {
		return `{${Object.keys(value)
			.toSorted()
			.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
};

const referenceSpellings = (value: TokenValue): Array<string> => {
	switch (value.kind) {
		case "reference":
			return [value.authored];
		case "array":
			return value.items.flatMap(referenceSpellings);
		case "object":
			return Object.values(value.entries).flatMap(referenceSpellings);
		case "contextual":
			return Object.values(value.values).flatMap(referenceSpellings);
		case "string":
		case "number":
		case "boolean":
		case "null":
			return [];
	}
};

const tokenState = (
	entry: TokenEntry,
	inheritedType: string | undefined,
	inheritedDeprecated: boolean | string | undefined,
): TokenReleaseTokenState => ({
	value: entry.value,
	...(containsContextualValue(entry.value) ? { hasContextualValues: true } : {}),
	...((entry.type ?? entry.effectiveType ?? inheritedType) === undefined
		? {}
		: { type: entry.type ?? entry.effectiveType ?? inheritedType }),
	...(entry.deprecated === undefined
		? inheritedDeprecated === undefined
			? {}
			: { deprecated: inheritedDeprecated }
		: { deprecated: entry.deprecated }),
	...(entry.description === undefined ? {} : { description: entry.description }),
	...(entry.extensions === undefined ? {} : { extensions: entry.extensions }),
});

const containsContextualValue = (value: TokenValue): boolean => {
	if (value.kind === "contextual") return true;
	if (value.kind === "array") return value.items.some(containsContextualValue);
	if (value.kind === "object") return Object.values(value.entries).some(containsContextualValue);
	return false;
};

const valueWithoutContextPayload = (value: TokenValue): TokenJsonValue => {
	switch (value.kind) {
		case "contextual":
			return { kind: value.kind, source: value.source, values: {} };
		case "array":
			return { kind: value.kind, items: value.items.map(valueWithoutContextPayload) };
		case "object":
			return {
				kind: value.kind,
				entries: Object.fromEntries(
					Object.entries(value.entries).map(([key, entry]) => [
						key,
						valueWithoutContextPayload(entry),
					]),
				),
			};
		case "reference":
			return {
				kind: value.kind,
				target: value.target,
				authored: value.authored,
				syntax: value.syntax,
			};
		case "string":
		case "number":
		case "boolean":
			return { kind: value.kind, value: value.value };
		case "null":
			return { kind: value.kind };
	}
};

const contextualValues = (
	value: TokenValue,
	valueSegments: readonly string[],
	tokenPath: string,
	contexts: Map<string, TokenJsonValue>,
	contextTokenPaths: Map<string, string>,
): void => {
	if (value.kind === "contextual") {
		for (const [context, contextValue] of Object.entries(value.values)) {
			const path = pointerFor([...valueSegments, "$contexts", value.source, context]);
			contexts.set(path, valueWithoutContextPayload(contextValue));
			contextTokenPaths.set(path, tokenPath);
		}
		return;
	}
	if (value.kind === "array")
		value.items.forEach((item, index) =>
			contextualValues(
				item,
				[...valueSegments, String(index)],
				tokenPath,
				contexts,
				contextTokenPaths,
			),
		);
	if (value.kind === "object")
		Object.entries(value.entries).forEach(([key, item]) =>
			contextualValues(item, [...valueSegments, key], tokenPath, contexts, contextTokenPaths),
		);
};

const groupMetadata = (group: TokenGroup): TokenJsonValue => ({
	...(group.type === undefined ? {} : { type: group.type }),
	...(group.description === undefined ? {} : { description: group.description }),
	...(group.deprecated === undefined ? {} : { deprecated: group.deprecated }),
	...(group.extensions === undefined ? {} : { extensions: group.extensions }),
	...(group.extends === undefined ? {} : { extends: group.extends }),
});

const flattenDocument = (document: TokenDocument): FlatDocument => {
	const tokens = new Map<string, FlatToken>();
	const groups = new Map<string, FlatGroup>();
	const contexts = new Map<string, TokenJsonValue>();
	const contextTokenPaths = new Map<string, string>();
	const visitGroup = (
		group: TokenGroup,
		segments: readonly string[],
		inheritedType: string | undefined,
		inheritedDeprecated: boolean | string | undefined,
	): boolean => {
		const effectiveType = group.type ?? inheritedType;
		const effectiveDeprecated = group.deprecated ?? inheritedDeprecated;
		let containsToken = false;
		if (segments.length > 0) {
			groups.set(pointerFor(segments), {
				path: pointerFor(segments),
				segments,
				metadata: groupMetadata(group),
				empty: Object.keys(group.children).length === 0 && group.root === undefined,
			});
		}
		if (group.root !== undefined) {
			const tokenSegments = [...segments, "$root"];
			const token = { path: pointerFor(tokenSegments), segments: tokenSegments };
			tokens.set(token.path, {
				...token,
				state: tokenState(group.root, effectiveType, effectiveDeprecated),
				references: referenceSpellings(group.root.value),
			});
			contextualValues(
				group.root.value,
				[...tokenSegments, "$value"],
				token.path,
				contexts,
				contextTokenPaths,
			);
			containsToken = true;
		}
		for (const [name, child] of Object.entries(group.children)) {
			const childSegments = [...segments, name];
			if (child.kind === "token") {
				const path = pointerFor(childSegments);
				tokens.set(path, {
					path,
					segments: childSegments,
					state: tokenState(child, effectiveType, effectiveDeprecated),
					references: referenceSpellings(child.value),
				});
				contextualValues(
					child.value,
					[...childSegments, "$value"],
					path,
					contexts,
					contextTokenPaths,
				);
				containsToken = true;
			} else if (visitGroup(child, childSegments, effectiveType, effectiveDeprecated)) {
				containsToken = true;
			}
		}
		return containsToken;
	};
	visitGroup(document.root, [], undefined, undefined);
	const visitJson = (value: TokenJsonValue, segments: readonly string[]): void => {
		if (Array.isArray(value) && value.length > 0) {
			value.forEach((child, index) => visitJson(child, [...segments, String(index)]));
			return;
		}
		if (isRecord(value) && Object.keys(value).length > 0) {
			for (const [key, child] of Object.entries(value))
				visitJson(child as TokenJsonValue, [...segments, key]);
			return;
		}
		contexts.set(pointerFor(segments), value);
	};
	if (document.resolver !== undefined)
		visitJson(document.resolver as unknown as TokenJsonValue, ["resolver"]);
	return { tokens, groups, contexts, contextTokenPaths };
};

const exactTokenIds = (path: FlatToken, report: TokenGovernanceReport): readonly string[] => {
	if (path.segments.length < 2) return [];
	const name = path.segments.at(-1)!;
	const groupSegments = path.segments.slice(0, -1);
	const groupCandidates = [...new Set([groupSegments[0]!, groupSegments.join(".")])];
	const names = name.startsWith("$") ? [name, name.slice(1)] : [name, `$${name}`];
	const candidates = new Set(
		groupCandidates.flatMap((group) => names.map((token) => `${group}::${token}`)),
	);
	return report.definitions
		.filter((definition) => candidates.has(definition.id))
		.map((definition) => definition.id)
		.toSorted();
};

const emptyBoundaries = (): Record<GovernanceCoverageBoundary, number> => ({
	"dynamic-expression": 0,
	"runtime-theme-access": 0,
	"generated-css": 0,
	"public-export": 0,
	safelist: 0,
	"plugin-output": 0,
	"unscanned-file": 0,
	"configuration-failure": 0,
	"unresolved-import": 0,
});

const consumerImpacts = (
	tokenIds: readonly string[],
	consumers: readonly TokenGovernanceReport[],
): TokenReleaseChange["consumers"] =>
	consumers.map((report) => {
		const matched = new Set(tokenIds);
		const unused = report.unusedCandidates.find((candidate) => matched.has(candidate.tokenId));
		return {
			root: report.root,
			tokenIds,
			usages: report.usage.filter((usage) => matched.has(usage.tokenId)),
			exactSuggestions: report.suggestions.filter((suggestion) => matched.has(suggestion.tokenId)),
			...(unused === undefined
				? {}
				: {
						removal: {
							safety: unused.safety,
							reasons: unused.reasons,
							boundaries: unused.boundaries,
						},
					}),
			coverageBoundaries: Object.assign(emptyBoundaries(), report.summary.boundaries),
		};
	});

const makeChange = (
	path: string,
	kind: TokenReleaseChangeKindValue,
	consumers: readonly TokenGovernanceReport[],
	options: {
		readonly before?: TokenReleaseChange["before"];
		readonly after?: TokenReleaseChange["after"];
		readonly tokenIds?: readonly string[];
		readonly references?: readonly string[];
		readonly changedFields?: readonly string[];
	} = {},
): TokenReleaseChange => {
	const tokenIds = options.tokenIds ?? [];
	return {
		path,
		kind,
		...(options.before === undefined ? {} : { before: options.before }),
		...(options.after === undefined ? {} : { after: options.after }),
		tokenIds,
		references: options.references ?? [],
		...(options.changedFields === undefined ? {} : { changedFields: options.changedFields }),
		consumers: consumerImpacts(tokenIds, consumers),
	};
};

const stateFieldsChanged = (
	before: TokenReleaseTokenState,
	after: TokenReleaseTokenState,
	fields: readonly (keyof TokenReleaseTokenState)[],
): Array<keyof TokenReleaseTokenState> =>
	fields.filter((field) => canonicalJson(before[field]) !== canonicalJson(after[field]));

const normalizedDeprecation = (value: boolean | string | undefined): boolean | string =>
	value ?? false;

const tokenChanges = (
	baseline: FlatDocument,
	current: FlatDocument,
	consumers: readonly TokenGovernanceReport[],
): Array<TokenReleaseChange> => {
	const changes: TokenReleaseChange[] = [];
	for (const path of new Set([...baseline.tokens.keys(), ...current.tokens.keys()])) {
		const before = baseline.tokens.get(path);
		const after = current.tokens.get(path);
		const matched = after ?? before;
		if (matched === undefined) continue;
		const tokenIds = consumers.flatMap((report) => exactTokenIds(matched, report));
		const uniqueTokenIds = [...new Set(tokenIds)].toSorted();
		if (before === undefined) {
			changes.push(
				makeChange(path, TokenReleaseChangeKind.Added, consumers, {
					after: after!.state,
					tokenIds: uniqueTokenIds,
					references: after!.references,
				}),
			);
			continue;
		}
		if (after === undefined) {
			changes.push(
				makeChange(path, TokenReleaseChangeKind.Removed, consumers, {
					before: before.state,
					tokenIds: uniqueTokenIds,
					references: before.references,
				}),
			);
			continue;
		}
		if (
			canonicalJson(valueWithoutContextPayload(before.state.value)) !==
			canonicalJson(valueWithoutContextPayload(after.state.value))
		) {
			changes.push(
				makeChange(path, TokenReleaseChangeKind.ValueChanged, consumers, {
					before: before.state,
					after: after.state,
					tokenIds: uniqueTokenIds,
					references: [...new Set([...before.references, ...after.references])].toSorted(),
				}),
			);
		}
		if (before.state.type !== after.state.type) {
			changes.push(
				makeChange(path, TokenReleaseChangeKind.TypeChanged, consumers, {
					before: before.state,
					after: after.state,
					tokenIds: uniqueTokenIds,
					references: [...new Set([...before.references, ...after.references])].toSorted(),
				}),
			);
		}
		if (
			canonicalJson(normalizedDeprecation(before.state.deprecated)) !==
			canonicalJson(normalizedDeprecation(after.state.deprecated))
		) {
			changes.push(
				makeChange(path, TokenReleaseChangeKind.DeprecationChanged, consumers, {
					before: before.state,
					after: after.state,
					tokenIds: uniqueTokenIds,
					references: [...new Set([...before.references, ...after.references])].toSorted(),
				}),
			);
		}
		const metadataFields = stateFieldsChanged(before.state, after.state, [
			"description",
			"extensions",
		]);
		if (metadataFields.length > 0) {
			changes.push(
				makeChange(path, TokenReleaseChangeKind.MetadataChanged, consumers, {
					before: before.state,
					after: after.state,
					tokenIds: uniqueTokenIds,
					references: [...new Set([...before.references, ...after.references])].toSorted(),
					changedFields: metadataFields,
				}),
			);
		}
	}
	return changes;
};

const contextChanges = (
	baseline: FlatDocument,
	current: FlatDocument,
	consumers: readonly TokenGovernanceReport[],
): Array<TokenReleaseChange> => {
	const changes: Array<TokenReleaseChange> = [];
	for (const path of new Set([...baseline.contexts.keys(), ...current.contexts.keys()])) {
		const before = baseline.contexts.get(path);
		const after = current.contexts.get(path);
		if (canonicalJson(before) === canonicalJson(after)) continue;
		const tokenPath = current.contextTokenPaths.get(path) ?? baseline.contextTokenPaths.get(path);
		const matched =
			tokenPath === undefined
				? undefined
				: (current.tokens.get(tokenPath) ?? baseline.tokens.get(tokenPath));
		const tokenIds =
			matched === undefined
				? []
				: [...new Set(consumers.flatMap((report) => exactTokenIds(matched, report)))].toSorted();
		changes.push(
			makeChange(path, TokenReleaseChangeKind.ContextChanged, consumers, {
				...(before === undefined ? {} : { before }),
				...(after === undefined ? {} : { after }),
				...(tokenIds.length === 0 ? {} : { tokenIds }),
				...(matched === undefined ? {} : { references: matched.references }),
			}),
		);
	}
	return changes;
};

const groupChanges = (
	baseline: FlatDocument,
	current: FlatDocument,
	consumers: readonly TokenGovernanceReport[],
): Array<TokenReleaseChange> => {
	const changes: Array<TokenReleaseChange> = [];
	for (const path of new Set([...baseline.groups.keys(), ...current.groups.keys()])) {
		const before = baseline.groups.get(path);
		const after = current.groups.get(path);
		if (before === undefined && after?.empty === true) {
			changes.push(
				makeChange(path, TokenReleaseChangeKind.Added, consumers, { after: after.metadata }),
			);
			continue;
		}
		if (after === undefined && before?.empty === true) {
			changes.push(
				makeChange(path, TokenReleaseChangeKind.Removed, consumers, { before: before.metadata }),
			);
			continue;
		}
		if (before === undefined || after === undefined) continue;
		if (canonicalJson(before.metadata) !== canonicalJson(after.metadata)) {
			const prior = isRecord(before.metadata) ? before.metadata : {};
			const next = isRecord(after.metadata) ? after.metadata : {};
			const changedFields = [...new Set([...Object.keys(prior), ...Object.keys(next)])]
				.filter((field) => canonicalJson(prior[field]) !== canonicalJson(next[field]))
				.toSorted();
			changes.push(
				makeChange(path, TokenReleaseChangeKind.MetadataChanged, consumers, {
					before: before.metadata,
					after: after.metadata,
					changedFields,
				}),
			);
		}
	}
	return changes;
};

const compareByPath = (left: TokenReleaseChange, right: TokenReleaseChange): number =>
	left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind);

/** Compare explicit token documents and attach only exact governance evidence. */
export const compareTokenRelease = (inputs: TokenReleaseComparisonInputs): TokenReleaseReport => {
	const baselineDocument = parseTokenDocument(inputs.baseline);
	const currentDocument = parseTokenDocument(inputs.current);
	const baseline = flattenDocument(baselineDocument);
	const current = flattenDocument(currentDocument);
	const changes = [
		...tokenChanges(baseline, current, inputs.consumers),
		...contextChanges(baseline, current, inputs.consumers),
		...groupChanges(baseline, current, inputs.consumers),
	].toSorted(compareByPath);
	const summary = Object.fromEntries(
		TOKEN_RELEASE_CHANGE_KINDS.map((kind) => [
			kind,
			changes.filter((change) => change.kind === kind).length,
		]),
	) as Record<TokenReleaseChangeKindValue, number>;
	return {
		schema: TOKEN_RELEASE_REPORT_SCHEMA,
		baseline: {
			format: baselineDocument.format,
			formatVersion: baselineDocument.formatVersion,
			sourceFingerprint: baselineDocument.sourceFingerprint,
		},
		current: {
			format: currentDocument.format,
			formatVersion: currentDocument.formatVersion,
			sourceFingerprint: currentDocument.sourceFingerprint,
		},
		generatedAt: inputs.generatedAt ?? new Date().toISOString(),
		changes,
		summary,
		consumerRoots: [...new Set(inputs.consumers.map((consumer) => consumer.root))].toSorted(),
	};
};
