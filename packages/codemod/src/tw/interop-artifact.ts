import { extractTwConfigFromSources, type TwConfig } from "pandwind/vite/inline";
import type { UtilityBridge } from "pandwind/tw";
import { UTILITY_SUBKEYS } from "pandwind/tw/compile";

/** Stable generated metadata consumed by migration and analysis tooling. */
export const PANDWIND_INTEROP_SCHEMA = "pandwind.interop/2" as const;

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
}

export interface BuildPandwindInteropArtifactOptions {
	readonly typesDts: string;
	readonly twTs: string;
	readonly twRuntimeTs?: string;
	readonly twConflictsTs?: string;
	readonly twBuildTs?: string;
	readonly bridge?: UtilityBridge;
	readonly themeBlock?: string;
}

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
	};
}
