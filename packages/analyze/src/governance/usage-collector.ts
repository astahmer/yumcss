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

const BTICK = String.fromCharCode(96);
const CALL_REGEX = /\b(?:tw|css)(?:\s*\.\s*\w+)?\s*\(\s*\{/g;
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

/** Extract balanced {...} body; null when unbalanced. */
function matchBlock(source: string, open: number): string | null {
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) return source.slice(open + 1, i);
		}
	}
	return null;
}

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
	if (rawValue.startsWith(BTICK)) return true;
	if (rawValue.startsWith('"') || rawValue.startsWith("'")) return false;
	if (rawValue.startsWith("$")) return false;
	return /^[A-Za-z_$][\w$]*$/.test(rawValue.trim());
}

function walkObject(
	body: string,
	bodyOffset: number,
	condition: string,
	collected: Array<RawUsage>,
): void {
	let segment = "";
	let segmentStart = 0;
	const flushTopLevel = (): void => {
		const trimmed = segment.trim();
		if (trimmed !== "") {
			const colon = trimmed.indexOf(":");
			if (colon !== -1) {
				const key = trimmed
					.slice(0, colon)
					.trim()
					.replace(/^["']|["']$/g, "");
				const rawValue = trimmed.slice(colon + 1).trim();
				if (key !== "" && rawValue !== "" && rawValue !== "{" && rawValue !== "[") {
					const valueAt = segment.indexOf(rawValue);
					const start = bodyOffset + segmentStart + (valueAt === -1 ? 0 : valueAt);
					collected.push({
						property: key,
						condition,
						rawValue,
						tokenRef: tokenRefIn(rawValue),
						dynamic: isDynamicValue(rawValue),
						start,
						end: start + rawValue.length,
					});
				}
			}
		}
		segment = "";
		segmentStart = 0;
	};
	for (let i = 0; i < body.length; i++) {
		const ch = body[i]!;
		if (ch === '"' || ch === "'" || ch === BTICK) {
			const quote = ch;
			segment += ch;
			i++;
			while (i < body.length && body[i] !== quote) {
				if (body[i] === "\\") {
					segment += body.slice(i, i + 2);
					i += 2;
					continue;
				}
				segment += body[i]!;
				i++;
			}
			if (i < body.length) segment += quote;
			continue;
		}
		if (ch === "/" && body[i + 1] === "/") {
			while (i < body.length && body[i] !== "\n") i++;
			continue;
		}
		if (ch === "{") {
			const condName = /^["']?([\w$*-]+)["']?\s*:\s*$/.exec(segment.trim())?.[1] ?? "";
			flushTopLevel();
			const nestedCondition =
				condName === "" ? condition : condition === "" ? condName : condition + "." + condName;
			let innerDepth = 1;
			const innerStart = i + 1;
			while (i < body.length && innerDepth > 0) {
				i++;
				if (body[i] === "{") innerDepth++;
				else if (body[i] === "}") innerDepth--;
			}
			walkObject(body.slice(innerStart, i), bodyOffset + innerStart, nestedCondition, collected);
			segment = "";
			segmentStart = 0;
			continue;
		}
		if (ch === ",") {
			flushTopLevel();
			continue;
		}
		if (segment === "") segmentStart = i;
		segment += ch;
	}
	flushTopLevel();
}

export interface PolicySets {
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
		for (const match of file.content.matchAll(CALL_REGEX)) {
			const open = (match.index ?? 0) + match[0].length - 1;
			const body = matchBlock(file.content, open);
			if (body === null) continue;
			const raws: Array<RawUsage> = [];
			walkObject(body, open + 1, "", raws);
			for (const raw of raws) {
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
