/**
 * Token usage collection (plans/054 step 4, first lane) — scan tw()/css
 * call-site object literals and emit positioned governance usage facts.
 *
 * Every property value records file, 0-based range, property, condition
 * path, and a strictness classification against the effective policy
 * snapshot. Dynamic values (template literals, bare identifiers, computed
 * expressions) are reported as strictness "dynamic" with tokenId "" so
 * they can never silently inflate or suppress real usage counts — they
 * feed the dynamic-expression coverage boundary instead.
 */
import type {
	GovernanceCoverageBoundary,
	TokenDefinition,
	TokenPolicySnapshot,
	TokenUsage,
} from "./contracts.ts";
import { SOURCE_SCANNER_SERVICE } from "yumcss/source";
import { NodeKind, walk, type OxcNode } from "yumcss/tw/literal";

/** Token id for non-token (raw/unknown) observations. */
export const UNRESOLVED_TOKEN_ID = "";

export interface UsageCollectorFile {
	readonly file: string;
	readonly content: string;
}

export interface UsageCollectionResult {
	readonly usage: readonly TokenUsage[];
	/** Dynamic value sites — never counted as token usage. */
	readonly dynamicSites: readonly TokenUsage[];
	readonly boundaryHits: Readonly<Record<GovernanceCoverageBoundary, readonly string[]>>;
}

interface RawUsage {
	property: string;
	condition: string;
	rawValue: string;
	tokenRef: string | null;
	dynamic: boolean;
	start: number;
	end: number;
}

const isOxcNode = (value: unknown): value is OxcNode =>
	typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const oxcNodeAt = (node: OxcNode, key: string): OxcNode | undefined => {
	const value = node[key];
	return isOxcNode(value) ? value : undefined;
};

const oxcNodesAt = (node: OxcNode, key: string): OxcNode[] => {
	const value = node[key];
	return Array.isArray(value) ? value.filter(isOxcNode) : [];
};

const stringAt = (node: OxcNode, key: string): string | undefined => {
	const value = node[key];
	return typeof value === "string" ? value : undefined;
};

const numberAt = (node: OxcNode, key: string): number | undefined => {
	const value = node[key];
	return typeof value === "number" ? value : undefined;
};

const sourceText = (source: string, node: OxcNode): string | undefined => {
	const start = numberAt(node, "start");
	const end = numberAt(node, "end");
	if (start === undefined || end === undefined || start < 0 || end < start) return undefined;
	return source.slice(start, end).trim();
};

function tokenRefIn(rawValue: string): string | null {
	const unquoted = rawValue.replace(/^["']|["']$/g, "");
	if (!unquoted.startsWith("$")) return null;
	return unquoted.split(/[\s/[\]]/)[0] ?? null;
}

/**
 * Static means: quoted string, authored $token reference, or a scalar
 * literal. Template literals, bare identifiers, and computed expressions
 * are dynamic.
 */
function isDynamicValue(rawValue: string): boolean {
	return !/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|true|false|null)$/u.test(
		rawValue.trim(),
	);
}

const rawUsageAt = (
	source: string,
	node: OxcNode,
	property: string,
	condition: string,
	dynamic = false,
): RawUsage => {
	const start = numberAt(node, "start") ?? 0;
	const end = numberAt(node, "end") ?? start;
	const rawValue = sourceText(source, node) ?? "";
	return {
		property,
		condition,
		rawValue,
		tokenRef: dynamic ? null : tokenRefIn(rawValue),
		dynamic: dynamic || isDynamicValue(rawValue),
		start,
		end,
	};
};

const objectPropertyName = (property: OxcNode, source: string): string | undefined => {
	if (property.computed === true) return undefined;
	const key = oxcNodeAt(property, "key");
	if (key === undefined) return undefined;
	if (key.type === NodeKind.Identifier) return stringAt(key, "name");
	const literal = key.value;
	if (typeof literal === "string" || typeof literal === "number") return String(literal);
	const authored = sourceText(source, key);
	if (authored === undefined) return undefined;
	if (
		(authored.startsWith('"') && authored.endsWith('"')) ||
		(authored.startsWith("'") && authored.endsWith("'"))
	)
		return authored.slice(1, -1);
	return undefined;
};

const collectObjectUsages = (
	source: string,
	object: OxcNode,
	condition: string,
	collected: RawUsage[],
): void => {
	for (const property of oxcNodesAt(object, "properties")) {
		if (property.type === NodeKind.SpreadElement) {
			collected.push(rawUsageAt(source, property, "", condition, true));
			continue;
		}
		const key = objectPropertyName(property, source);
		if (key === undefined || property.computed === true) {
			collected.push(rawUsageAt(source, property, "", condition, true));
			continue;
		}
		const value = oxcNodeAt(property, "value");
		if (value?.type === NodeKind.ObjectExpression) {
			const nestedCondition = condition === "" ? key : `${condition}.${key}`;
			collectObjectUsages(source, value, nestedCondition, collected);
			continue;
		}
		collected.push(rawUsageAt(source, value ?? property, key, condition, value === undefined));
	}
};

const callRootName = (call: OxcNode): string | undefined => {
	let callee = oxcNodeAt(call, "callee");
	while (callee?.type === NodeKind.MemberExpression) callee = oxcNodeAt(callee, "object");
	return callee?.type === NodeKind.Identifier ? stringAt(callee, "name") : undefined;
};

interface PolicySets {
	strictProperties: ReadonlySet<string>;
	allowedValues: ReadonlySet<string>;
	allowedPrefixes: readonly string[];
	allowedByProperty: Readonly<Record<string, ReadonlySet<string>>>;
}

export function policySets(policy: TokenPolicySnapshot | null): PolicySets {
	return {
		strictProperties: new Set(policy?.strictProperties ?? []),
		allowedValues: new Set(policy?.allowedRawValues ?? []),
		allowedPrefixes: policy?.allowedRawPrefixes ?? [],
		allowedByProperty: Object.fromEntries(
			Object.entries(policy?.allowedRawValuesByProperty ?? {}).map(([k, v]) => [k, new Set(v)]),
		),
	};
}

export function classifyStrictness(
	usage: Pick<RawUsage, "property" | "tokenRef" | "dynamic" | "rawValue">,
	policy: TokenPolicySnapshot | null,
	sets: PolicySets,
): TokenUsage["strictness"] {
	if (usage.dynamic) return "dynamic";
	if (usage.tokenRef !== null) {
		return policy !== null && policy.resolved ? "token" : "unknown";
	}
	const literal = usage.rawValue.replace(/^["']|["']$/g, "");
	if (policy === null || !policy.resolved) return "unknown";
	// Official-config vocabulary: a bare literal the project declared for this
	// property (colors.red-500 as "red-500", spacing.4 as "4") is a verified
	// token reference — the config itself vouches for the mapping.
	if (policy.tokenVocabulary !== undefined) {
		const vocab = policy.tokenVocabulary[usage.property];
		if (vocab !== undefined && typeof vocab[literal] === "string") return "token";
	}
	const propertyAllowed = sets.allowedByProperty[usage.property]?.has(literal) ?? false;
	if (
		sets.allowedValues.has(literal) ||
		propertyAllowed ||
		sets.allowedPrefixes.some((prefix) => literal.startsWith(prefix))
	) {
		return "raw-allowed";
	}
	if (sets.strictProperties.has(usage.property)) return "raw-strict-violation";
	return "raw-allowed";
}

const emptyBoundaries = (): Record<GovernanceCoverageBoundary, string[]> => ({
	"dynamic-expression": [],
	"runtime-theme-access": [],
	"generated-css": [],
	"public-export": [],
	safelist: [],
	"plugin-output": [],
	"unscanned-file": [],
	"configuration-failure": [],
	"unresolved-import": [],
});

/**
 * Collect governance usage facts from tw()/css call-site literals.
 * Unresolved (dynamic) sites are reported separately and land in the
 * dynamic-expression boundary; they never masquerade as token usage.
 */
export function collectTokenUsage(
	files: ReadonlyArray<UsageCollectorFile>,
	policy: TokenPolicySnapshot | null,
): UsageCollectionResult {
	const sets = policySets(policy);
	const usages: TokenUsage[] = [];
	const dynamicSites: TokenUsage[] = [];
	const boundaries = emptyBoundaries();

	for (const file of files) {
		const fileRaws: RawUsage[] = [];
		try {
			const scanned = SOURCE_SCANNER_SERVICE.scan({ file: file.file, source: file.content });
			if (scanned.program === undefined || scanned.diagnostics.length > 0) {
				boundaries["unscanned-file"].push(file.file);
				continue;
			}
			walk(scanned.program, (node) => {
				if (node.type !== NodeKind.CallExpression) return;
				const rootName = callRootName(node);
				if (rootName !== "tw" && rootName !== "css") return;
				for (const argument of oxcNodesAt(node, "arguments")) {
					if (argument.type === NodeKind.ObjectExpression) {
						collectObjectUsages(file.content, argument, "", fileRaws);
						continue;
					}
					fileRaws.push(rawUsageAt(file.content, argument, "", "", true));
				}
			});
		} catch {
			boundaries["unscanned-file"].push(file.file);
			continue;
		}
		for (const raw of fileRaws) {
			const strictness = classifyStrictness(raw, policy, sets);
			// Vocabulary-classified bare literals carry their canonical id
			// (or $name authored form for ambiguous names) so the resolver
			// and reachability can count them as real token usage.
			const literal = raw.rawValue.replace(/^["']|["']$/g, "");
			const vocabId =
				raw.tokenRef === null && strictness === "token"
					? policy?.tokenVocabulary?.[raw.property]?.[literal]
					: undefined;
			const fact: TokenUsage = {
				tokenId: raw.tokenRef ?? vocabId ?? UNRESOLVED_TOKEN_ID,
				kind: "direct",
				file: file.file,
				start: raw.start,
				end: raw.end,
				property: raw.property,
				...(raw.condition === "" ? {} : { condition: raw.condition }),
				rawValue: raw.rawValue,
				strictness,
				confidence:
					raw.dynamic === true
						? "unknown"
						: policy !== null && policy.resolved
							? "verified"
							: "inferred",
			};
			if (raw.dynamic) {
				dynamicSites.push(fact);
				boundaries["dynamic-expression"].push(file.file);
				continue;
			}
			usages.push(fact);
		}
	}
	return { usage: usages, dynamicSites, boundaryHits: boundaries };
}

/**
 * Resolve authored token references against the effective universe.
 * "$colors.red-500" -> "colors::red-500" directly; a bare "$red-500" must
 * match exactly one definition name (ambiguity across groups stays
 * unknown rather than guessing); unmatched references become unknown.
 */
export function resolveUsageAgainstDefinitions(
	usage: ReadonlyArray<TokenUsage>,
	definitions: ReadonlyArray<TokenDefinition>,
): Array<TokenUsage> {
	const idsByName = new Map<string, string[]>();
	for (const def of definitions) {
		const list = idsByName.get(def.name) ?? [];
		list.push(def.id);
		idsByName.set(def.name, list);
	}
	return usage.map((u) => {
		if (u.tokenId === UNRESOLVED_TOKEN_ID || u.strictness === "dynamic") return u;
		const authored = u.tokenId.replace(/^\$/, "");
		const dot = authored.indexOf(".");
		let exact: string | undefined;
		// Already-canonical ids (per-property vocabulary classification) skip
		// re-resolution; the id is the definition identity itself.
		if (authored.includes("::")) {
			return {
				...u,
				tokenId: authored,
				strictness: "token" as const,
				confidence: "verified" as const,
			};
		}
		if (dot !== -1) {
			const group = authored.slice(0, dot);
			const name = authored.slice(dot + 1);
			exact = group + "::" + name;
		} else {
			const matches = idsByName.get(authored) ?? [];
			if (matches.length === 1) exact = matches[0];
		}
		if (exact !== undefined) {
			return {
				...u,
				tokenId: exact,
				strictness: "token" as const,
				confidence: "verified" as const,
			};
		}
		return { ...u, strictness: "unknown" as const, confidence: "unknown" as const };
	});
}
