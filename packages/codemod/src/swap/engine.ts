/**
 * Engine-backed resolution of bridge misses (plans/022 follow-up).
 *
 * When `--engine` is set, a tw utility the generated bridge does not know
 * (`bg-sky-600` for a value outside the preset) is resolved through the REAL
 * Tailwind engine — the same `@tailwindcss/node` machinery generate-types.ts
 * uses at codegen time. The engine boots once per run (lazy, cached) and the
 * resolver closure is synchronous afterwards, so parsers stay sync.
 *
 * Fails soft: any engine error degrades to null and the call site falls back
 * to its residual + skip marker.
 */
import { __unstable__loadDesignSystem } from "@tailwindcss/node";
import { readFileSync } from "node:fs";

export interface MissDeclaration {
	prop: string;
	value: string;
}

export type TwMissResolver = (utilityClass: string) => MissDeclaration[] | null;

interface EngineSystem {
	candidatesToCss: (candidates: string[]) => Array<string | null>;
}

/** Extract `prop:value;` pairs from a Tailwind rule body. */
function parseRuleDeclarations(rule: string): MissDeclaration[] | null {
	const open = rule.indexOf("{");
	const close = rule.lastIndexOf("}");
	if (open === -1 || close === -1 || close <= open) return null;
	const body = rule.slice(open + 1, close);
	const out: MissDeclaration[] = [];
	for (const statement of body.split(";")) {
		const trimmed = statement.trim();
		if (trimmed === "") continue;
		const colon = trimmed.indexOf(":");
		if (colon === -1) return null;
		const prop = trimmed.slice(0, colon).trim();
		const value = trimmed.slice(colon + 1).trim();
		if (!/^[a-z-]+$/i.test(prop) || value === "") return null;
		out.push({ prop: prop.replace(/-(\w|$)/g, (_m, c: string) => c.toUpperCase()), value });
	}
	return out.length > 0 ? out : null;
}

export interface CreateEngineResolverOptions {
	/** Theme css fed to the Tailwind engine (preset @theme block or app css). */
	css: string;
	/** Base dir for the engine (url resolution of assets). */
	base: string;
}

/**
 * Boot the Tailwind engine once and return a sync miss resolver.
 * `css` should be the app's theme entry (the same input tw codegen uses).
 */
export async function createEngineMissResolver(
	options: CreateEngineResolverOptions,
): Promise<TwMissResolver> {
	let css = options.css;
	if (!css.includes("@import") && !css.includes("@theme")) {
		try {
			css += "\n" + readFileSync(options.base.replace(/\/$/, "") + "/tailwind.css", "utf8");
		} catch {
			// caller-supplied css is enough when no adjacent tailwind.css exists
		}
	}
	const system = (await __unstable__loadDesignSystem(css, {
		base: options.base,
	})) as unknown as EngineSystem;

	return (utilityClass: string): MissDeclaration[] | null => {
		try {
			const results = system.candidatesToCss([utilityClass]);
			const rule = results[0];
			if (typeof rule !== "string" || !rule.includes("{")) return null;
			return parseRuleDeclarations(rule);
		} catch {
			return null;
		}
	};
}

/** Test helper: build a resolver from a static class -> declarations table. */
export function staticMissResolver(table: Record<string, MissDeclaration[]>): TwMissResolver {
	return (utilityClass) => table[utilityClass] ?? null;
}
