import type { PandwindMeta } from "./meta.ts";
import { SourcePass, type SourceEdit } from "./source-pass-utils.ts";
import { NodeKind, type OxcNode, walkWithParent } from "pandwind/tw/literal";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { parseToken, tokenizeClassList } from "./tokens.ts";

export interface ClassSortResult {
	readonly value: string;
	readonly changed: boolean;
	readonly opaqueTokens: readonly string[];
}

interface SortableToken {
	readonly raw: string;
	readonly index: number;
	readonly variants: readonly string[];
	readonly important: boolean;
	readonly negative: boolean;
	readonly prefix: string;
	readonly value: string;
	readonly properties: ReadonlySet<string>;
	readonly variantScope: string;
	readonly utilityRank: number;
	readonly variantRank: readonly number[];
}

interface TokenComponent {
	readonly tokens: readonly SortableToken[];
	readonly first: SortableToken;
}

const compositionNames = new Set(["cx", "clsx", "classnames", "classNames", "twMerge"]);

const isNode = (value: unknown): value is OxcNode =>
	value !== null && typeof value === "object" && "type" in value;

const nodeRange = (node: unknown): { readonly start: number; readonly end: number } | undefined => {
	if (!isNode(node) || typeof node.start !== "number" || typeof node.end !== "number")
		return undefined;
	return { start: node.start, end: node.end };
};

const nodeName = (node: unknown): string | undefined => {
	if (!isNode(node)) return undefined;
	if (typeof node.name === "string") return node.name;
	if (isNode(node.name)) {
		if (typeof node.name.name === "string") return node.name.name;
		if (typeof node.name.value === "string") return node.name.value;
	}
	if (typeof node.value === "string") return node.value;
	return undefined;
};

const isStringLiteral = (node: unknown): node is OxcNode & { readonly value: string } =>
	isNode(node) && node.type === NodeKind.Literal && typeof node.value === "string";

const renderLiteral = (value: string, quote: string): string => {
	if (quote === "'") return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
	return JSON.stringify(value);
};

const propertiesFor = (meta: PandwindMeta, prefix: string, value: string): readonly string[] =>
	meta.conflicts.get(prefix)?.[value] ?? meta.conflicts.get(prefix)?.["*"] ?? [];

const compareNumbers = (left: number, right: number): number => left - right;

const compareVectors = (left: readonly number[], right: readonly number[]): number => {
	for (let index = 0; index < Math.max(left.length, right.length); index++) {
		const compared = compareNumbers(left[index] ?? -1, right[index] ?? -1);
		if (compared !== 0) return compared;
	}
	return 0;
};

const intersects = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean => {
	for (const value of left) if (right.has(value)) return true;
	return false;
};

const unionFind = (
	size: number,
): { find(index: number): number; join(left: number, right: number): void } => {
	const parents = Array.from({ length: size }, (_, index) => index);
	const find = (index: number): number => {
		let root = index;
		while (parents[root] !== root) root = parents[root]!;
		while (parents[index] !== index) {
			const parent = parents[index]!;
			parents[index] = root;
			index = parent;
		}
		return root;
	};
	return {
		find,
		join(left, right) {
			const leftRoot = find(left);
			const rightRoot = find(right);
			if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
		},
	};
};

const componentCompare = (left: TokenComponent, right: TokenComponent): number => {
	const leftToken = left.first;
	const rightToken = right.first;
	const variantDepth = compareNumbers(leftToken.variants.length, rightToken.variants.length);
	if (variantDepth !== 0) return variantDepth;
	const variants = compareVectors(leftToken.variantRank, rightToken.variantRank);
	if (variants !== 0) return variants;
	const important = compareNumbers(Number(leftToken.important), Number(rightToken.important));
	if (important !== 0) return important;
	const utility = compareNumbers(leftToken.utilityRank, rightToken.utilityRank);
	if (utility !== 0) return utility;
	const negative = compareNumbers(Number(leftToken.negative), Number(rightToken.negative));
	if (negative !== 0) return negative;
	return compareNumbers(leftToken.index, rightToken.index);
};

const sortKnownSegment = (tokens: readonly SortableToken[]): readonly SortableToken[] => {
	if (tokens.length < 2) return tokens;
	const components = unionFind(tokens.length);
	for (let left = 0; left < tokens.length; left++) {
		for (let right = left + 1; right < tokens.length; right++) {
			const first = tokens[left]!;
			const second = tokens[right]!;
			if (first.variantScope !== second.variantScope) continue;
			if (first.important !== second.important) continue;
			if (intersects(first.properties, second.properties)) components.join(left, right);
		}
	}

	const grouped = new Map<number, SortableToken[]>();
	for (let index = 0; index < tokens.length; index++) {
		const root = components.find(index);
		const group = grouped.get(root);
		if (group === undefined) grouped.set(root, [tokens[index]!]);
		else group.push(tokens[index]!);
	}
	return [...grouped.values()]
		.map((group) => ({ tokens: group, first: group[0]! }))
		.toSorted(componentCompare)
		.flatMap((component) => component.tokens);
};

const sortableToken = (
	raw: string,
	index: number,
	meta: PandwindMeta,
	keyRanks: ReadonlyMap<string, number>,
	variantRanks: ReadonlyMap<string, number>,
): SortableToken | undefined => {
	const parsed = parseToken(raw, meta);
	if (parsed === null) return undefined;
	const keyRank = Math.min(
		...(meta.keysByBase.get(parsed.prefix) ?? []).map(
			(key) => keyRanks.get(key.key) ?? meta.keys.length,
		),
	);
	const utilityRank = Number.isFinite(keyRank) ? keyRank : meta.keys.length;
	return {
		raw,
		index,
		variants: parsed.variants,
		important: parsed.important,
		negative: parsed.negative,
		prefix: parsed.prefix,
		value: parsed.value,
		properties: new Set(propertiesFor(meta, parsed.prefix, parsed.value)),
		variantScope: parsed.variants.join("\u0000"),
		utilityRank,
		variantRank: parsed.variants.map((variant) => variantRanks.get(variant) ?? meta.variants.size),
	};
};

export const sortClassListDetailed = (classString: string, meta: PandwindMeta): ClassSortResult => {
	const rawTokens = tokenizeClassList(classString);
	if (rawTokens.length < 2) return { value: classString.trim(), changed: false, opaqueTokens: [] };
	const keyRanks = new Map(meta.keys.map((key, index) => [key.key, index] as const));
	const variantRanks = new Map(
		[...meta.variants.keys()].map((variant, index) => [variant, index] as const),
	);
	const opaqueTokens: string[] = [];
	const segments: Array<readonly SortableToken[]> = [];
	let knownSegment: SortableToken[] = [];
	const flush = (): void => {
		if (knownSegment.length === 0) return;
		segments.push(sortKnownSegment(knownSegment));
		knownSegment = [];
	};
	for (const [index, raw] of rawTokens.entries()) {
		const token = sortableToken(raw, index, meta, keyRanks, variantRanks);
		if (token === undefined) {
			flush();
			segments.push([
				{
					raw,
					index,
					variants: [],
					important: false,
					negative: false,
					prefix: "",
					value: "",
					properties: new Set(),
					variantScope: "",
					utilityRank: 0,
					variantRank: [],
				},
			]);
			opaqueTokens.push(raw);
			continue;
		}
		knownSegment.push(token);
	}
	flush();
	const value = segments.flatMap((segment) => segment.map((token) => token.raw)).join(" ");
	return { value, changed: value !== classString.trim(), opaqueTokens };
};

export const sortClassList = (classString: string, meta: PandwindMeta): string =>
	sortClassListDetailed(classString, meta).value;

const callName = (callee: unknown): string | undefined => {
	if (!isNode(callee)) return undefined;
	if (typeof callee.name === "string") return callee.name;
	if (callee.type !== NodeKind.MemberExpression) return undefined;
	return nodeName(callee.property);
};

const classAttributeEdit = (source: string, node: OxcNode): SourceEdit | undefined => {
	const name = nodeName(node.name);
	if (name !== "class" && name !== "className") return undefined;
	const value = node.value;
	if (isStringLiteral(value)) {
		const range = nodeRange(value);
		if (range === undefined) return undefined;
		return {
			start: range.start,
			end: range.end,
			text: renderLiteral(value.value, source[range.start] ?? '"'),
		};
	}
	if (!isNode(value) || value.type !== NodeKind.JSXExpressionContainer) return undefined;
	const expression = value.expression;
	if (!isStringLiteral(expression)) return undefined;
	const range = nodeRange(expression);
	if (range === undefined) return undefined;
	return {
		start: range.start,
		end: range.end,
		text: renderLiteral(expression.value, source[range.start] ?? '"'),
	};
};

const propertyEdit = (
	source: string,
	node: OxcNode,
	parent: OxcNode | undefined,
): SourceEdit | undefined => {
	if (parent?.type !== NodeKind.Property || !isStringLiteral(node)) return undefined;
	const key = nodeName(parent.key);
	if (key !== "class" && key !== "className") return undefined;
	const range = nodeRange(node);
	if (range === undefined) return undefined;
	return {
		start: range.start,
		end: range.end,
		text: renderLiteral(node.value, source[range.start] ?? '"'),
	};
};

export interface ClassSourceSortResult {
	readonly code: string;
	readonly changed: boolean;
	readonly edits: number;
	readonly opaqueTokens: readonly string[];
}

export const sortStaticClassSource = (
	source: string,
	meta: PandwindMeta,
	file = "source.tsx",
): ClassSourceSortResult => {
	const language = SOURCE_SCANNER_SERVICE.languageForFile(file);
	if (language !== "tsx" && language !== "jsx" && language !== "ts" && language !== "js")
		return { code: source, changed: false, edits: 0, opaqueTokens: [] };
	let parsed: ReturnType<typeof SOURCE_SCANNER_SERVICE.parse>;
	try {
		parsed = SOURCE_SCANNER_SERVICE.parse({ file, source });
	} catch {
		return { code: source, changed: false, edits: 0, opaqueTokens: [] };
	}
	if (parsed.errors.length > 0) return { code: source, changed: false, edits: 0, opaqueTokens: [] };
	const edits: SourceEdit[] = [];
	const opaqueTokens: string[] = [];
	const seen = new Set<string>();
	const add = (node: OxcNode | undefined, parent?: OxcNode): void => {
		if (node === undefined) return;
		const range = nodeRange(node);
		if (range === undefined) return;
		const edit = classAttributeEdit(source, node) ?? propertyEdit(source, node, parent);
		if (edit === undefined) return;
		const original = source.slice(edit.start, edit.end);
		const quote = original[0] ?? '"';
		const content = original.slice(1, -1);
		const result = sortClassListDetailed(content, meta);
		if (!result.changed) return;
		const key = `${edit.start}:${edit.end}`;
		if (seen.has(key)) return;
		seen.add(key);
		opaqueTokens.push(...result.opaqueTokens);
		edits.push({ ...edit, text: renderLiteral(result.value, quote) });
	};
	const addLiteral = (node: OxcNode): void => {
		if (!isStringLiteral(node)) return;
		const range = nodeRange(node);
		if (range === undefined) return;
		const result = sortClassListDetailed(node.value, meta);
		if (!result.changed || seen.has(`${range.start}:${range.end}`)) return;
		seen.add(`${range.start}:${range.end}`);
		opaqueTokens.push(...result.opaqueTokens);
		edits.push({
			start: range.start,
			end: range.end,
			text: renderLiteral(result.value, source[range.start] ?? '"'),
		});
	};
	walkWithParent(parsed.program, (node, parent) => {
		if (node.type === NodeKind.JSXAttribute) add(node);
		if (node.type === NodeKind.Literal) add(node, parent);
		if (node.type !== NodeKind.CallExpression || !compositionNames.has(callName(node.callee) ?? ""))
			return;
		for (const argument of Array.isArray(node.arguments) ? node.arguments : [])
			if (isStringLiteral(argument)) addLiteral(argument);
	});
	const code = SourcePass.applyEdits(source, edits);
	return { code, changed: code !== source, edits: edits.length, opaqueTokens };
};
