import { pathToFileURL } from "node:url";
import {
	createTokenDocument,
	type TokenDocument,
	type TokenEntry,
	type TokenGroup,
	type TokenValue,
} from "./token-document.ts";
import type {
	TokenFormatLoss,
	TokenFormatOutput,
	TokenFormatId,
} from "./token-format-contracts.ts";

export type ScalarTokenImport = Record<string, Record<string, string>>;

export const createScalarTokenImport = (): ScalarTokenImport => ({});

export const putScalarTokenWithLoss = (
	tokens: ScalarTokenImport,
	group: string,
	key: string,
	value: string,
	losses: TokenFormatLoss[],
	sourcePath: string,
): void => {
	const values = tokens[group] ?? (tokens[group] = {});
	if (Object.hasOwn(values, key)) {
		losses.push({
			path: sourcePath,
			feature: "token name collision",
			reason: `multiple source values map to '${group}.${key}'; the first value was retained`,
		});
		return;
	}
	values[key] = value;
};

export const cssScopedTokenLosses = (text: string): readonly TokenFormatLoss[] => {
	const scopedRanges = [
		...text.matchAll(/@(media|supports|container|layer|starting-style)\b[^{}]*\{/gu),
	].flatMap((match) => {
		const start = (match.index ?? 0) + match[0].length;
		let depth = 1;
		for (let index = start; index < text.length; index++) {
			if (text[index] === "{") depth++;
			else if (text[index] === "}" && --depth === 0) return [{ start, end: index, name: match[1] }];
		}
		return [];
	});
	return [...text.matchAll(/--([\w-]+)\s*:/gu)].flatMap((match) => {
		const declaration = match.index ?? 0;
		const scope = scopedRanges.find(
			(range) => declaration >= range.start && declaration < range.end,
		);
		return scope === undefined
			? []
			: [
					{
						path: `/css/${match[1]}`,
						feature: "conditional CSS scope",
						reason: `the ${scope.name} scope cannot be represented as an unconditional token value`,
					},
				];
	});
};

export class TokenTreeWalker {
	static visit(
		root: unknown,
		visitor: (node: Record<string, unknown>, path: readonly string[]) => boolean | void,
	): void {
		const stack: Array<{ node: unknown; path: string[] }> = [{ node: root, path: [] }];
		while (stack.length > 0) {
			const current = stack.pop()!;
			if (typeof current.node !== "object" || current.node === null) continue;
			const node = current.node as Record<string, unknown>;
			if (visitor(node, current.path) === true) continue;
			const entries = Object.entries(node);
			for (let index = entries.length - 1; index >= 0; index--) {
				const [key, child] = entries[index]!;
				stack.push({ node: child, path: [...current.path, key] });
			}
		}
	}
}

export const flattenNested = (
	node: Record<string, unknown>,
	prefix: string[],
	out: Record<string, string>,
): void => {
	const stack: Array<{ node: Record<string, unknown>; prefix: string[] }> = [{ node, prefix }];
	while (stack.length > 0) {
		const current = stack.pop()!;
		for (const [key, value] of Object.entries(current.node)) {
			const path = [...current.prefix, key];
			if (typeof value === "string" || typeof value === "number")
				out[path.join("-")] = String(value);
			else if (typeof value === "object" && value !== null) {
				const leaf = (value as { value?: unknown }).value;
				if (typeof leaf === "string" || typeof leaf === "number")
					out[path.join("-")] = String(leaf);
				else stack.push({ node: value as Record<string, unknown>, prefix: path });
			}
		}
	}
};

export const flattenNestedWithLosses = (
	node: Record<string, unknown>,
	prefix: string[],
	out: Record<string, string>,
	losses: TokenFormatLoss[],
): void => {
	const stack: Array<{ node: Record<string, unknown>; prefix: string[] }> = [{ node, prefix }];
	while (stack.length > 0) {
		const current = stack.pop()!;
		for (const [key, value] of Object.entries(current.node)) {
			const path = [...current.prefix, key];
			if (typeof value === "string" || typeof value === "number") {
				const name = path.join("-");
				if (Object.hasOwn(out, name))
					losses.push({
						path: `/${path.join("/")}`,
						feature: "token name collision",
						reason: `flattening collides with '${name}'; the first value was retained`,
					});
				else out[name] = String(value);
				if (typeof value === "number")
					losses.push({
						path: `/${path.join("/")}`,
						feature: "number value",
						reason: "importer stores scalar values as strings",
					});
			} else if (typeof value === "object" && value !== null) {
				const record = value as Record<string, unknown>;
				if (Object.hasOwn(record, "value")) {
					if (typeof record.value === "string" || typeof record.value === "number") {
						const name = path.join("-");
						if (Object.hasOwn(out, name))
							losses.push({
								path: `/${path.join("/")}`,
								feature: "token name collision",
								reason: `flattening collides with '${name}'; the first value was retained`,
							});
						else out[name] = String(record.value);
						if (typeof record.value === "number")
							losses.push({
								path: `/${path.join("/")}/value`,
								feature: "number value",
								reason: "importer stores scalar values as strings",
							});
						for (const field of Object.keys(record).filter((candidate) => candidate !== "value"))
							losses.push({
								path: `/${path.join("/")}/${field}`,
								feature: "token metadata",
								reason: "importer does not preserve this token metadata",
							});
					} else {
						losses.push({
							path: `/${path.join("/")}/value`,
							feature: "structured value",
							reason: "importer supports only scalar values",
						});
					}
				} else stack.push({ node: record, prefix: path });
			} else {
				losses.push({
					path: `/${path.join("/")}`,
					feature: "unsupported value",
					reason: "importer supports only string and number token values",
				});
			}
		}
	}
};

export const scalarImportToDocument = (
	format: TokenFormatId,
	tokens: ScalarTokenImport,
	sourceText?: string,
	sourceLosses: readonly TokenFormatLoss[] = [],
): TokenDocument => {
	const children = Object.fromEntries(
		Object.entries(tokens).map(([groupName, values]) => {
			const groupChildren = Object.fromEntries(
				Object.entries(values).map(([name, value]) => [
					name,
					{
						kind: "token" as const,
						value: { kind: "string" as const, value },
					},
				]),
			);
			const group: TokenGroup = { kind: "group", children: groupChildren };
			return [groupName, group];
		}),
	);
	const root: TokenGroup = { kind: "group", children };
	return createTokenDocument({ format, root, sourceText, sourceLosses });
};

const scalarGroupsForExport = (
	document: TokenDocument,
): {
	readonly groups: ScalarTokenImport;
	readonly losses: readonly TokenFormatLoss[];
} => {
	const groups: ScalarTokenImport = {};
	const losses: TokenFormatLoss[] = [];
	const pointer = (path: readonly string[]): string =>
		path.length === 0 ? "" : `/${path.join("/")}`;
	const recordMetadataLosses = (node: TokenEntry | TokenGroup, path: string): void => {
		if (node.type !== undefined)
			losses.push({
				path: `${path}/$type`,
				feature: "token type",
				reason: "target format does not preserve DTCG type metadata",
			});
		if (node.description !== undefined)
			losses.push({
				path: `${path}/$description`,
				feature: "description",
				reason: "target format does not preserve descriptions",
			});
		if (node.deprecated !== undefined)
			losses.push({
				path: `${path}/$deprecated`,
				feature: "deprecation",
				reason: "target format does not preserve deprecation metadata",
			});
		if (node.extensions !== undefined)
			losses.push({
				path: `${path}/$extensions`,
				feature: "extensions",
				reason: "target format does not preserve extension data",
			});
		for (const key of Object.keys(node.sourceMetadata ?? {}))
			losses.push({
				path: `${path}/${key}`,
				feature: "source metadata",
				reason: "target format does not preserve this source metadata",
			});
	};
	const visit = (group: TokenGroup, path: readonly string[]): void => {
		recordMetadataLosses(group, pointer(path));
		if (group.extends !== undefined)
			losses.push({
				path: `/${[...path, "$extends"].join("/")}`,
				feature: "group inheritance",
				reason: "target format has no group inheritance contract",
			});
		if (group.root !== undefined) {
			losses.push({
				path: `/${[...path, "$root"].join("/")}`,
				feature: "root token",
				reason: "target format cannot represent a group root token",
			});
			addEntry(group.root, [...path, "$root"]);
		}
		for (const [name, child] of Object.entries(group.children)) {
			if (child.kind === "group") visit(child, [...path, name]);
			else addEntry(child, [...path, name]);
		}
	};
	const addEntry = (entry: TokenEntry, path: readonly string[]): void => {
		const fullPath = pointer(path);
		recordMetadataLosses(entry, fullPath);
		const groupName = path[0] ?? "misc";
		const keyParts = path.slice(1);
		const key = keyParts.join("-");
		if (path.length > 2)
			losses.push({
				path: fullPath,
				feature: "hierarchy",
				reason: "target format flattens nested token groups into a delimited name",
			});
		if (keyParts.some((part) => part.includes("-")))
			losses.push({
				path: fullPath,
				feature: "path encoding",
				reason: "hyphenated path segments can collide with the target's flattened token names",
			});
		if (entry.value.kind === "reference")
			losses.push({
				path: `${fullPath}/$value`,
				feature: "reference",
				reason: "target format does not preserve token references",
			});
		else if (
			entry.value.kind !== "string" &&
			entry.value.kind !== "object" &&
			entry.value.kind !== "number" &&
			entry.value.kind !== "boolean"
		)
			losses.push({
				path: `${fullPath}/$value`,
				feature: "typed value",
				reason: `target format accepts scalar strings; received ${entry.value.kind}`,
			});
		const stringValue = scalarValueForExport(entry);
		if (stringValue === undefined) {
			losses.push({
				path: `${fullPath}/$value`,
				feature: "unrepresentable value",
				reason:
					"target format has no valid scalar representation for this value; token was omitted",
			});
			return;
		}
		const values = groups[groupName] ?? (groups[groupName] = {});
		if (Object.hasOwn(values, key))
			losses.push({
				path: fullPath,
				feature: "path collision",
				reason: `flattening collides with an existing token at '${groupName}.${key}'`,
			});
		else values[key] = stringValue;
	};
	if (document.resolver !== undefined)
		losses.push({
			path: "/resolver",
			feature: "resolver contexts",
			reason: "target format cannot preserve DTCG Resolver sets or modifier contexts",
		});
	visit(document.root, []);
	return { groups, losses };
};

const scalarValueForExport = (entry: TokenEntry): string | undefined => {
	const value = entry.value;
	if (value.kind === "string" || value.kind === "number" || value.kind === "boolean")
		return valueAsString(value);
	if (value.kind !== "object") return undefined;
	const type = entry.effectiveType ?? entry.type;
	if (type === "dimension") {
		const amount = value.entries.value;
		const unit = value.entries.unit;
		return amount?.kind === "number" && unit?.kind === "string"
			? `${valueAsString(amount)}${unit.value}`
			: undefined;
	}
	if (type !== "color") return undefined;
	const colorSpace = value.entries.colorSpace;
	const components = value.entries.components;
	const alpha = value.entries.alpha;
	if (colorSpace?.kind !== "string" || colorSpace.value !== "srgb" || components?.kind !== "array")
		return undefined;
	if (
		components.items.length !== 3 ||
		!components.items.every((component) => component.kind === "number")
	)
		return undefined;
	if (alpha !== undefined && alpha.kind !== "number") return undefined;
	const opacity = alpha?.kind === "number" ? alpha.value : 1;
	const channels = components.items.map((component) =>
		component.kind === "number" ? component.value : 0,
	);
	if (
		!Number.isFinite(opacity) ||
		opacity < 0 ||
		opacity > 1 ||
		channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)
	)
		return undefined;
	const bytes = channels.map((channel) => Math.round(channel * 255));
	const exactBytes = channels.every(
		(channel, index) => Math.abs(channel * 255 - (bytes[index] ?? Number.NaN)) < 1e-8,
	);
	const alphaByte = Math.round(opacity * 255);
	const exactAlphaByte = Math.abs(opacity * 255 - alphaByte) < 1e-8;
	if (exactBytes && (opacity === 1 || exactAlphaByte))
		return `#${[...bytes, ...(opacity === 1 ? [] : [alphaByte])]
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("")}`;
	return `color(srgb ${channels.map(String).join(" ")}${opacity === 1 ? "" : ` / ${opacity}`})`;
};

const valueAsString = (value: TokenValue): string => {
	switch (value.kind) {
		case "string":
			return value.value;
		case "number":
			return String(value.value);
		case "boolean":
			return String(value.value);
		case "null":
			return "null";
		case "reference":
			return value.authored;
		case "array":
			return JSON.stringify(value.items.map(valueAsUnknown));
		case "object":
			return JSON.stringify(
				Object.fromEntries(
					Object.entries(value.entries).map(([key, entry]) => [key, valueAsUnknown(entry)]),
				),
			);
		case "contextual":
			return JSON.stringify(
				Object.fromEntries(
					Object.entries(value.values).map(([context, entry]) => [context, valueAsUnknown(entry)]),
				),
			);
	}
};

const valueAsUnknown = (value: TokenValue): unknown => {
	switch (value.kind) {
		case "string":
			return value.value;
		case "number":
			return value.value;
		case "boolean":
			return value.value;
		case "null":
			return null;
		case "reference":
			return value.authored;
		case "array":
			return value.items.map(valueAsUnknown);
		case "object":
			return Object.fromEntries(
				Object.entries(value.entries).map(([key, entry]) => [key, valueAsUnknown(entry)]),
			);
		case "contextual":
			return Object.fromEntries(
				Object.entries(value.values).map(([context, entry]) => [context, valueAsUnknown(entry)]),
			);
	}
};

export const scalarFormatOutput = (
	document: TokenDocument,
	serialize: (groups: ScalarTokenImport) => string,
): TokenFormatOutput => {
	const { groups, losses } = scalarGroupsForExport(document);
	return {
		text: serialize(groups),
		fidelity: { status: losses.length === 0 ? "lossless" : "lossy", losses },
	};
};

export const importModule = async (path: string): Promise<Record<string, unknown>> =>
	(await import(isPackageSpecifier(path) ? path : pathToFileURL(path).href)) as Record<
		string,
		unknown
	>;

const isPackageSpecifier = (path: string): boolean =>
	!path.startsWith("/") && !path.startsWith(".");

export const findPresetTokens = (
	module: Record<string, unknown>,
): Record<string, Record<string, string>> | undefined => {
	for (const value of Object.values(module)) {
		if (typeof value !== "object" || value === null) continue;
		const tokens = (value as { tokens?: unknown }).tokens;
		if (typeof tokens === "object" && tokens !== null)
			return tokens as Record<string, Record<string, string>>;
	}
	return undefined;
};

const renderTokenTreeNode = (node: Record<string, unknown>, indent: string): string => `{
${Object.entries(node)
	.map(([key, value]) =>
		typeof value === "object" && value !== null && !("value" in value)
			? `${indent}\t${JSON.stringify(key)}: ${renderTokenTreeNode(value as Record<string, unknown>, `${indent}\t`)},`
			: `${indent}\t${JSON.stringify(key)}: { value: ${JSON.stringify((value as { value: string }).value)} },`,
	)
	.join("\n")}
${indent}}`;

export const renderTokenTree = (values: Record<string, string>): string => {
	const tree: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(values)) {
		let node = tree;
		const segments = key.split("-");
		for (const segment of segments.slice(0, -1))
			node = (node[segment] as Record<string, unknown>) ?? (node[segment] = {});
		node[segments.at(-1)!] = { value };
	}
	return renderTokenTreeNode(tree, "\t\t");
};

export const exportNested = (
	groups: ScalarTokenImport,
	leaf: (value: string, group: string) => unknown,
): string => {
	const root: Record<string, unknown> = {};
	for (const [group, values] of Object.entries(groups)) {
		const groupNode: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(values)) {
			let node = groupNode;
			const segments = key.split("-");
			for (const segment of segments.slice(0, -1))
				node = (node[segment] as Record<string, unknown>) ?? (node[segment] = {});
			node[segments.at(-1)!] = leaf(value, group);
		}
		root[group] = groupNode;
	}
	return `${JSON.stringify(root, null, "\t")}\n`;
};
