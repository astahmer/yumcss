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
 * Build-time only: like `generate-types.ts`, this never rides into the
 * browser bundle.
 */

export type ThemeTokenGroups = Record<string, unknown>;

/**
 * Token group (or `parent.child` for one nesting level, mirroring the
 * shared preset's `typography` group shape) -> Tailwind v4 theme namespace.
 * https://tailwindcss.com/docs/theme#theme-variable-namespaces
 */
const THEME_NAMESPACES: Record<string, string> = {
	colors: "color",
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

/** Collect the `(varName, value)` pairs a set of token groups bridges to. */
export function themeVarsFromTokens(groups: ThemeTokenGroups): ThemeVar[] {
	const vars: ThemeVar[] = [];
	for (const [groupKey, values] of flatGroups(groups)) {
		const namespace = themeNamespaceFor(groupKey);
		if (namespace === undefined) continue;
		for (const tokenName of Object.keys(values).toSorted()) {
			const raw = values[tokenName];
			if (typeof raw !== "string" || raw === "") continue;
			const name = themeTokenName(tokenName);
			if (name === "") continue;
			vars.push({ name: `--${namespace}-${name}`, value: normalizeThemeValue(raw) });
		}
	}
	return vars;
}

/**
 * Build the `@theme {}` block for the given token groups. Deterministic:
 * groups and token names are sorted, so identical inputs yield byte-identical
 * output. Returns "" when nothing bridges (no usable groups), letting
 * callers skip the injection/artifact entirely.
 */
export function buildThemeBlock(groups: ThemeTokenGroups): string {
	const vars = themeVarsFromTokens(groups);
	if (vars.length === 0) return "";
	const lines = vars.map(({ name, value }) => `\t${name}: ${value};`);
	return `@theme {\n${lines.join("\n")}\n}`;
}
