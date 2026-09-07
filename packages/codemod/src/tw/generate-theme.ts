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

export interface ThemeVar {
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

/**
 * Declared theme scopes (plans/015): scope name -> theme-variable bindings.
 *
 * ```ts
 * themes: {
 * 	dark: { "--color-surface": "#0b0b10" },
 * }
 * ```
 *
 * Keys are FULL custom-property names (leading `--` required) so emission is
 * a 1:1 mirror of the `@theme` block — no namespace guessing. Utilities keep
 * referencing `var(--color-surface)`; switching happens purely by cascade
 * scope (`[data-theme="…"]` re-binds the property), which is why theme
 * switches never change utility CSS.
 */
export type ThemeScopeMap = Record<string, Record<string, string>>;

/**
 * Render declared theme scopes as deterministic `[data-theme="…"]` override
 * blocks. Scopes and bindings are sorted; entries that are not
 * `"--name": "value"` bindings are warned about and skipped (never guessed).
 * Returns "" when nothing valid remains — callers append nothing, so output
 * stays byte-stable for presets without declared themes.
 */
export function buildThemeScopes(
	themes: ThemeScopeMap | undefined,
	warn: (message: string) => void = () => {},
): string {
	if (themes === undefined || typeof themes !== "object") return "";
	const blocks: string[] = [];
	for (const scope of Object.keys(themes).toSorted()) {
		const vars = themes[scope];
		if (vars === null || typeof vars !== "object" || Array.isArray(vars)) {
			warn(`pandwind: theme scope "${scope}" is not an object — skipped`);
			continue;
		}
		const lines: string[] = [];
		for (const name of Object.keys(vars).toSorted()) {
			const value = vars[name];
			if (typeof value !== "string" || value === "" || !name.startsWith("--")) {
				warn(
					`pandwind: theme scope "${scope}" entry "${name}" is not a theme variable binding ('"--name": "value"' expected) — skipped`,
				);
				continue;
			}
			lines.push(`\t${name}: ${value};`);
		}
		if (lines.length === 0) continue;
		blocks.push(`[data-theme="${scope}"] {\n${lines.join("\n")}\n}`);
	}
	return blocks.join("\n");
}

/**
 * Declared component scopes (plans/015 L3, scope-override model A):
 * component name -> semantic-var overrides bound to a generated
 * `.pwc-<name>` class.
 *
 * ```ts
 * components: {
 * 	button: { primary: "$color-brand" },        // -> .pwc-button { --color-primary: var(--color-brand) }
 * 	card: { border: "#e5e5e5" },                // raw values pass through
 * 	card2: { "text.muted": { base: "#888", dark: "#aaa" } }, // condition-bound
 * }
 * ```
 *
 * Key → custom-property mapping (no guessing beyond these three documented
 * forms): `"--name"` stays verbatim; dotted keys keep their own group
 * (`"text.muted"` -> `--text-muted`); plain keys land in the color
 * namespace (`"primary"` -> `--color-primary`), matching how semantic
 * colors dominate component styling.
 *
 * Values may be raw strings, `"$ref"` references to EXISTING `@theme`
 * variables (emitted as `var(--…)`; unknown refs and self-cycles are warned
 * about and skipped — never guessed), or condition-bound objects whose
 * non-base conditions resolve through the preset condition resolver
 * (unresolvable variants drop that variant with a warning; the base stays —
 * unlike splitTokens' whole-token skip, because a component override can
 * never produce a dead utility: the semantic variable always exists).
 */
export type ComponentScopeMap = Record<string, Record<string, unknown>>;

const dashedKey = (key: string): string =>
	key
		.replace(/\.([a-z0-9])/g, "-$1")
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "");

export const componentVarName = (key: string): string => {
	if (key.startsWith("--")) return key;
	const dashed = dashedKey(key);
	return key.includes(".") || dashed.startsWith("color-") ? `--${dashed}` : `--color-${dashed}`;
};

/** Chain a resolver-produced selector onto the component class. */
const scopeSelector = (cls: string, selector: string): string => {
	if (selector === ":root") return cls;
	const rest = selector.replace(/^:root/, "");
	if (rest === "") return cls;
	if (rest.startsWith(":")) return `${cls}${rest}`;
	// Compound class/attribute selectors chain directly; anything exotic
	// falls back to a descendant relationship.
	if (rest.startsWith(".") || rest.startsWith("[")) return `${cls}${rest}`;
	return `${cls} ${rest}`;
};

/**
 * Render the `.pwc-<component>` scope blocks. Deterministic: components,
 * keys and condition keys sorted; identical inputs yield identical output.
 * Returns "" when nothing valid remains, so presets without component
 * tokens keep byte-stable bridges.
 */
export function buildComponentScopes(
	components: ComponentScopeMap | undefined,
	existingVars: ReadonlySet<string>,
	resolveCondition: ((name: string) => ResolvedConditionParts | null) | undefined,
	warn: (message: string) => void = () => {},
): string {
	if (components === undefined || typeof components !== "object") return "";
	const blocks: string[] = [];
	for (const name of Object.keys(components).toSorted()) {
		if (!/^[a-z][a-z0-9-]*$/.test(name)) {
			warn(`pandwind: component "${name}" is not a valid class name ([a-z][a-z0-9-]*) — skipped`);
			continue;
		}
		const vars = components[name];
		if (vars === null || typeof vars !== "object" || Array.isArray(vars)) {
			warn(`pandwind: component "${name}" is not an object — skipped`);
			continue;
		}
		const cls = `.pwc-${name}`;
		const lines: string[] = [];
		const conditionalRules: string[] = [];
		for (const key of Object.keys(vars).toSorted()) {
			const varName = componentVarName(key);
			if (!/^--[a-z0-9-]+$/.test(varName) || varName === "--") {
				warn(
					`pandwind: component "${name}" key "${key}" maps to an invalid custom property — skipped`,
				);
				continue;
			}
			const raw = vars[key];

			if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
				// Condition-bound override set. Unlike splitTokens, a failed
				// variant only drops THAT variant: the semantic variable
				// already exists in @theme, so a partial component override
				// can never ship dead CSS.
				if (resolveCondition === undefined) {
					warn(
						`pandwind: component "${name}" key "${key}" is condition-bound but no preset conditions resolve — skipped`,
					);
					continue;
				}
				const entries = raw as Record<string, unknown>;
				for (const condKey of Object.keys(entries).toSorted()) {
					const value = entries[condKey];
					if (typeof value !== "string" || value === "") continue;
					const resolvedValue = resolveComponentValue(
						value,
						varName,
						existingVars,
						warn,
						name,
						key,
					);
					if (resolvedValue === null) continue;
					if (condKey === "base") {
						lines.push(`\t${varName}: ${resolvedValue};`);
						continue;
					}
					const parts = resolveCondition(condKey);
					if (parts === null || (parts.atRules.length === 0 && parts.selectors.length === 0)) {
						warn(
							`pandwind: component "${name}" key "${key}" variant "${condKey}" does not resolve through preset conditions — variant skipped`,
						);
						continue;
					}
					const decls = parts.selectors
						.map((sel) => scopeSelector(cls, sel))
						.map((scoped) => `\t${scoped} {\n\t\t${varName}: ${resolvedValue};\n\t}`)
						.join("\n");
					let css = decls;
					for (const atRule of parts.atRules.toReversed()) css = `${atRule} {\n${css}\n}`;
					conditionalRules.push(css);
				}
				continue;
			}

			const resolvedValue = resolveComponentValue(raw, varName, existingVars, warn, name, key);
			if (resolvedValue !== null) lines.push(`\t${varName}: ${resolvedValue};`);
		}
		if (lines.length === 0 && conditionalRules.length === 0) continue;
		const block = lines.length === 0 ? "" : `${cls} {\n${lines.join("\n")}\n}`;
		blocks.push([block, ...conditionalRules].filter(Boolean).join("\n"));
	}
	return blocks.join("\n");
}

/**
 * Resolve one component-token VALUE: `$ref` -> var() against existing @theme
 * variables (unknown refs and self-cycles warn + skip), raw strings pass
 * through normalization.
 */
function resolveComponentValue(
	value: unknown,
	varName: string,
	existingVars: ReadonlySet<string>,
	warn: (message: string) => void,
	component: string,
	key: string,
): string | null {
	if (typeof value !== "string" || value === "") {
		warn(
			`pandwind: component "${component}" key "${key}" is not a non-empty string or condition-bound object — skipped`,
		);
		return null;
	}
	if (!value.startsWith("$")) return normalizeThemeValue(value);
	const target = `--${dashedKey(value.slice(1))}`;
	if (!existingVars.has(target)) {
		warn(
			`pandwind: component "${component}" key "${key}" references $${value.slice(1)} which does not exist in @theme — skipped`,
		);
		return null;
	}
	if (target === varName) {
		warn(`pandwind: component "${component}" key "${key}" references itself — cycle skipped`);
		return null;
	}
	return `var(${target})`;
}
