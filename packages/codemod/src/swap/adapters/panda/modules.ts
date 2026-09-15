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
 * modules import the app's migrated `css` instance from the out-dir
 * bootstrap.
 */
import type { SwapIR } from "../../ir.ts";
import { emitCssClass } from "../../emit.ts";
import type { PandwindMeta } from "../../../meta.ts";
import { PandaRecipeKindTag, type PandaRecipeIR } from "./parse.ts";
import { CSS_PROPERTY_ALIASES } from "../../property-aliases.ts";
import { expandBuiltinPattern } from "./patterns.ts";
import {
	PANDWIND_RAW_PROPERTIES,
	PANDWIND_SUPPORTED_PROPERTIES,
	PANDWIND_TOKEN_PROPERTIES,
} from "./properties.ts";
import { collectPandaColorPalettes, type PandaTheme } from "./theme.ts";
import { presetConditions } from "pandwind/preset";
import { canonicalizePandwindConditions } from "../../pandwind-conditions.ts";
import {
	formatTokenPath,
	TokenReferenceFormat,
	type TokenReferenceFormat as TokenReferenceFormatValue,
} from "../../tokens.ts";

const q = (v: string | number | boolean): string =>
	typeof v === "string" ? JSON.stringify(v) : String(v);

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
 * Every migrated/emitted module binds css through this file.
 */
import { createCss, type AtomicStyleProps } from "pandwind/css";
import { preset } from "./preset";
export const css = createCss(preset);
export type StyleProps = AtomicStyleProps<typeof css>;
`;
}

/** `<outDir>/stack.tsx` — the single configured Stack binding. */
export function renderStackBootstrap(): string {
	return `import { createStack } from "pandwind/stack/react";
import { css } from "./css";

export const Stack = createStack(css);
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
	const hasAppSemanticTokens = Object.keys(formatSemanticGroups).length > 0;
	const hasComponentTokens = Object.keys(formatComponentTokenGroups).length > 0;
	const colorPalettes =
		theme.colorPalettes === undefined || theme.colorPalettes.size === 0
			? collectPandaColorPalettes(theme.tokens ?? {}, theme.colorPalette)
			: theme.colorPalettes;
	const colorPaletteEntries = Array.from(colorPalettes.entries()).toSorted(([left], [right]) =>
		left.localeCompare(right),
	);
	const colorPaletteKey = (name: string): string =>
		/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) ? name : JSON.stringify(name);
	const colorPaletteJson = colorPaletteEntries
		.map(([name, source]) => `\t${colorPaletteKey(name)}: ${JSON.stringify(source)},`)
		.join("\n");
	const conditions = canonicalizePandwindConditions(theme.conditions);
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
	const conditionValues = {
		base: "",
		...presetConditions,
		current: "&:is([aria-current=true], [data-current])",
		icon: "& :where(svg)",
		...conditions,
	};
	const conditionJson = JSON.stringify(conditionValues, null, "\t");
	const propertyDefinitions: Record<string, true | { $tokens: string; $strictness: "inherits" }> = {
		...PANDWIND_RAW_PROPERTIES,
	};
	for (const [property, group] of Object.entries(PANDWIND_TOKEN_PROPERTIES)) {
		const tokenGroup = tokenGroupFor(group, theme.tokens);
		if (Object.hasOwn(theme.tokens, tokenGroup))
			propertyDefinitions[property] = { $tokens: tokenGroup, $strictness: "inherits" };
	}
	const propertyJson = JSON.stringify(propertyDefinitions, null, "\t");
	const appSemanticDeclaration = hasAppSemanticTokens
		? `const appSemanticTokens = appTokens.defineSemanticTokens(
	conditions,
	${semanticTokenJson} as const,
);
`
		: "";
	const componentDeclaration = hasComponentTokens
		? `const componentTokens = ${hasAppSemanticTokens ? "appSemanticTokens" : "appTokens"}.defineSemanticTokens(
	conditions,
	${componentTokenJson} as const,
);
`
		: "";
	const colorPaletteDeclaration =
		colorPaletteEntries.length > 0
			? `const colorPalettes = tokens.defineColorPalettes({
${colorPaletteJson}
});
`
			: "";
	const colorPaletteProperty = colorPaletteEntries.length > 0 ? "\t\tcolorPalettes,\n" : "";
	const tokenDeclaration = hasComponentTokens
		? "const tokens = componentTokens;"
		: hasAppSemanticTokens
			? "const tokens = appSemanticTokens;"
			: "const tokens = appTokens;";
	return `/**
 * Generated by pandwind-codemod from the host Panda theme.
 * It is an app-owned preset: no Pandwind token or property defaults are imported.
 */
import {
\tdefine,
\ttype PandwindProperties,
} from "pandwind/preset";

const conditions = define.conditions(${conditionJson});
const appTokens = define.tokens(${rawTokenJson});
${appSemanticDeclaration}${componentDeclaration}${tokenDeclaration}
${colorPaletteDeclaration}
const cssConfig: PandwindProperties = {};

export const preset = define.preset(
\t{ config: cssConfig, tokens },
\t{
\t\tstrict: true,
\t\tconditions,
\t\tproperties: define.properties(${propertyJson}),
${colorPaletteProperty}\t},
);
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
	/** Import statement for the app's css binding inside emitted modules. */
	cssImport: string;
	/** Token spelling policy used by generated style calls. */
	tokenReferenceFormat?: TokenReferenceFormatValue;
	/** Panda aliases normalized to canonical CSS properties in generated modules. */
	propertyAliases?: ReadonlyMap<string, string>;
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
		lines.push('\treturn css.props(parts).className ?? "";');
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

export function renderPatternModule(name: string, options: ModuleOptions): string {
	const expansion = expandBuiltinPattern(name, {});
	const needsSize = name === "circle" || name === "square";
	const needsGrid = name === "grid";
	const propertyAliases = [...(options.propertyAliases ?? [])]
		.map(([alias, property]) => [alias, CSS_PROPERTY_ALIASES.get(property) ?? property] as const)
		.filter(
			([alias, property]) =>
				alias !== property && PANDWIND_SUPPORTED_PROPERTIES.has(property) && alias !== "css",
		)
		.toSorted(([left], [right]) => left.localeCompare(right));
	const aliasProps = propertyAliases
		.map(
			([alias, property]) =>
				`\t${q(alias)}?: StyleProps[${JSON.stringify(property)} & keyof StyleProps];`,
		)
		.join("\n");
	const aliasNames = propertyAliases.map(([alias]) => alias);
	const extraProps = [
		"css?: StyleProps",
		...(name === "stack"
			? [
					'direction?: StyleProps["flexDirection"]',
					'align?: StyleProps["alignItems"]',
					'justify?: StyleProps["justifyContent"]',
				]
			: []),
		...(name === "hstack" || name === "vstack"
			? ['align?: StyleProps["alignItems"]', 'justify?: StyleProps["justifyContent"]']
			: []),
		...(needsGrid
			? [
					'columns?: number | StyleProps["gridTemplateColumns"]',
					'rows?: number | StyleProps["gridTemplateRows"]',
				]
			: []),
		...(needsSize ? ['size?: StyleProps["width"]'] : []),
		...(name === "flex"
			? [
					'direction?: StyleProps["flexDirection"]',
					'align?: StyleProps["alignItems"]',
					'justify?: StyleProps["justifyContent"]',
					'wrap?: StyleProps["flexWrap"]',
					'basis?: StyleProps["flexBasis"]',
					'grow?: StyleProps["flexGrow"]',
					'shrink?: StyleProps["flexShrink"]',
				]
			: []),
	]
		.map((line) => `\t${line};`)
		.join("\n");
	const consumedProps = [
		"css",
		...aliasNames,
		...(needsGrid ? ["columns", "rows"] : []),
		...(needsSize ? ["size"] : []),
		...(name === "stack" ? ["direction", "align", "justify"] : []),
		...(name === "hstack" || name === "vstack" ? ["align", "justify"] : []),
		...(name === "flex"
			? ["direction", "align", "justify", "wrap", "basis", "grow", "shrink"]
			: []),
	];
	const destructuredProps = consumedProps
		.map((property) => (property === "css" ? "css: cssOverride" : property))
		.join(", ");
	const aliasAssignments = propertyAliases
		.map(([alias, property]) => `\t\t...(${alias} !== undefined ? { ${property}: ${alias} } : {}),`)
		.join("\n");

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
	return `/**
 * Generated by pandwind-codemod from the built-in Panda pattern
 * "${name}". Same call signature as styled-system/patterns.
 */
import { css, type StyleProps } from "${options.cssImport}";

type PatternProps = StyleProps & {
${extraProps}${extraProps === "" || aliasProps === "" ? "" : "\n"}${aliasProps}
};

const base = ${JSON.stringify(expansion.style)} satisfies StyleProps;

export function ${name}(props: PatternProps = {}): string {
\tconst { ${destructuredProps}, ...styleProps } = props;
	const style: StyleProps = {
		...base,
		...styleProps,
${aliasAssignments}
	};
	${specialLines.join("\n\t")}
	return css.class(style, cssOverride ?? {});
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
