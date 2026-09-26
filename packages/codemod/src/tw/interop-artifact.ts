import { extractTwConfigFromSources, type TwConfig } from "pandwind/vite/inline";
import type { UtilityBridge } from "pandwind/tw";
import { UTILITY_SUBKEYS } from "pandwind/tw/compile";
import { z } from "zod";
import { parseTokenDocument, type TokenDocument } from "../swap/token-document.ts";
import type { TokenFormatLoss } from "../swap/token-format-contracts.ts";

/** Stable generated metadata consumed by migration and analysis tooling. */
export const PANDWIND_INTEROP_SCHEMA = "pandwind.interop/3" as const;
export const PANDWIND_INTEROP_V2_SCHEMA = "pandwind.interop/2" as const;
export const PANDWIND_INTEROP_TOKEN_SCHEMA = "pandwind.interop.tokens/1" as const;

export interface PandwindInteropUtility {
	readonly key: string;
	readonly base: string;
	readonly valueType?: string;
}

export interface PandwindInteropArtifact {
	readonly schema: typeof PANDWIND_INTEROP_SCHEMA;
	/** Paths are relative to the directory containing this artifact. */
	readonly generatedFrom: {
		readonly types: string;
		readonly runtime: string;
		readonly bridge: string;
		readonly theme?: string;
	};
	readonly utilities: readonly PandwindInteropUtility[];
	/** Named value unions shared by utility rows that use the same generated type. */
	readonly valueTypes: Readonly<Record<string, readonly string[]>>;
	readonly tw: {
		readonly variants: TwConfig["variants"];
		readonly conflicts: TwConfig["conflicts"];
		readonly compose: TwConfig["compose"];
	};
	/** property -> resolved value -> emitted utility class */
	readonly bridge: UtilityBridge;
	readonly theme: {
		readonly variables: Readonly<Record<string, string>>;
		readonly scopes: readonly string[];
	};
	readonly tokens: PandwindInteropTokenSnapshot;
}

export type PandwindInteropTokenSnapshot =
	| {
			readonly schema: typeof PANDWIND_INTEROP_TOKEN_SCHEMA;
			readonly state: "available";
			readonly source: {
				readonly kind: "configured-token-module";
				readonly module: string;
				readonly fingerprint: string;
			};
			readonly fidelity: {
				readonly status: "lossless" | "lossy";
				readonly losses: readonly TokenFormatLoss[];
			};
			readonly document: TokenDocument;
	  }
	| {
			readonly schema: typeof PANDWIND_INTEROP_TOKEN_SCHEMA;
			readonly state: "unavailable";
			readonly source: null;
			readonly fidelity: null;
			readonly document: null;
			readonly diagnostics: readonly string[];
	  };

export interface ExistingPandwindInteropTokenSnapshot {
	readonly tokens: PandwindInteropTokenSnapshot;
}

export interface BuildPandwindInteropArtifactOptions {
	readonly typesDts: string;
	readonly twTs: string;
	readonly twRuntimeTs?: string;
	readonly twConflictsTs?: string;
	readonly twBuildTs?: string;
	readonly bridge?: UtilityBridge;
	readonly themeBlock?: string;
	readonly tokenDocument?: TokenDocument;
	readonly tokenSource?: string;
	readonly tokenSnapshot?: PandwindInteropTokenSnapshot;
}

const TokenLossSchema = z.strictObject({
	path: z.string(),
	feature: z.string(),
	reason: z.string(),
});
const TokenSnapshotSchema = z.discriminatedUnion("state", [
	z.strictObject({
		schema: z.literal(PANDWIND_INTEROP_TOKEN_SCHEMA),
		state: z.literal("available"),
		source: z.strictObject({
			kind: z.literal("configured-token-module"),
			module: z.string(),
			fingerprint: z.string(),
		}),
		fidelity: z.strictObject({
			status: z.enum(["lossless", "lossy"]),
			losses: z.array(TokenLossSchema),
		}),
		document: z.json(),
	}),
	z.strictObject({
		schema: z.literal(PANDWIND_INTEROP_TOKEN_SCHEMA),
		state: z.literal("unavailable"),
		source: z.null(),
		fidelity: z.null(),
		document: z.null(),
		diagnostics: z.array(z.string()).min(1),
	}),
]);

const PandwindInteropArtifactSchema = z.strictObject({
	schema: z.literal(PANDWIND_INTEROP_SCHEMA),
	generatedFrom: z.strictObject({
		types: z.string(),
		runtime: z.string(),
		bridge: z.string(),
		theme: z.string().optional(),
	}),
	utilities: z.array(
		z.strictObject({ key: z.string(), base: z.string(), valueType: z.string().optional() }),
	),
	valueTypes: z.record(z.string(), z.array(z.string())),
	tw: z.strictObject({ variants: z.json(), conflicts: z.json(), compose: z.json() }),
	bridge: z.record(z.string(), z.record(z.string(), z.string())),
	theme: z.strictObject({
		variables: z.record(z.string(), z.string()),
		scopes: z.array(z.string()),
	}),
	tokens: TokenSnapshotSchema,
});

export const parsePandwindInteropArtifact = (value: unknown): PandwindInteropArtifact => {
	const result = PandwindInteropArtifactSchema.safeParse(value);
	if (!result.success) {
		throw new Error(
			`pandwind interop: invalid pandwind.interop/3 artifact: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
		);
	}
	const tokens =
		result.data.tokens.state === "available"
			? { ...result.data.tokens, document: parseTokenDocument(result.data.tokens.document) }
			: result.data.tokens;
	return { ...result.data, tokens } as PandwindInteropArtifact;
};

const dashCase = (name: string): string =>
	name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

const utilityBase = (name: string): string => UTILITY_SUBKEYS[name] ?? dashCase(name);

function typeLiterals(typesDts: string): Map<string, string[]> {
	const aliases = new Map<string, string[]>();
	for (const match of typesDts.matchAll(/type ([A-Za-z_$][\w$]*) = ([^;\n]+);/g)) {
		aliases.set(
			match[1]!,
			[...match[2]!.matchAll(/"([^"]+)"/g)].map((literal) => literal[1]!),
		);
	}
	return aliases;
}

function utilityMetadataFromTypes(typesDts: string): {
	readonly utilities: readonly PandwindInteropUtility[];
	readonly valueTypes: Readonly<Record<string, readonly string[]>>;
} {
	const aliases = typeLiterals(typesDts);
	const bodyMatch = /interface WindUtilities\b[^{]*\{([\s\S]*?)\n\}/.exec(typesDts);
	if (bodyMatch === null) throw new Error("pandwind interop: no WindUtilities interface");
	const utilities: PandwindInteropUtility[] = [];
	const usedValueTypes = new Set<string>();
	const entry = /"([^"]+)"\?:\s*([A-Za-z_$][\w$]*)\s*\|\s*true/g;
	for (const match of bodyMatch[1]!.matchAll(entry)) {
		const valueType = match[2]!;
		usedValueTypes.add(valueType);
		utilities.push({ key: match[1]!, base: utilityBase(match[1]!), valueType });
	}
	return {
		utilities,
		valueTypes: Object.fromEntries(
			[...usedValueTypes].map((valueType) => [valueType, aliases.get(valueType) ?? []]),
		),
	};
}

function themeMetadata(themeBlock: string): PandwindInteropArtifact["theme"] {
	const variables: Record<string, string> = {};
	for (const line of themeBlock.split("\n")) {
		const match = /^\s*(--[\w-]+):\s*(.+?)\s*;?$/.exec(line);
		if (match !== null && variables[match[1]!] === undefined) variables[match[1]!] = match[2]!;
	}
	return {
		variables,
		scopes: [...themeBlock.matchAll(/\[data-theme="([^"]+)"\]/g)].map(
			(match) => `[data-theme="${match[1]}"]`,
		),
	};
}

/** Build the JSON-safe metadata contract from generated codegen artifacts. */
export function buildPandwindInteropArtifact(
	options: BuildPandwindInteropArtifactOptions,
): PandwindInteropArtifact {
	const config = extractTwConfigFromSources([
		options.twTs,
		...(options.twRuntimeTs === undefined ? [] : [options.twRuntimeTs]),
		...(options.twConflictsTs === undefined ? [] : [options.twConflictsTs]),
		...(options.twBuildTs === undefined ? [] : [options.twBuildTs]),
	]);
	if (config === undefined) throw new Error("pandwind interop: could not read generated tw config");
	const utilityMetadata = utilityMetadataFromTypes(options.typesDts);
	return {
		schema: PANDWIND_INTEROP_SCHEMA,
		generatedFrom: {
			types: "types.d.ts",
			runtime: "tw.ts",
			bridge: "bridge.ts",
			...(options.themeBlock ? { theme: "pandwind-theme.css" } : {}),
		},
		...utilityMetadata,
		tw: {
			variants: config.variants,
			conflicts: config.conflicts,
			compose: config.compose,
		},
		bridge: options.bridge ?? {},
		theme: themeMetadata(options.themeBlock ?? ""),
		tokens:
			options.tokenSnapshot ??
			(options.tokenDocument === undefined
				? {
						schema: PANDWIND_INTEROP_TOKEN_SCHEMA,
						state: "unavailable",
						source: null,
						fidelity: null,
						document: null,
						diagnostics: ["No codegen token module was supplied for this artifact."],
					}
				: (() => {
						const document = parseTokenDocument(options.tokenDocument);
						const losses = document.sourceLosses ?? [];
						return {
							schema: PANDWIND_INTEROP_TOKEN_SCHEMA,
							state: "available",
							source: {
								kind: "configured-token-module",
								module: options.tokenSource ?? "unspecified token module",
								fingerprint: document.sourceFingerprint,
							},
							fidelity: { status: losses.length === 0 ? "lossless" : "lossy", losses },
							document,
						};
					})()),
	};
}
