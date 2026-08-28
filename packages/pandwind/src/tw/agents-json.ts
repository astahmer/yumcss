/**
 * `pandwind.agents.json` — machine-readable capability file for AI agents
 * (plans/014 §5). Derived from the ACTUAL generated artifacts at codegen
 * time, so it cannot drift from the compiled design system: everything in
 * the file provably exists, and the verification workflows ship inside it.
 *
 * Positioning vs static conventions (design.md/impeccable): those describe
 * intent; this describes state, and pairs with tooling (typecheck errors on
 * wrong utilities, analyze missing-css gate) that proves agent output.
 */
import type { TwConfig } from "../vite/inline.ts";

const AGENTS_SCHEMA = "pandwind.agents/1";
/** Cap per-key literal lists; huge unions keep only a sample + total count. */
const VALUES_CAP = 50;

export interface AgentsUtility {
	values: string[];
	valueCount: number;
	arbitrary: boolean;
}

export interface AgentsDocument {
	schema: string;
	generatedFrom: {
		types: string;
		runtime: string;
		bridge?: string;
		interop: string;
		theme?: string;
	};
	utilities: Record<string, AgentsUtility>;
	variants: string[];
	conflictsSummary: Record<string, Array<string>>;
	compose: Array<string>;
	themeScopes: Array<string>;
	semanticTokens: Record<string, string>;
	workflows: Record<string, string>;
	constraints: string;
}

const CAMEL = (s: string): string => (s.length === 0 ? s : s[0]!.toLowerCase() + s.slice(1));

/**
 * Parse `type XxxValue = WithOpacityModifiers<"a" | "b"> | (string & {});`
 * entries from the generated types.d.ts into per-utility value lists.
 * `(string & {})` marks the arbitrary escape hatch.
 */
export function utilitiesFromTypesDts(typesDts: string): Record<string, AgentsUtility> {
	const out: Record<string, AgentsUtility> = {};
	const re = /type (\w+) = ([^;\n]+);/g;
	for (const match of typesDts.matchAll(re)) {
		const typeName = match[1]!;
		if (!typeName.endsWith("Value")) continue;
		const body = match[2]!;
		const key = CAMEL(typeName.slice(0, -"Value".length));
		const values = [...body.matchAll(/"([^"]*)"/g)].map((m) => m[1]!);
		const arbitrary = body.includes("string & {}");
		out[key] = {
			values: values.slice(0, VALUES_CAP),
			valueCount: values.length,
			arbitrary,
		};
	}
	return out;
}

/** Per-utility property families from the conflict map (capped, small). */
export function conflictsSummary(
	conflicts: Record<string, Record<string, string[]>>,
): Record<string, Array<string>> {
	const out: Record<string, Array<string>> = {};
	for (const [utility, byValue] of Object.entries(conflicts)) {
		const props = new Set<string>();
		for (const list of Object.values(byValue)) {
			for (const p of list) props.add(p);
		}
		out[utility] = [...props].slice(0, 8);
	}
	return out;
}

export function buildAgentsDocument(options: {
	typesDts: string;
	config: TwConfig;
	themeBlock: string;
	artifactDir: string;
}): AgentsDocument {
	const { config } = options;
	const themeScopes = [...options.themeBlock.matchAll(/\[data-theme="([^"]+)"\]/g)].map(
		(m) => `[data-theme="${m[1]}"]`,
	);
	const semanticTokens: Record<string, string> = {};
	for (const line of options.themeBlock.split("\n")) {
		const m = /^\s*(--[\w-]+):\s*(.+?)\s*;?$/.exec(line);
		if (m !== null && semanticTokens[m[1]!] === undefined) semanticTokens[m[1]!] = m[2]!.trim();
	}
	return {
		schema: AGENTS_SCHEMA,
		generatedFrom: {
			types: `${options.artifactDir}/types.d.ts`,
			runtime: `${options.artifactDir}/tw.ts`,
			bridge: `${options.artifactDir}/bridge.ts`,
			interop: `${options.artifactDir}/pandwind.interop.json`,
			theme: options.themeBlock ? `${options.artifactDir}/pandwind-theme.css` : undefined,
		},
		utilities: utilitiesFromTypesDts(options.typesDts),
		variants: Object.keys(config.variants ?? {}),
		conflictsSummary: conflictsSummary(config.conflicts as never),
		compose: [...(config.compose ?? [])],
		themeScopes,
		semanticTokens,
		workflows: {
			verifyTypes: "pnpm typecheck",
			verifyCoverage: "pnpm analyze --json",
			missingCssGate: "analyze --json → totalMissingCss must be 0",
		},
		constraints:
			"User-facing API is frozen; unknown classes are kept but render unstyled; a wrong utility name is a TypeScript error; unresolvable tokens are skipped loudly, never guessed.",
	};
}
