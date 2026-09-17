/**
 * Regenerate the Panda preset data module.
 *
 * Every value comes from the installed @pandacss/config resolver reading
 * Panda's stock default configuration, so the shipped preset tracks the
 * version this workspace pins instead of a transcribed list.
 *
 * Usage: pnpm run presets:generate
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const pandwindPackageRoot = join(repositoryRoot, "packages/pandwind");
const requireFromPandwind = createRequire(join(pandwindPackageRoot, "package.json"));

/** Checked-in data module this generator owns. */
export const pandaPresetModulePath = join(
	pandwindPackageRoot,
	"src/preset/generated/panda-theme.ts",
);

export interface PandaTokenLeaf {
	readonly value: string | number | ReadonlyArray<string>;
}

export type PandaTokenEntry = PandaTokenLeaf | Record<string, PandaTokenLeaf>;

/**
 * Narrow a theme entry to a leaf. The authored shape is not discriminated, so
 * the scalar check is what separates `{ 100: {...} }` from `{ value: ... }`.
 */
export const isTokenLeaf = (entry: unknown): entry is PandaTokenLeaf =>
	typeof entry === "object" &&
	entry !== null &&
	"value" in entry &&
	(typeof entry.value === "string" ||
		typeof entry.value === "number" ||
		Array.isArray(entry.value));

export interface PandaUtility {
	readonly values?: unknown;
	readonly transform?: (
		value: string,
		options: { readonly utils: unknown },
	) => Record<string, unknown>;
}

export interface PandaConfig {
	readonly conditions: Record<string, string>;
	readonly theme: {
		readonly tokens: Record<string, Record<string, PandaTokenEntry>>;
		readonly breakpoints: Record<string, string>;
	};
	readonly utilities: Record<string, PandaUtility>;
}

export interface PandaConfigLoader {
	readonly resolveConfig: (
		options: {
			readonly config: Record<string, unknown>;
			readonly dependencies: ReadonlyArray<string>;
			readonly path: string;
		},
		cwd: string,
	) => Promise<{ readonly config: PandaConfig }>;
}

/**
 * Token scales Panda owns but Pandwind cannot reach.
 *
 * "blurs" is deliberately absent: Panda reads that scale only through its
 * "blur" and "backdropBlur" utilities, which write a --blur custom property
 * instead of a CSS property, so no property binding could resolve the group
 * and its :root declarations would be unreachable bytes.
 */
const droppedTokenGroups = new Set(["blurs"]);

const collapsed = (value: string): string => value.replaceAll(/\s+/gu, " ").trim();

const leafValue = (leaf: PandaTokenLeaf): string =>
	Array.isArray(leaf.value) ? leaf.value.map(collapsed).join(", ") : collapsed(String(leaf.value));

/**
 * Color keys carry the $ sigil the CSS runtime reads as a token reference, so
 * color: "$red.500" resolves. The bare red.500 spelling stays valid as its
 * canonical alias, which is the path Panda itself uses.
 */
const tokenKey = (group: string, name: string): string => (group === "colors" ? "$" + name : name);

const flattenGroup = (
	group: string,
	entries: Record<string, PandaTokenEntry>,
): Record<string, string> => {
	const flat: Record<string, string> = {};
	for (const [name, entry] of Object.entries(entries)) {
		if (isTokenLeaf(entry)) {
			flat[tokenKey(group, name)] = leafValue(entry);
			continue;
		}
		for (const [nestedName, leaf] of Object.entries(entry)) {
			flat[tokenKey(group, name + "." + nestedName)] = leafValue(leaf);
		}
	}
	return flat;
};

/** The literal a var(--name, fallback) declaration carries as its fallback. */
const varFallback = (value: string): string => {
	const match = /^var\([^,]+,\s*(.+)\)$/u.exec(value);
	return match?.[1] ?? value;
};

const keywordList = (value: unknown, label: string): ReadonlyArray<string> => {
	if (!Array.isArray(value)) throw new Error("Panda publishes no " + label + " keyword list");
	return value.map(String);
};

/**
 * Panda's transition keyword vocabulary, composed into the single shorthand
 * Pandwind binds.
 *
 * The utility answers with a property list plus a duration and an easing, each
 * behind a custom property whose fallback is the literal Panda means; the
 * keyword "none" is a plain declaration Panda keeps out of its values list, so
 * it is added here.
 */
const composedTransitions = (config: PandaConfig): Record<string, string> => {
	const utility = config.utilities.transition;
	if (utility?.transform === undefined) throw new Error("Panda publishes no transition utility");
	const utils = { colorMix: () => ({ invalid: true }), colorPalette: () => ({}) };
	const composed: Record<string, string> = { none: "none" };
	for (const keyword of keywordList(utility.values, "transition")) {
		const resolved = utility.transform(keyword, { utils });
		const property = resolved.transitionProperty;
		const duration = resolved.transitionDuration;
		const easing = resolved.transitionTimingFunction;
		if (
			typeof property !== "string" ||
			typeof duration !== "string" ||
			typeof easing !== "string"
		) {
			throw new Error(
				"Panda publishes no property, duration, or easing for the " + keyword + " keyword",
			);
		}
		composed[keyword] = varFallback(property)
			.split(",")
			.map((entry) => collapsed(entry) + " " + varFallback(duration) + " " + varFallback(easing))
			.join(", ");
	}
	return composed;
};

/**
 * Panda's transitionProperty keywords. That utility names a property list
 * directly instead of composing a shorthand, so each value ships verbatim.
 */
const transitionProperties = (config: PandaConfig): Record<string, string> => {
	const values = config.utilities.transitionProperty?.values;
	if (typeof values !== "object" || values === null) {
		throw new Error("Panda publishes no transitionProperty keyword map");
	}
	return Object.fromEntries(
		Object.entries(values).map(([keyword, value]) => [keyword, collapsed(String(value))]),
	);
};

/**
 * Render the Panda data module from the installed package.
 *
 * The module is returned instead of written so the preset parity test can
 * compare the checked-in file against a fresh render. The resolver is handed an
 * absolute config path that need not exist, which is what keeps the module free
 * of any project override and equal to Panda's own default preset.
 */
export const renderPandaPresetModule = async (): Promise<{
	contents: string;
	version: string;
}> => {
	const configPackagePath = requireFromPandwind.resolve("@pandacss/config/package.json");
	const version = (JSON.parse(readFileSync(configPackagePath, "utf8")) as { version: string })
		.version;
	const loader = (await import(
		configPackagePath.replace("/package.json", "/dist/index.mjs")
	)) as PandaConfigLoader;

	const { config } = await loader.resolveConfig(
		{ config: {}, dependencies: [], path: join(repositoryRoot, "panda.config.ts") },
		repositoryRoot,
	);

	const tokens = Object.fromEntries(
		Object.entries(config.theme.tokens)
			.filter(([group]) => !droppedTokenGroups.has(group))
			.map(([group, entries]) => [group, flattenGroup(group, entries)]),
	) as Record<string, Record<string, string>>;

	const conditions = Object.fromEntries(
		Object.entries(config.conditions).map(([name, value]) => ["_" + name, value]),
	);

	const pandaTheme = {
		version,
		tokens,
		transitions: composedTransitions(config),
		transitionProperties: transitionProperties(config),
		conditions,
		breakpoints: config.theme.breakpoints,
	} as const;

	const banner = [
		"// Generated by scripts/promote-panda-preset.ts. Do not edit by hand:",
		"// regenerate with pnpm run presets:generate and commit the diff.",
		"//",
		"// Source: @pandacss/config@" + version + " resolving Panda's stock default",
		"// configuration: theme.tokens for the token scales, theme.breakpoints for the",
		"// pixel widths, conditions for the " + Object.keys(conditions).length + " condition",
		"// selectors, and the transition and transitionProperty utilities for the two",
		"// keyword vocabularies. The resolver is handed an absolute config path that",
		"// need not exist, so no project override can reach this module. Panda's",
		"// --colors-* variables are never emitted, because Pandwind declares none of",
		"// them.",
		"//",
		"// Divergences from Panda's own output, all asserted by the parity test:",
		"// every colors key carries Pandwind's $ sigil ($red.500, $gray.100), which is",
		'// what makes the authored color: "$red.500" a token reference; the bare',
		"// red.500 spelling stays valid as its canonical alias,",
		"// the blurs group is absent because Panda reaches it only through its blur and",
		"// backdropBlur utilities, which set --blur and --backdrop-blur custom",
		"// properties rather than CSS properties,",
		"// theme.keyframes, theme.textStyles, theme.containerSizes, the patterns, and the",
		"// recipes are absent because Pandwind binds no property to them, so a project",
		'// that writes animation: "spin" declares its own @keyframes,',
		"// and the transitions group is composed, not transcribed: each keyword of",
		"// Panda's transition utility carries a property list, a duration, and an",
		"// easing, which the single shorthand Pandwind binds joins back together per",
		"// property.",
		"//",
		"// License: MIT (https://github.com/chakra-ui/panda/blob/main/LICENSE)",
		"",
	].join("\n");

	return {
		contents:
			banner +
			"export const pandaTheme = " +
			JSON.stringify(pandaTheme, null, "\t") +
			" as const;\n",
		version,
	};
};

const main = async (): Promise<void> => {
	const { contents, version } = await renderPandaPresetModule();
	const relativePath = relative(repositoryRoot, pandaPresetModulePath);
	if (process.argv.includes("--check")) {
		const checkedIn = existsSync(pandaPresetModulePath)
			? readFileSync(pandaPresetModulePath, "utf8")
			: "";
		if (checkedIn !== contents) {
			throw new Error(relativePath + " is stale; run pnpm run presets:generate");
		}
		console.log("Verified " + relativePath + " for @pandacss/config@" + version);
		return;
	}
	mkdirSync(dirname(pandaPresetModulePath), { recursive: true });
	writeFileSync(pandaPresetModulePath, contents);
	console.log("Wrote " + relativePath + " for @pandacss/config@" + version);
};

if (import.meta.main) await main();
