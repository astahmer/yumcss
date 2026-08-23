/**
 * DTCG-style design-token groups -> Tailwind v4 `@theme` bridge.
 *
 * The css() engine resolves preset tokens (`$blue-500`) from token groups;
 * Tailwind knows nothing about them unless the same values exist as theme
 * variables (`--color-blue-500`). This builder turns the preset's token
 * groups into a deterministic `@theme {}` block so codegen can feed it to
 * Tailwind (and emit it as an artifact), making the preset the single source
 * of truth for both engines — no more hand-mirrored theme blocks drifting
 * apart from the tokens they claim to mirror.
 *
 * Only groups with a real Tailwind v4 theme namespace are bridged; anything
 * else (spacing scales — whose values would fight Tailwind's spacing
 * multiplier — z-index tables, ...) is skipped rather than guessed, because
 * a wrong namespace silently produces dead variables.
 *
 * Condition-bound semantic tokens (`{ base: "x", dark: "y" }` value shapes)
 * are bridged too — see `buildConditionalOverrides` and the probe results
 * documented there. Build-time only: like `generate-types.ts`, this never
 * rides into the browser bundle.
 */

export type ThemeTokenGroups = Record<string, unknown>;

/** Preset condition definitions: `"@media (...)"` / `".dark &"` / compound arrays. */
export type ThemeConditions = Record<string, string | string[]>;

/**
 * Token group (or `parent.child` for one nesting level, mirroring the
 * shared preset's `typography` group shape) -> Tailwind v4 theme namespace.
 * https://tailwindcss.com/docs/theme#theme-variable-namespaces
 */
const THEME_NAMESPACES: Record<string, string> = {
	colors: "color",
	// Condition-bound semantic tokens live in their own group but bridge to
	// the same namespaces, so `--color-surface` needs no special casing.
	semantic: "color",
	radii: "radius",
	shadows: "shadow",
	container: "container",
	// Flat groups (shared preset shape) and `typography.*` nests both map:
	fontSizes: "text",
	lineHeights: "leading",
	fontWeights: "font-weight",
	fonts: "font",
	letterSpacings: "tracking",
	"typography.fontSizes": "text",
	"typography.lineHeights": "leading",
	"typography.fontWeights": "font-weight",
	"typography.fonts": "font",
	"typography.letterSpacings": "tracking",
};

export function themeNamespaceFor(group: string): string | undefined {
	return THEME_NAMESPACES[group];
}

/**
 * Flatten one nesting level (`typography.fontSizes`) into `parent.child`
 * lookup keys. Deeper structures are not flattened — the presets are two
 * levels deep by convention.
 */
function* flatGroups(groups: ThemeTokenGroups): Generator<[string, Record<string, unknown>]> {
	for (const groupName of Object.keys(groups).toSorted()) {
		const value = groups[groupName];
		if (typeof value !== "object" || value === null) continue;
		yield [groupName, value as Record<string, unknown>];
		for (const childName of Object.keys(value).toSorted()) {
			const child = (value as Record<string, unknown>)[childName];
			if (typeof child !== "object" || child === null) continue;
			yield [`${groupName}.${childName}`, child as Record<string, unknown>];
		}
	}
}

/**
 * Token name -> CSS/custom-property-safe identifier segment:
 * `$gray-50` -> `gray-50`, `whiteAlpha.100` -> `whiteAlpha-100`,
 * `button.padding` -> `button-padding`.
 */
export function themeTokenName(name: string): string {
	return name
		.replace(/^\$/, "")
		.replace(/[^A-Za-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Canonicalize values: hex colors are case-insensitive CSS, so emit them
 * lower-case — otherwise a preset written with `#E53E3E` and a hand-mirrored
 * theme block with `#e53e3e` produce textually different (but semantically
 * identical) stylesheets. Everything else passes through verbatim.
 */
export function normalizeThemeValue(value: string): string {
	return value.replace(/#[0-9a-fA-F]{3,8}\b/g, (hex) => hex.toLowerCase());
}

interface ThemeVar {
	name: string;
	value: string;
}

export interface ResolvedConditionParts {
	selectors: string[];
	atRules: string[];
}

/**
 * Build a resolver turning a preset condition definition into standalone
 * override context for condition-bound tokens. Returns null for conditions
 * that cannot be expressed as static CSS — callers then skip the token
 * entirely rather than emit partial semantics.
 *
 * Part mapping (mirrors how utilities reference theme vars):
 * - `"@media (...)"` parts wrap the override in an at-rule;
 * - `".dark &"` becomes the standalone selector `.dark`;
 * - `"&:hover"` becomes `:root:hover`;
 * - bare `"&"` becomes `:root`.
 */
export function createConditionResolver(
	conditions: ThemeConditions,
): (name: string) => ResolvedConditionParts | null {
	return (name: string) => {
		const def = conditions[name];
		if (def === undefined) return null;
		const selectors: string[] = [];
		const atRules: string[] = [];
		for (const part of Array.isArray(def) ? def : [def]) {
			const trimmed = part.trim();
			if (trimmed === "") return null;
			if (trimmed.startsWith("@")) {
				atRules.push(trimmed);
				continue;
			}
			let selector: string;
			if (trimmed === "&") selector = ":root";
			else if (trimmed.startsWith("&")) selector = `:root${trimmed.slice(1)}`;
			else if (/&/.test(trimmed)) selector = trimmed.replace(/&/g, "").trim() || ":root";
			else selector = trimmed;
			selectors.push(selector);
		}
		return { selectors, atRules };
	};
}

/** Collect the `(varName, value)` pairs a set of token groups bridges to. */
export function themeVarsFromTokens(groups: ThemeTokenGroups): ThemeVar[] {
	return splitTokens(groups).flatVars;
}

export interface ConditionalVar {
	name: string;
	value: string;
	selectors: string[];
	atRules: string[];
}

/**
 * Split token groups into plain vars and condition-bound variants.
 *
 * String values become plain vars; object values are condition-bound
 * (`{ base: "#x", dark?: "#y", ... }`). The `base` key is REQUIRED and
 * bridges into `@theme`; every other key must resolve via the condition
 * resolver. A token is dropped entirely when its `base` is missing (real
 * Tailwind cannot compile a utility for an undeclared variable) or when ANY
 * variant fails to resolve — a partially-bridged token would silently
 * disagree with css() under some conditions.
 */
export function splitTokens(
	groups: ThemeTokenGroups,
	resolveCondition?: (name: string) => ResolvedConditionParts | null,
): { flatVars: ThemeVar[]; conditionalVars: ConditionalVar[] } {
	const flatVars: ThemeVar[] = [];
	const conditionalVars: ConditionalVar[] = [];
	for (const [groupKey, values] of flatGroups(groups)) {
		const namespace = themeNamespaceFor(groupKey);
		if (namespace === undefined) continue;
		for (const tokenName of Object.keys(values).toSorted()) {
			const raw = values[tokenName];
			const name = themeTokenName(tokenName);
			if (name === "" || raw === undefined) continue;

			if (typeof raw === "string") {
				if (raw !== "") {
					flatVars.push({ name: `--${namespace}-${name}`, value: normalizeThemeValue(raw) });
				}
				continue;
			}
			if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
			if (resolveCondition === undefined) continue; // condition-bound needs a resolver

			// A `base` value is REQUIRED for object-shaped tokens. Without it
			// the variable never reaches @theme, so real Tailwind does not
			// recognize the utility at all (verified against tailwindcss 4.3.x:
			// unknown candidates compile to zero rules) — emitting the
			// overrides alone would ship dead CSS. Skipped entirely instead,
			// matching the "never partially-bridge" policy above.
			const varName = `--${namespace}-${name}`;
			const nextFlat: ThemeVar[] = [];
			const nextCond: ConditionalVar[] = [];
			let usable = false;
			for (const condKey of Object.keys(raw).toSorted()) {
				const value = (raw as Record<string, unknown>)[condKey];
				if (typeof value !== "string" || value === "") continue;
				if (condKey === "base") {
					nextFlat.push({ name: varName, value: normalizeThemeValue(value) });
					usable = true;
					continue;
				}
				const resolved = resolveCondition(condKey);
				if (
					resolved === null ||
					(resolved.atRules.length === 0 && resolved.selectors.length === 0)
				) {
					usable = false;
					break;
				}
				nextCond.push({
					name: varName,
					value: normalizeThemeValue(value),
					selectors: resolved.selectors,
					atRules: resolved.atRules,
				});
				usable = true;
			}
			if (!usable || nextFlat.length === 0) {
				// No base => skip the whole token (see note above); a base-less
				// override set cannot cascade from anything.
				continue;
			}
			flatVars.push(...nextFlat);
			conditionalVars.push(...nextCond);
		}
	}
	return { flatVars, conditionalVars };
}

function renderOverrideRule(varEntry: ConditionalVar): string {
	const decl = `\t\t${varEntry.name}: ${varEntry.value};`;
	const body =
		varEntry.selectors.length > 1
			? `\t${varEntry.selectors.join(",\n\t")} {\n${decl}\n\t}`
			: `\t${varEntry.selectors[0]} {\n${decl}\n\t}`;
	let css = body;
	for (const atRule of varEntry.atRules.toReversed()) {
		css = `${atRule} {\n${css}\n}`;
	}
	return css;
}

/**
 * Build the full bridge CSS for the given token groups: the `@theme {}`
 * block plus standalone override rules for every condition-bound variant.
 * Deterministic: groups, token names and condition keys are sorted, so
 * identical inputs yield byte-identical output. Returns "" when nothing
 * bridges, letting callers skip injection/artifact emission entirely.
 */
export function buildThemeBlock(
	groups: ThemeTokenGroups,
	resolveCondition?: (name: string) => ResolvedConditionParts | null,
): string {
	const { flatVars, conditionalVars } = splitTokens(groups, resolveCondition);

	const lines = flatVars.map(({ name, value }) => `\t${name}: ${value};`);
	const themeBlock = lines.length === 0 ? "" : `@theme {\n${lines.join("\n")}\n}`;

	const overrideCss = conditionalVars.map(renderOverrideRule).join("\n");
	if (overrideCss === "") return themeBlock;
	return themeBlock === ""
		? overrideCss
		: `${themeBlock}\n\n/* Condition-bound token overrides */\n${overrideCss}`;
}
