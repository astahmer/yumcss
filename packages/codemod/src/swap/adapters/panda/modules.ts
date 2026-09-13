/**
 * Panda tier engine — module emitters + folding.
 *
 * Tier 0: a recipe definition with exactly ONE call site folds inline into
 * a single css.class({...}) call (variant selection resolved at codemod
 * time). Tier 1 (shared/default): every used recipe/pattern re-emits as a
 * dedicated module under pandwind/{recipes,patterns}/ with IDENTICAL export
 * names, implemented as class-string data + a generated resolver. Call
 * sites keep their syntax; only the import specifier changes.
 *
 * All emitted text is plain host-app code (no new pandwind API surface):
 * modules import the app's migrated `css`/`cx` instances from the out-dir
 * bootstrap.
 */
import type { SwapIR } from "../../ir.ts";
import { emitCssClass } from "../../emit.ts";
import type { PandwindMeta } from "../../../meta.ts";
import { PandaRecipeKindTag, type PandaRecipeIR } from "./parse.ts";
import { CSS_PROPERTY_ALIASES } from "../../property-aliases.ts";
import { expandBuiltinPattern } from "./patterns.ts";
import type { PandaTheme } from "./theme.ts";
import { presetConditions } from "pandwind/preset";
import {
	formatTokenPath,
	TokenReferenceFormat,
	type TokenReferenceFormat as TokenReferenceFormatValue,
} from "../../tokens.ts";

const q = (v: string | number | boolean): string =>
	typeof v === "string" ? JSON.stringify(v) : String(v);

const PANDA_PROPERTY_GROUPS: Readonly<Record<string, string>> = {
	color: "colors",
	background: "colors",
	backgroundColor: "colors",
	borderColor: "colors",
	borderTopColor: "colors",
	borderRightColor: "colors",
	borderBottomColor: "colors",
	borderLeftColor: "colors",
	outlineColor: "colors",
	textDecorationColor: "colors",
	fill: "colors",
	stroke: "colors",
	fontFamily: "fonts",
	fontSize: "fontSizes",
	fontWeight: "fontWeights",
	lineHeight: "lineHeights",
	letterSpacing: "letterSpacings",
	borderRadius: "radii",
	borderTopLeftRadius: "radii",
	borderTopRightRadius: "radii",
	borderBottomRightRadius: "radii",
	borderBottomLeftRadius: "radii",
	borderStartStartRadius: "radii",
	borderStartEndRadius: "radii",
	borderEndStartRadius: "radii",
	borderEndEndRadius: "radii",
	boxShadow: "shadows",
	textShadow: "shadows",
	zIndex: "zIndices",
	borderWidth: "borderWidths",
	borderTopWidth: "borderWidths",
	borderRightWidth: "borderWidths",
	borderBottomWidth: "borderWidths",
	borderLeftWidth: "borderWidths",
	gap: "spacing",
	columnGap: "spacing",
	rowGap: "spacing",
	padding: "spacing",
	paddingInline: "spacing",
	paddingBlock: "spacing",
	paddingTop: "spacing",
	paddingRight: "spacing",
	paddingBottom: "spacing",
	paddingLeft: "spacing",
	paddingInlineStart: "spacing",
	paddingInlineEnd: "spacing",
	paddingBlockStart: "spacing",
	paddingBlockEnd: "spacing",
	margin: "spacing",
	marginInline: "spacing",
	marginBlock: "spacing",
	marginTop: "spacing",
	marginRight: "spacing",
	marginBottom: "spacing",
	marginLeft: "spacing",
	marginInlineStart: "spacing",
	marginInlineEnd: "spacing",
	marginBlockStart: "spacing",
	marginBlockEnd: "spacing",
	top: "sizes",
	right: "sizes",
	bottom: "sizes",
	left: "sizes",
	inset: "sizes",
	insetInline: "sizes",
	insetBlock: "sizes",
	insetInlineStart: "sizes",
	insetInlineEnd: "sizes",
	insetBlockStart: "sizes",
	insetBlockEnd: "sizes",
	width: "sizes",
	minWidth: "sizes",
	maxWidth: "sizes",
	height: "sizes",
	minHeight: "sizes",
	maxHeight: "sizes",
};

const tokenGroupFor = (
	group: string,
	tokens: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): string =>
	group === "spacing" && tokens.spacing === undefined && tokens.space !== undefined
		? "space"
		: group;

const scalarTokenValue = (value: unknown): string | undefined =>
	typeof value === "string" || typeof value === "number" ? String(value) : undefined;

const isSemanticTokenValue = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" &&
	value !== null &&
	!Array.isArray(value) &&
	Object.keys(value).length > 0 &&
	Object.values(value).every((branch) => scalarTokenValue(branch) !== undefined);

const serializedSemanticValue = (
	value: Record<string, unknown>,
): Record<string, string> | undefined => {
	const branches = Object.fromEntries(
		Object.entries(value).flatMap(([condition, branch]) => {
			const scalar = scalarTokenValue(branch);
			return scalar === undefined ? [] : [[condition, scalar] as const];
		}),
	);
	return Object.keys(branches).length > 0 ? branches : undefined;
};

const generatedTokenGroups = (
	tokens: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): Record<string, Record<string, string>> => {
	const result: Record<string, Record<string, string>> = {};
	for (const [group, values] of Object.entries(tokens)) {
		for (const [path, value] of Object.entries(values)) {
			if (isSemanticTokenValue(value)) continue;
			const scalar = scalarTokenValue(value);
			if (scalar !== undefined) (result[group] ??= {})[path] = scalar;
		}
	}
	return result;
};

const generatedSemanticTokenGroups = (
	tokens: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): Record<string, Record<string, Record<string, string>>> => {
	const result: Record<string, Record<string, Record<string, string>>> = {};
	for (const [group, values] of Object.entries(tokens)) {
		for (const [path, value] of Object.entries(values)) {
			if (!isSemanticTokenValue(value)) continue;
			const branches = serializedSemanticValue(value);
			if (branches !== undefined) (result[group] ??= {})[path] = branches;
		}
	}
	return result;
};

const isComponentTokenPath = (path: string): boolean => path.startsWith("component.");

const selectTokenPaths = <T>(
	groups: Readonly<Record<string, Readonly<Record<string, T>>>>,
	component: boolean,
): Record<string, Record<string, T>> => {
	const result: Record<string, Record<string, T>> = {};
	for (const [group, values] of Object.entries(groups)) {
		for (const [path, value] of Object.entries(values)) {
			if (isComponentTokenPath(path) !== component) continue;
			(result[group] ??= {})[path] = value;
		}
	}
	return result;
};

type GeneratedSemanticGroups = Readonly<Record<string, Record<string, Record<string, string>>>>;

const tokenReferenceValue = ({
	value,
	group,
	rawTokens,
	semanticTokens,
	format,
}: {
	value: string;
	group: string;
	rawTokens: Readonly<Record<string, Readonly<Record<string, string>>>>;
	semanticTokens: GeneratedSemanticGroups;
	format: TokenReferenceFormatValue;
}): string => {
	const candidate = /^\{([^}]+)\}$/.exec(value)?.[1] ?? value;
	const separator = candidate.indexOf(".");
	if (separator > 0) {
		const referenceGroup = candidate.slice(0, separator);
		const referencePath = candidate.slice(separator + 1);
		if (
			rawTokens[referenceGroup]?.[referencePath] !== undefined ||
			semanticTokens[referenceGroup]?.[referencePath] !== undefined
		)
			return formatTokenPath(candidate, format);
	}
	if (
		rawTokens[group]?.[candidate] !== undefined ||
		semanticTokens[group]?.[candidate] !== undefined
	)
		return `${group}.${formatTokenPath(candidate, format, candidate.startsWith("$") ? candidate : undefined)}`;
	const rawMatch = Object.entries(rawTokens[group] ?? {}).find(
		([, rawValue]) => rawValue === value,
	);
	return rawMatch === undefined
		? value
		: `${group}.${formatTokenPath(rawMatch[0], format, rawMatch[0].startsWith("$") ? rawMatch[0] : undefined)}`;
};

const isUnresolvedTokenReference = (value: string): boolean =>
	/^\{[^}]+\}$/u.test(value) ||
	value.startsWith("$") ||
	/^[a-z][a-z0-9-]*\.[a-z0-9$_.-]+$/u.test(value);

const mergeSemanticGroups = (
	groups: readonly GeneratedSemanticGroups[],
): GeneratedSemanticGroups => {
	const result: Record<string, Record<string, Record<string, string>>> = {};
	for (const groupSet of groups)
		for (const [group, values] of Object.entries(groupSet))
			result[group] = { ...result[group], ...values };
	return result;
};

const withComponentRawAliases = (
	componentTokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
	rawTokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
	semanticTokens: GeneratedSemanticGroups,
	format: TokenReferenceFormatValue,
): Record<string, Record<string, string>> => {
	const result: Record<string, Record<string, string>> = Object.fromEntries(
		Object.entries(rawTokens).map(([group, values]) => [group, { ...values }]),
	);
	for (const [group, values] of Object.entries(componentTokens)) {
		for (const [path, value] of Object.entries(values)) {
			const reference = tokenReferenceValue({
				value,
				group,
				rawTokens: result,
				semanticTokens,
				format,
			});
			if (reference !== value || isUnresolvedTokenReference(value)) continue;
			(result[group] ??= {})[`raw.${path}`] = value;
		}
	}
	return result;
};

const withSemanticRawAliases = ({
	sourceSemanticTokens,
	referenceSemanticTokens,
	rawTokens,
	format,
}: {
	sourceSemanticTokens: GeneratedSemanticGroups;
	referenceSemanticTokens: GeneratedSemanticGroups;
	rawTokens: Readonly<Record<string, Readonly<Record<string, string>>>>;
	format: TokenReferenceFormatValue;
}): Record<string, Record<string, string>> => {
	const result: Record<string, Record<string, string>> = Object.fromEntries(
		Object.entries(rawTokens).map(([group, values]) => [group, { ...values }]),
	);
	for (const [group, values] of Object.entries(sourceSemanticTokens)) {
		for (const [path, branches] of Object.entries(values)) {
			for (const [condition, value] of Object.entries(branches)) {
				const reference = tokenReferenceValue({
					value,
					group,
					rawTokens: result,
					semanticTokens: referenceSemanticTokens,
					format,
				});
				if (reference !== value || isUnresolvedTokenReference(value)) continue;
				(result[group] ??= {})[`raw.${path}.${condition}`] = value;
			}
		}
	}
	return result;
};

const componentSemanticTokenGroups = (
	componentTokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
	rawTokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
	semanticTokens: GeneratedSemanticGroups,
	format: TokenReferenceFormatValue,
): Record<string, Record<string, Record<string, string>>> => {
	const result: Record<string, Record<string, Record<string, string>>> = {};
	for (const [group, values] of Object.entries(componentTokens)) {
		for (const [path, value] of Object.entries(values)) {
			if (!isComponentTokenPath(path)) continue;
			(result[group] ??= {})[path] = {
				base: tokenReferenceValue({
					value,
					group,
					rawTokens,
					semanticTokens,
					format,
				}),
			};
		}
	}
	return result;
};

const formatSemanticTokenGroups = (
	groups: GeneratedSemanticGroups,
	rawTokens: Readonly<Record<string, Readonly<Record<string, string>>>>,
	semanticTokens: GeneratedSemanticGroups,
	format: TokenReferenceFormatValue,
): Record<string, Record<string, Record<string, string>>> => {
	const result: Record<string, Record<string, Record<string, string>>> = {};
	for (const [group, values] of Object.entries(groups)) {
		for (const [path, branches] of Object.entries(values)) {
			const formattedBranches = Object.fromEntries(
				Object.entries(branches).map(([condition, value]) => [
					condition,
					tokenReferenceValue({ value, group, rawTokens, semanticTokens, format }),
				]),
			);
			if (
				formattedBranches.base !== undefined &&
				formattedBranches._dark === formattedBranches.base
			)
				delete formattedBranches._dark;
			(result[group] ??= {})[
				formatTokenPath(path, format, path.startsWith("$") ? path : undefined)
			] = formattedBranches;
		}
	}
	return result;
};

/* ------------------------------------------------------------------ */
/* bootstrap + internal helpers                                        */
/* ------------------------------------------------------------------ */

/** `<outDir>/css.ts` — the single binding every emitted module imports. */
export function renderCssBootstrap(): string {
	return `/**
 * Generated by pandwind-codemod: the app's CSS instance.
 * Every migrated/emitted module binds css + cx through this file.
 */
import { createCss, createCssOpen } from "pandwind/css";
import { createCx } from "pandwind/cx";
import { preset } from "./preset";
export const css = createCss(preset);
export const cssRuntime = createCssOpen(preset);
export const cx = createCx({ css });
`;
}

/** TypeScript declaration for the bare virtual id used by Next/Webpack. */
export function renderVirtualCssDeclaration(): string {
	return `/** Generated by pandwind-codemod: resolved by pandwindWebpackCss. */
declare module "pandwind-css.css" {}
`;
}

/**
 * `<outDir>/preset.ts` — the host Panda theme lowered to a Pandwind preset.
 *
 * Panda keeps semantic tokens in nested `{ value: ... }` objects while
 * Pandwind consumes flat token maps. The migration loader performs the
 * lossless flattening; this generated boundary adapts the selected token
 * spelling and attaches the token groups to the properties that use them.
 */

export function renderPandaPreset(
	theme: PandaTheme,
	tokenReferenceFormat: TokenReferenceFormatValue = TokenReferenceFormat.Preserve,
): string {
	const rawTokens = generatedTokenGroups(theme.tokens ?? {});
	const semanticTokens = generatedSemanticTokenGroups(theme.tokens ?? {});
	const appSemanticTokens = selectTokenPaths(semanticTokens, false);
	const componentSemanticTokens = selectTokenPaths(semanticTokens, true);
	const semanticTokenReferences = mergeSemanticGroups([appSemanticTokens, componentSemanticTokens]);
	const appSemanticRawTokens = withSemanticRawAliases({
		sourceSemanticTokens: appSemanticTokens,
		referenceSemanticTokens: semanticTokenReferences,
		rawTokens: selectTokenPaths(rawTokens, false),
		format: tokenReferenceFormat,
	});
	const componentRawAppTokens = withComponentRawAliases(
		selectTokenPaths(rawTokens, true),
		appSemanticRawTokens,
		semanticTokenReferences,
		tokenReferenceFormat,
	);
	const appRawTokens = withSemanticRawAliases({
		sourceSemanticTokens: componentSemanticTokens,
		referenceSemanticTokens: semanticTokenReferences,
		rawTokens: componentRawAppTokens,
		format: tokenReferenceFormat,
	});
	const formatRawGroups = Object.fromEntries(
		Object.entries(appRawTokens).map(([group, values]) => [
			group,
			Object.fromEntries(
				Object.entries(values).map(([path, value]) => [
					formatTokenPath(path, tokenReferenceFormat, path.startsWith("$") ? path : undefined),
					value,
				]),
			),
		]),
	);
	const formatSemanticGroups = formatSemanticTokenGroups(
		appSemanticTokens,
		appRawTokens,
		semanticTokenReferences,
		tokenReferenceFormat,
	);
	const formatComponentGroups = formatSemanticTokenGroups(
		componentSemanticTokens,
		appRawTokens,
		semanticTokenReferences,
		tokenReferenceFormat,
	);
	for (const [group, values] of Object.entries(
		componentSemanticTokenGroups(
			selectTokenPaths(rawTokens, true),
			appRawTokens,
			semanticTokenReferences,
			tokenReferenceFormat,
		),
	))
		formatComponentGroups[group] = { ...formatComponentGroups[group], ...values };
	const formatComponentTokenGroups = Object.fromEntries(
		Object.entries(formatComponentGroups).map(([group, values]) => [
			group,
			Object.fromEntries(
				Object.entries(values).map(([path, branches]) => [
					formatTokenPath(path, tokenReferenceFormat, path.startsWith("$") ? path : undefined),
					branches,
				]),
			),
		]),
	);
	const tokenGroups = [
		...new Set([
			...Object.keys(formatRawGroups),
			...Object.keys(formatSemanticGroups),
			...Object.keys(formatComponentTokenGroups),
		]),
	];
	const hasAppSemanticTokens = Object.keys(formatSemanticGroups).length > 0;
	const hasComponentTokens = Object.keys(formatComponentTokenGroups).length > 0;
	const mergedTokenLines = tokenGroups.map((group) => {
		const raw = formatRawGroups[group];
		const semantic = formatSemanticGroups[group];
		const component = formatComponentTokenGroups[group];
		const sources = [
			raw === undefined ? undefined : `appTokens[${JSON.stringify(group)}]`,
			semantic === undefined ? undefined : `appSemanticTokens[${JSON.stringify(group)}]`,
			component === undefined ? undefined : `componentTokens[${JSON.stringify(group)}]`,
		].filter((source): source is string => source !== undefined);
		if (sources.length === 1) return `\t${JSON.stringify(group)}: ${sources[0]},`;
		return `\t${JSON.stringify(group)}: { ...${sources.join(", ...")} },`;
	});
	const conditions: Record<string, string | string[]> = { ...theme.conditions };
	for (const [name, selector] of Object.entries(conditions)) {
		if (name.endsWith("Down") || typeof selector !== "string") continue;
		const match = /^@media \(min-width: ([^)]+)\)$/.exec(selector);
		if (match === null) continue;
		const value = match[1]!;
		const numeric = /^(-?\d+(?:\.\d+)?)(px|rem)$/.exec(value);
		if (numeric === null) continue;
		const amount = Number(numeric[1]) - (numeric[2] === "px" ? 0.04 : 0.0025);
		conditions[`${name}Down`] = `@media screen and (max-width: ${amount}${numeric[2]})`;
	}
	const rawTokenJson = JSON.stringify(formatRawGroups, null, "\t");
	const semanticTokenJson = JSON.stringify(formatSemanticGroups, null, "\t");
	const componentTokenJson = JSON.stringify(formatComponentTokenGroups, null, "\t");
	const conditionValues: Record<string, string | string[]> = {
		base: "",
		...presetConditions,
		current: "&:is([aria-current=true], [data-current])",
		icon: "& :where(svg)",
		...conditions,
	};
	for (const [name, selector] of Object.entries(conditionValues)) {
		if (name === "base") continue;
		if (name.startsWith("_")) conditionValues[name.slice(1)] = selector;
		else conditionValues[`_${name}`] = selector;
	}
	const conditionJson = JSON.stringify(conditionValues, null, "\t");
	const propertyJson = JSON.stringify(
		{
			$all: true,
			...Object.fromEntries(
				Object.entries(PANDA_PROPERTY_GROUPS).flatMap(([property, group]) => {
					const tokenGroup = tokenGroupFor(group, theme.tokens);
					return Object.hasOwn(theme.tokens, tokenGroup)
						? [[property, { $tokens: tokenGroup, $strictness: "inherits" }]]
						: [];
				}),
			),
		},
		null,
		"\t",
	);
	const semanticTokenImport =
		hasAppSemanticTokens || hasComponentTokens ? "\tdefineSemanticTokens,\n" : "";
	const semanticTokenTypeImport =
		hasAppSemanticTokens || hasComponentTokens ? "\ttype SemanticTokenLayer,\n" : "";
	const appSemanticDeclaration = hasAppSemanticTokens
		? `const appSemanticTokenDefinitions = ${semanticTokenJson};
type AppSemanticTokenCatalog = typeof appTokens & typeof appSemanticTokenDefinitions;
const appSemanticTokens = defineSemanticTokens(
	conditions,
	appSemanticTokenDefinitions satisfies SemanticTokenLayer<typeof conditions, AppSemanticTokenCatalog>,
);
`
		: "";
	const componentTokenCatalog = hasAppSemanticTokens
		? "AppSemanticTokenCatalog"
		: "typeof appTokens";
	const componentDeclaration = hasComponentTokens
		? `const componentTokens = defineSemanticTokens(
	conditions,
	${componentTokenJson} satisfies SemanticTokenLayer<typeof conditions, ${componentTokenCatalog}>,
);
`
		: "";
	return `/**
 * Generated by pandwind-codemod from the host Panda theme.
 * It is an app-owned preset: no Pandwind token or property defaults are imported.
 */
import {
\tdefinePreset,
\tdefineProperties,
${semanticTokenImport}\tdefineTokens,
\tdefineConditions,
${semanticTokenTypeImport}\ttype StandardProperties,
} from "pandwind/preset";

const conditions = defineConditions(${conditionJson});
const appTokens = defineTokens(${rawTokenJson});
${appSemanticDeclaration}${componentDeclaration}
const tokens = {
${mergedTokenLines.join("\n")}
};
const cssConfig: StandardProperties = {};

export const preset = definePreset(
\t{ config: cssConfig, tokens },
\t{
\t\tstrict: true,
\t\tconditions,
\t\tproperties: defineProperties(${propertyJson}),
\t},
);
`;
}

/** `<outDir>/internal.ts` — runtime shorthand/canonicalization for pattern modules. */
export function renderInternalHelpers(
	theme: PandaTheme,
	tokenReferenceFormat: TokenReferenceFormatValue = TokenReferenceFormat.Preserve,
): string {
	const entries = [...theme.utilityCatalog.propertyAliases.entries()]
		.map(([k, v]) => `\t${q(k)}: ${q(CSS_PROPERTY_ALIASES.get(v) ?? v)},`)
		.join("\n");
	const generatedTextStyles = JSON.stringify(Object.fromEntries(theme.textStyles), null, "\t");
	const generatedTokenGroups = JSON.stringify(PANDA_PROPERTY_GROUPS, null, "\t");
	const generatedTokenRefs = JSON.stringify(
		Object.fromEntries(
			Object.entries(theme.tokens).map(([group, values]) => [
				group,
				Object.fromEntries(
					Object.keys(values).map((path) => [
						path,
						formatTokenPath(path, tokenReferenceFormat, path.startsWith("$") ? path : undefined),
					]),
				),
			]),
		),
		null,
		"\t",
	);
	return `/**
 * Generated by pandwind-codemod: runtime key canonicalization
 * shared by emitted pattern modules (panda shorthands -> CSS properties).
 */
import type { StyleObject, StyleValue } from "pandwind/types/typings";

const aliases: Record<string, string> = {
${entries}
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isStyleValue = (value: unknown): value is StyleValue => {
	if (value === undefined || value === null || typeof value === "string" || typeof value === "number")
		return true;
	if (Array.isArray(value)) return value.every(isStyleValue);
	return isRecord(value) && Object.values(value).every(isStyleValue);
};

const camel = (prop: string): string =>
	prop.replace(/-(\\w|$)/g, (_m, char: string) => char.toUpperCase());

const radiusExpansions: Record<string, string[]> = {
	borderTopRadius: ["borderTopLeftRadius", "borderTopRightRadius"],
	borderRightRadius: ["borderTopRightRadius", "borderBottomRightRadius"],
	borderBottomRadius: ["borderBottomLeftRadius", "borderBottomRightRadius"],
	borderLeftRadius: ["borderTopLeftRadius", "borderBottomLeftRadius"],
	borderStartRadius: ["borderStartStartRadius", "borderEndStartRadius"],
	borderEndRadius: ["borderStartEndRadius", "borderEndEndRadius"],
};
const textStyles: Record<string, Record<string, unknown>> = ${generatedTextStyles};
const tokenGroupsByProperty: Record<string, string> = ${generatedTokenGroups};
const tokenRefs: Record<string, Record<string, string>> = ${generatedTokenRefs};

function normalizeValue(property: string, value: unknown): unknown {
	if (typeof value === "string") return tokenRefs[tokenGroupsByProperty[property] ?? ""]?.[value] ?? value;
	if (Array.isArray(value)) return value.map((item) => normalizeValue(property, item));
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(property, item)]));
	}
	return value;
}

function add(out: Record<string, unknown>, key: string, value: unknown): void {
	const current = out[key];
	if (isRecord(current) && isRecord(value)) {
		out[key] = { ...current, ...value };
	} else out[key] = value;
}

function normalize(style: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(style)) {
		if (value === undefined) continue;
		const canonical = aliases[key] ?? camel(key);
		if (canonical === "textStyle" && typeof value === "string") {
			const textStyle = textStyles[value];
			if (textStyle !== undefined) {
				for (const [textKey, textValue] of Object.entries(normalize(textStyle))) add(out, textKey, textValue);
				continue;
			}
		}
		if (canonical === "hideFrom" || canonical === "hideBelow") {
			if (typeof value === "string") add(out, canonical === "hideFrom" ? value : value + "Down", { display: "none" });
			else add(out, canonical, normalizeValue(canonical, value));
			continue;
		}
		if (canonical === "boxSize") {
			add(out, "width", normalizeValue("width", value));
			add(out, "height", normalizeValue("height", value));
			continue;
		}
		const expanded = radiusExpansions[canonical];
		if (expanded !== undefined) {
			for (const property of expanded) add(out, property, normalizeValue(property, value));
			continue;
		}
		add(out, canonical, normalizeValue(canonical, value));
	}
	return out;
}

export function canonicalProps(style: Record<string, unknown>): StyleObject {
	const normalized = normalize(style);
	const out: StyleObject = {};
	for (const [key, value] of Object.entries(normalized)) {
		if (isStyleValue(value)) out[key] = value;
	}
	return out;
}

const DOM_KEYS = new Set([
	"id", "role", "href", "src", "alt", "title", "target", "rel", "type",
	"name", "value", "disabled", "checked", "tabIndex", "aria-label", "aria-describedby",
]);

/** Split style props from DOM props before a generated wrapper spreads them. */
export function splitStyleProps(props: Record<string, unknown>): {
	style: Record<string, unknown>;
	dom: Record<string, unknown>;
} {
	const style: Record<string, unknown> = {};
	const dom: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(props)) {
		if (/^(data-|aria-|on[A-Z])/.test(key) || DOM_KEYS.has(key)) dom[key] = value;
		else style[key] = value;
	}
	return { style, dom };
}
`;
}

/* ------------------------------------------------------------------ */
/* IR -> css.class(...) text                                            */
/* ------------------------------------------------------------------ */

function irToCall(
	ir: SwapIR,
	meta: PandwindMeta,
	index = 1,
	tokenReferenceFormat?: TokenReferenceFormatValue,
): string {
	const result = emitCssClass(ir, meta, {
		index,
		tokenRefs: "bare",
		sort: true,
		tokenReferenceFormat,
	});
	if (result.text === "") return "";
	return result.text;
}

function mergeIrs(irs: Array<SwapIR>): SwapIR {
	return {
		entries: irs.flatMap((ir) => ir.entries),
		residuals: irs.flatMap((ir) => ir.residuals),
	};
}

/* ------------------------------------------------------------------ */
/* tier-1 recipe module                                                */
/* ------------------------------------------------------------------ */

interface ModuleOptions {
	/** Import statement for the app's css/cx binding inside emitted modules. */
	cssImport: string;
	/** Token spelling policy used by generated style calls. */
	tokenReferenceFormat?: TokenReferenceFormatValue;
}

function renderSlotClass(callText: string): string {
	return callText === "" ? '""' : callText;
}

/**
 * Tier-1 cva/sva/defineRecipe module: identical export name, resolver
 * implementation. Compound variants become mechanical condition branches.
 */
export function renderRecipeModule(
	name: string,
	recipe: PandaRecipeIR,
	meta: PandwindMeta,
	options: ModuleOptions,
): string {
	const lines: Array<string> = [];
	lines.push("/**");
	lines.push(` * Generated by pandwind-codemod from a Panda ${recipe.kind} definition.`);
	lines.push(" * Variants stay DATA; resolution is this generated pure function.");
	lines.push(" */");
	lines.push(options.cssImport);

	const slotNames = recipe.slots ?? [""];
	const isSva = recipe.kind === PandaRecipeKindTag.Sva;

	for (const slot of slotNames) {
		const label = slot === "" ? "base" : `base_${slot}`;
		const ir = recipe.base[slot];
		lines.push(
			`const ${label} = ${renderSlotClass(ir === undefined ? "" : irToCall(ir, meta, 1, options.tokenReferenceFormat))};`,
		);
	}

	// Variant value tables.
	lines.push("const variants = {");
	for (const [variantName, values] of Object.entries(recipe.variants)) {
		lines.push(`\t${JSON.stringify(variantName)}: {`);
		for (const [valueName, slotMap] of Object.entries(values)) {
			if (isSva) {
				lines.push(`\t\t${JSON.stringify(valueName)}: {`);
				for (const slot of slotNames) {
					const ir = slotMap[slot];
					lines.push(
						`\t\t\t${JSON.stringify(slot)}: ${renderSlotClass(ir === undefined ? "" : irToCall(ir, meta, 1, options.tokenReferenceFormat))},`,
					);
				}
				lines.push("\t\t},");
			} else {
				const ir = slotMap[""];
				lines.push(
					`\t\t${JSON.stringify(valueName)}: ${renderSlotClass(ir === undefined ? "" : irToCall(ir, meta, 1, options.tokenReferenceFormat))},`,
				);
			}
		}
		lines.push("\t},");
	}
	lines.push("} as const;");

	// Props type.
	const variantKeys = Object.keys(recipe.variants);
	const propType = variantKeys
		.map((key) => {
			const values = Object.keys(recipe.variants[key] ?? {});
			const hasBooleanValues = values.some((v) => v === "true" || v === "false");
			const valueType = values
				.map((v) =>
					v === "true" || v === "false" ? `${JSON.stringify(v)} | ${v}` : JSON.stringify(v),
				)
				.join(" | ");
			return `\t${JSON.stringify(key)}?: ${valueType}${hasBooleanValues ? " | boolean" : ""} | Record<string, string>;`;
		})
		.join("\n");

	lines.push("type VariantValue = string | boolean | Record<string, string>;");
	lines.push(`type Props = {`);
	lines.push(propType);
	lines.push("};");

	// Resolver.
	lines.push("");
	if (isSva) {
		lines.push(`export function ${name}(props: Props = {}): Record<string, string> {`);
	} else {
		lines.push(`const resolve${name} = (props: Props = {}): string => {`);
	}
	lines.push("\tconst p: Record<string, VariantValue | undefined> = {};");
	lines.push("\tObject.assign(p, props);");
	if (isSva) {
		lines.push("\tconst out: Record<string, string[]> = {};");
		for (const slot of slotNames) {
			lines.push(`\tout[${JSON.stringify(slot)}] = [${slot === "" ? "base" : `base_${slot}`}]`);
		}
	} else {
		lines.push("\tconst parts: string[] = [base];");
	}
	for (const variantName of variantKeys) {
		const defaultValue = recipe.defaultVariants[variantName];
		const pick = isSva
			? `{ const value = p[${q(variantName)}]; for (const variantValue of (typeof value === "object" && value !== null ? Object.values(value) : [value])) { if (typeof variantValue !== "string") continue; for (const slot of ${JSON.stringify(slotNames)}) { const t = out[slot]; const selected = variants[${q(variantName)}]?.[variantValue]?.[slot]; if (t !== undefined && selected !== undefined) t.push(selected); } } }`
			: `{ const value = p[${q(variantName)}]; for (const variantValue of (typeof value === "object" && value !== null ? Object.values(value) : [value])) { if (typeof variantValue !== "string") continue; const selected = variants[${q(variantName)}]?.[variantValue]; if (selected !== undefined) parts.push(selected); } }`;
		if (defaultValue !== undefined) {
			lines.push(
				`\tif (p[${q(variantName)}] === undefined) p[${q(variantName)}] = ${q(defaultValue)};`,
			);
		}
		lines.push(`\t{ ${pick} }`);
	}

	// Compound variants — mechanical matcher branches.
	for (const compound of recipe.compoundVariants) {
		const conditions = Object.entries(compound.matchers).map(([key, expected]) => {
			const anyOf = expected
				.split("|")
				.map((v) => q(v))
				.join(", ");
			return `p[${q(key)}] !== undefined && [${anyOf}].includes(String(p[${q(key)}]))`;
		});
		const guard = conditions.length > 0 ? conditions.join(" && ") : "true";
		if (isSva) {
			lines.push(`\tif (${guard}) {`);
			for (const slot of slotNames) {
				const ir = compound.slots[slot];
				lines.push(
					`\t\tif (out[${JSON.stringify(slot)}] !== undefined) out[${JSON.stringify(slot)}].push(${renderSlotClass(ir === undefined || ir.entries.length + ir.residuals.length === 0 ? "" : irToCall(ir, meta, 1, options.tokenReferenceFormat))});`,
				);
			}
			lines.push("\t}");
		} else {
			const ir = compound.slots[""];
			const push =
				ir === undefined || (ir.entries.length === 0 && ir.residuals.length === 0)
					? ""
					: ` parts.push(${irToCall(ir, meta, 1, options.tokenReferenceFormat)});`;
			lines.push(`\tif (${guard}) {${push} }`);
		}
	}
	if (isSva) {
		lines.push(
			'\treturn Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.filter(Boolean).join(" ")]));',
		);
	} else {
		lines.push("\treturn cx(parts.filter(Boolean));");
	}
	if (isSva) {
		lines.push("}");
	} else {
		lines.push("};");
		lines.push(`export const ${name} = Object.assign(resolve${name}, {`);
		lines.push(`\t__pandwindVariantKeys: ${JSON.stringify(variantKeys)},`);
		lines.push("});");
	}
	return lines.join("\n") + "\n";
}

/* ------------------------------------------------------------------ */
/* tier-1 pattern module                                               */
/* ------------------------------------------------------------------ */

/**
 * Tier-1 builtin pattern module: base declarations + runtime canonicalProps
 * passthrough. `columns`/`rows`/`size` get dedicated handling per pattern.
 */
export function renderCustomPatternModule(
	name: string,
	transformSource: string,
	options: ModuleOptions,
): string {
	const normalized = /^(?:function|\(?[\w$ ,{}]*\)?\s*=>)/.test(transformSource.trim())
		? transformSource.trim()
		: `function ${transformSource.trim()}`;
	return `/**
 * Generated by pandwind-codemod from a custom Panda pattern.
 * The original transform is retained locally; no panda runtime is required.
 */
import { cssRuntime } from "${options.cssImport}";
import { canonicalProps } from "../internal";

type PatternHelpers = {
	map(
		value: unknown,
		fn: (value: string) => string | undefined,
	): string | Array<string | undefined> | undefined;
	isCssUnit(value: unknown): boolean;
	isCssVar(value: unknown): boolean;
	isCssFunction(value: unknown): boolean;
};
type PatternTransform = (props: Record<string, unknown>, helpers: PatternHelpers) => unknown;

const helpers = {
	map(value: unknown, fn: (value: string) => string | undefined) {
		return Array.isArray(value) ? value.map((item) => fn(String(item))) : fn(String(value));
	},
	isCssUnit(value: unknown) { return typeof value === "string" && /^(?:-?\\d*\\.?\\d+)(?:px|rem|em|%|vh|vw)$/.test(value); },
	isCssVar(value: unknown) { return typeof value === "string" && value.startsWith("var("); },
	isCssFunction(value: unknown) { return typeof value === "string" && value.includes("("); },
};
const typedTransform: PatternTransform = ${normalized};
const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export function ${name}(props: Record<string, unknown> = {}): string {
	const transformed = typedTransform(props, helpers);
	if (!isRecord(transformed)) return "";
	return cssRuntime.class(canonicalProps(transformed));
}
`;
}

export function renderPatternModule(name: string, options: ModuleOptions): string {
	const expansion = expandBuiltinPattern(name, {});
	const needsSize = name === "circle" || name === "square";
	const needsGrid = name === "grid";

	const specialLines: Array<string> = [];
	if (needsGrid) {
		specialLines.push(
			'\tif (props.columns !== undefined) style.gridTemplateColumns = typeof props.columns === "number" ? `repeat(${props.columns}, minmax(0, 1fr))` : String(props.columns);',
		);
		specialLines.push(
			'\tif (props.rows !== undefined) style.gridTemplateRows = typeof props.rows === "number" ? `repeat(${props.rows}, minmax(0, 1fr))` : String(props.rows);',
		);
	}
	if (needsSize) {
		specialLines.push(
			"\tif (props.size !== undefined) { style.width = props.size; style.height = props.size; }",
		);
	}
	if (name === "stack") {
		specialLines.push(
			"\tif (props.direction !== undefined) style.flexDirection = props.direction;",
		);
		specialLines.push("\tif (props.align !== undefined) style.alignItems = props.align;");
		specialLines.push("\tif (props.justify !== undefined) style.justifyContent = props.justify;");
	}
	if (name === "hstack" || name === "vstack") {
		specialLines.push("\tif (props.align !== undefined) style.alignItems = props.align;");
		specialLines.push("\tif (props.justify !== undefined) style.justifyContent = props.justify;");
	}
	if (name === "flex") {
		specialLines.push(
			"\tif (props.direction !== undefined) style.flexDirection = props.direction;",
		);
		specialLines.push("\tif (props.align !== undefined) style.alignItems = props.align;");
		specialLines.push("\tif (props.justify !== undefined) style.justifyContent = props.justify;");
		specialLines.push("\tif (props.wrap !== undefined) style.flexWrap = props.wrap;");
		specialLines.push("\tif (props.basis !== undefined) style.flexBasis = props.basis;");
		specialLines.push("\tif (props.grow !== undefined) style.flexGrow = props.grow;");
		specialLines.push("\tif (props.shrink !== undefined) style.flexShrink = props.shrink;");
	}
	const consumedExtra = [
		"css",
		...(needsGrid ? ["columns", "rows"] : []),
		...(needsSize ? ["size"] : []),
		...(name === "stack" ? ["direction", "align", "justify"] : []),
		...(name === "hstack" || name === "vstack" ? ["align", "justify"] : []),
		...(name === "flex"
			? ["direction", "align", "justify", "wrap", "basis", "grow", "shrink"]
			: []),
	];

	return `/**
 * Generated by pandwind-codemod from the built-in Panda pattern
 * "${name}". Same call signature as styled-system/patterns.
 */
import { cssRuntime } from "${options.cssImport}";
import { canonicalProps } from "../internal";

const base = ${JSON.stringify(expansion.style)};

export function ${name}(props: Record<string, unknown> = {}): string {
	const style: Record<string, unknown> = { ...base };
${specialLines.join("\n")}
	for (const [key, value] of Object.entries(props)) {
		if (value === undefined${consumedExtra.map((k) => ` || key === ${q(k)}`).join("")}) continue;
		style[key] = value;
	}
	return cssRuntime.class(canonicalProps(style));
}
`;
}

/* ------------------------------------------------------------------ */
/* tier-0 fold                                                         */
/* ------------------------------------------------------------------ */

/**
 * Fold a recipe definition + literal props into one css.class call.
 * Returns null when nothing representable (caller leaves a skip marker).
 */
export function foldRecipeCall(
	recipe: PandaRecipeIR,
	props: Record<string, string>,
	meta: PandwindMeta,
	tokenReferenceFormat?: TokenReferenceFormatValue,
): { text: string; ir: SwapIR } | null {
	const selected: Array<SwapIR> = [];
	const slot = recipe.base[""];
	if (recipe.slots !== null) return null; // sva never folds to one class string
	if (slot !== undefined) selected.push(slot);
	const effectiveProps = { ...recipe.defaultVariants, ...props };
	for (const [variantName, valueName] of Object.entries(effectiveProps)) {
		const valueIr = recipe.variants[variantName]?.[valueName]?.[""];
		if (valueIr !== undefined) selected.push(valueIr);
	}
	for (const compound of recipe.compoundVariants) {
		const matches = Object.entries(compound.matchers).every(([key, expected]) =>
			expected.split("|").includes(String(effectiveProps[key])),
		);
		if (matches) {
			const ir = compound.slots[""];
			if (ir !== undefined && (ir.entries.length > 0 || ir.residuals.length > 0)) {
				selected.push(ir);
			}
		}
	}
	const merged = mergeIrs(selected);
	if (merged.entries.length === 0 && merged.residuals.length === 0) return null;
	const text = irToCall(merged, meta, 1, tokenReferenceFormat);
	if (text === "") return null;
	return { text, ir: merged };
}

/**
 * `<outDir>/jsx/index.tsx` — layout components wrapping the emitted pattern
 * modules (Stack/HStack/Box/…), plus Box-style direct containers.
 */
export function renderJsxIndex(
	componentNames: ReadonlySet<string>,
	options: ModuleOptions & { aliasSpecifierFor: (subpath: string) => string },
): string {
	const lines: Array<string> = [];
	lines.push("/**");
	lines.push(" * Generated by pandwind-codemod: styled-system/jsx layout");
	lines.push(" * components rebuilt over the emitted pattern modules.");
	lines.push(" */");
	lines.push(`import { cssRuntime, cx } from "${options.cssImport}";`);
	lines.push('import { canonicalProps, splitStyleProps } from "../internal";');

	const PATTERN_OF: Record<string, string> = {
		Stack: "stack",
		HStack: "hstack",
		VStack: "vstack",
		Flex: "flex",
		Grid: "grid",
		Center: "center",
		Circle: "circle",
		Square: "square",
		Wrap: "wrap",
	};
	const usedPatterns = new Set<string>();
	for (const component of componentNames) {
		const pattern = PATTERN_OF[component];
		if (pattern !== undefined && pattern !== "box") usedPatterns.add(pattern);
	}
	for (const pattern of usedPatterns) {
		lines.push(`import { ${pattern} } from "${options.aliasSpecifierFor(`patterns/${pattern}`)}";`);
	}

	lines.push("");
	lines.push('type AnyElement = import("react").ElementType;');
	lines.push(
		'type AnyProps = Record<string, unknown> & { className?: string; children?: import("react").ReactNode; as?: AnyElement };',
	);
	lines.push(
		"type PandaRecipeFunction = ((props: AnyProps) => string) & { __pandwindVariantKeys?: readonly string[] };",
	);
	lines.push(
		"type PandaRecipe = { base?: Record<string, unknown>; variants?: Record<string, Record<string, Record<string, unknown>>>; defaultVariants?: Record<string, string> } | PandaRecipeFunction;",
	);
	lines.push("export function panda(tag: AnyElement, recipe: PandaRecipe) {");
	lines.push("\treturn function PandaComponent(props: AnyProps) {");
	lines.push("\t\tconst { className, children, ...rest } = props;");
	lines.push(
		'\t\tif (typeof recipe === "function") { const variantKeys = new Set(recipe.__pandwindVariantKeys ?? []); const { style, dom } = splitStyleProps(Object.fromEntries(Object.entries(rest).filter(([key]) => !variantKeys.has(key)))); const runtime = cssRuntime.vars(canonicalProps(style)); const Tag = tag; return <Tag {...dom} className={cx(recipe(props), runtime.class, className)} style={runtime.style}>{children}</Tag>; }',
	);
	lines.push("\t\tconst style: Record<string, unknown> = { ...(recipe.base ?? {}) };");
	lines.push(
		"\t\tfor (const [name, values] of Object.entries(recipe.variants ?? {})) { const value = props[name] ?? recipe.defaultVariants?.[name]; if (value !== undefined) Object.assign(style, values[String(value)] ?? {}); }",
	);
	lines.push("\t\tconst { style: mergedStyle, dom } = splitStyleProps({ ...style, ...rest });");
	lines.push("\t\tconst Tag = tag;");
	lines.push("\t\tconst runtime = cssRuntime.vars(canonicalProps(mergedStyle));");
	lines.push(
		"\t\treturn <Tag {...dom} className={cx(runtime.class, className)} style={runtime.style}>{children}</Tag>;",
	);
	lines.push("\t};");
	lines.push("}");
	lines.push("");

	for (const component of componentNames) {
		const pattern = PATTERN_OF[component];
		if (pattern !== undefined) {
			lines.push(`export function ${component}(props: AnyProps) {`);
			lines.push('\tconst { className, children, as = "div", ...rest } = props;');
			lines.push("\tconst { style, dom } = splitStyleProps(rest);");
			lines.push("\tconst Tag = as;");
			lines.push(
				`\treturn <Tag {...dom} className={cx(${pattern}(style), className)}>{children}</Tag>;`,
			);
			lines.push("}");
			lines.push("");
		} else {
			// Box-style container: props ARE declarations.
			lines.push(`export function ${component}(props: AnyProps) {`);
			lines.push('\tconst { className, children, as = "div", ...rest } = props;');
			lines.push("\tconst { style, dom } = splitStyleProps(rest);");
			lines.push("\tconst Tag = as;");
			lines.push("\tconst runtime = cssRuntime.vars(canonicalProps(style));");
			lines.push(
				"\treturn <Tag {...dom} className={cx(runtime.class, className)} style={runtime.style}>{children}</Tag>;",
			);
			lines.push("}");
			lines.push("");
		}
	}
	if (!componentNames.has("Box")) {
	}
	return lines.join("\n") + "\n";
}
