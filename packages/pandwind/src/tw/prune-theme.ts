#!/usr/bin/env nub
/**
 * @theme var pruning — keep only the theme variables the app's scanned
 * sources actually use (plans/012 §1a, pandabox unused-variable pruning).
 *
 * Empirical, not heuristic: the scanned tw() classes are compiled through
 * the REAL Tailwind engine against a stylesheet containing the full bridge,
 * and the compiled CSS is mined for the `--*` custom properties that
 * survived. A theme var stays only if the compiler referenced it. This is
 * the same "proven, not assumed" standard as the parity suites.
 *
 * Documented caveat (same as pandabox): pruning breaks DYNAMIC token
 * access — code that builds utility names at runtime (`bg-${color}`) or
 * reads vars via token()-style helpers will reference pruned variables.
 * Opt-in via `--prune-theme <glob...>` on tw:codegen.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compile } from "@tailwindcss/node";
import { parse } from "postcss";
import { collectTwClasses, walkDir } from "./collect.ts";

const PRUNABLE_VAR = /--[\w-]+/g;

/** Extract the `@theme { ... }` block body from a full bridge document. */
export const themeBlockBody = (bridge: string): string | null => {
	const start = bridge.indexOf("@theme {");
	if (start === -1) return null;
	const open = bridge.indexOf("{", start);
	const close = bridge.indexOf("\n}", open);
	return bridge.slice(open + 1, close);
};

/**
 * Filter a generated bridge document down to the variables in `usedVars`.
 * Keeps every non-@theme section (condition-bound override rules) as-is:
 * overrides only exist for condition-bound tokens whose base bridged, and
 * their semantics are tied to the base var surviving.
 */
export function filterBridgeByUsedVars(bridge: string, usedVars: ReadonlySet<string>): string {
	const body = themeBlockBody(bridge);
	if (body === null) return bridge;
	const keptLines = body
		.split("\n")
		.filter((line) => {
			const trimmed = line.trim();
			if (trimmed === "") return false;
			const match = /^--[\w-]+/.exec(trimmed);
			return match !== null && usedVars.has(match[0]);
		})
		.join("\n");
	const keptTheme = keptLines === "" ? "" : `@theme {\n${keptLines}\n}`;
	const themeStart = bridge.indexOf("@theme {");
	const closeIdx = bridge.indexOf("\n}", themeStart);
	const head = bridge.slice(0, themeStart);
	const tail = bridge.slice(closeIdx + 2);
	return `${head}${keptTheme}${tail}`;
}

export interface PruneOptions {
	/** Full generated bridge (@theme block + optional override rules). */
	themeBlock: string;
	/** Source files to scan for tw() class usage. */
	files: Array<string>;
	/** The app's generated tw.ts entry (exact runtime instance). */
	twEntry: string;
	/** Base directory for Tailwind module resolution. */
	base: string;
}

/**
 * Compile the scanned classes through the real engine and return the set of
 * bridge custom-property names it actually emitted. Utilities are
 * independent, so co-compiling the whole candidate list mirrors what the
 * safelist build does and cannot change var usage per class.
 */
export async function usedBridgeVars(options: PruneOptions): Promise<Set<string>> {
	const classes = await collectTwClasses(options.files, options.twEntry);
	const cssInput = `@import "tailwindcss";\n${options.themeBlock}\n`;
	const compiled = await compile(cssInput, {
		base: options.base,
		onDependency: () => {},
	});
	const root = parse(compiled.build(classes));
	const text = root.toString();
	const used = new Set<string>();
	for (const match of text.matchAll(PRUNABLE_VAR)) {
		if (options.themeBlock.includes(match[0])) used.add(match[0]);
	}
	return used;
}

/** One-shot helper: scan, compile, filter. Returns the pruned bridge. */
export async function pruneThemeBlock(options: PruneOptions): Promise<string> {
	const used = await usedBridgeVars(options);
	return filterBridgeByUsedVars(options.themeBlock, used);
}

if (process.argv[1]?.endsWith("prune-theme.ts")) {
	const [themeCssArg, twEntryArg, srcDirArg] = process.argv.slice(2);
	const base = process.cwd();
	const themeCssPath = resolve(base, themeCssArg ?? "src/pandwind-theme.css");
	const twEntry = resolve(base, twEntryArg ?? "src/tw.ts");
	const srcDir = resolve(base, srcDirArg ?? "src");

	const { writeFileSync } = await import("node:fs");
	const before = readFileSync(themeCssPath, "utf8");
	const after = await pruneThemeBlock({
		themeBlock: before,
		files: walkDir(srcDir),
		twEntry,
		base,
	});
	writeFileSync(themeCssPath, `${after}\n`);
	console.log(
		`pandwind: pruned ${themeCssPath} ` +
			`(${(before.match(/\n\t--/g) ?? []).length} -> ${(after.match(/\n\t--/g) ?? []).length} theme vars from ${walkDir(srcDir).length} scanned files)`,
	);
}
