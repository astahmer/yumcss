import {
	SemanticConditionKindTag,
	inferSemanticConditionKind,
	StyleProgramResidualKindTag,
	StyleRuleKindTag,
	StyleValueKindTag,
	type SemanticConditionKind,
} from "../semantic-ir.ts";
import {
	CodemodAdapterKit,
	defineCodemodAdapter,
	type AdapterRenderers,
} from "../external-adapters.ts";
import { SourcePass } from "../../source-pass-utils.ts";
import type {
	AdapterConfigContext,
	AdapterConditionCatalog,
	AdapterEmitContext,
	AdapterGeneratedFile,
	AdapterParseContext,
	AdapterParseResult,
	AdapterProjectBindings,
	AdapterProjectConfig,
	AdapterTargetMigrationPolicy,
	AdapterTokenPolicy,
} from "../adapter-contract.ts";
import {
	styleProgramFromSourceObject,
	styleProgramFromRules,
	type StyleCondition,
	type StyleProgram,
	type StyleRule,
	type StyleValue,
} from "../semantic-ir.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";
import {
	CodemodAdapterId,
	AdapterCapabilityTag,
	CodemodPatternId,
	CodemodStyleIdentity,
	StyleProgramCompositionKind,
	StyleProgramEmissionHint,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import { SourceBindingKind } from "pandwind/source";
import { presetConditions } from "pandwind/preset";
import { JsxStyleHost } from "../jsx-style-host.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import {
	canonicalPandwindConditionName,
	isPandwindConditionName,
	pandwindConditionNameForSelector,
} from "../pandwind-conditions.ts";
import {
	componentAttrsExpressionForSubject,
	componentPropNamesForSubject,
	componentExpressionForSubject,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";
import {
	formatTokenReference,
	normalizeTokenKey,
	TokenCatalog,
	TokenReferenceFormat,
	materializeSourceTokenValues,
} from "../tokens.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import {
	dirnameDocumentPath,
	isAbsoluteDocumentPath,
	joinDocumentPath,
	relativeDocumentPath,
} from "../../path-utils.ts";
import {
	captureSlotRecipeSlots,
	preserveUnsupportedRecipeFields,
	preserveUnsupportedSlotRecipeFields,
	pandwindSlotRecipeSourceObjectOptions,
	recipeDefinitionObject,
	recipeSourceObjectOptions,
} from "./recipe-source.ts";

const PANDWIND_TARGET_POLICY: AdapterTargetMigrationPolicy = {
	handlesHostRewrites: true,
	handlesFrameworkSemantics: true,
	// Pandwind owns the final host. Source factories are projected to verified
	// intrinsic elements; preserving a foreign factory would keep the source
	// ecosystem alive after a supposedly complete migration.
	demotesFactoryHosts: true,
	hostRepresentation: StyleHostRepresentationKind.Class,
	standaloneHostRepresentation: StyleHostRepresentationKind.Class,
	preservesResidualKindsForRepresentation: () => [StyleProgramResidualKindTag.UnknownUtility],
	resolveHostRepresentation: ({ program, hasHostContext, framework }) => {
		if (hasHostContext || program.source?.subject === undefined)
			return StyleHostRepresentationKind.Class;
		if (
			framework === BuiltinHostFramework.React ||
			framework === BuiltinHostFramework.Preact ||
			framework === BuiltinHostFramework.Solid ||
			framework === BuiltinHostFramework.Vue
		)
			return StyleHostRepresentationKind.Component;
		return StyleHostRepresentationKind.Class;
	},
	rewriteComponent: ({ code, binding, framework, representation }) => {
		if (representation !== StyleHostRepresentationKind.Component)
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: binding,
						hint: "Pandwind class projection should use the shared host rewriter",
					},
				],
			};
		if (
			framework !== BuiltinHostFramework.React &&
			framework !== BuiltinHostFramework.Preact &&
			framework !== BuiltinHostFramework.Solid &&
			framework !== BuiltinHostFramework.Vue
		)
			return {
				code,
				residuals: [
					{
						kind: "host-framework",
						text: binding,
						hint: `Pandwind static component projection requires a supported host, got ${framework}`,
					},
				],
			};
		// The Pandwind emitter owns the component wrapper for this representation.
		// The emitter owns the component wrapper; this hook only validates that the
		// selected representation is the component contract.
		return { code, residuals: [] };
	},
	requiresHostWrapper: ({ source, binding }) => {
		const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return (
			/\b(?:from\s+|import\s*\()?['"]styled-components['"]/.test(source) &&
			(new RegExp(`styled\\s*\\(\\s*${escaped}\\s*\\)`).test(source) ||
				new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*styled(?:\\.|\\s*\\()`).test(source) ||
				new RegExp(`<${escaped}(?:\\s|/?>)`).test(source))
		);
	},
	handlesRawTemplate: () => true,
	handlesTemplateFragment: (program) => program.source?.pattern === CodemodPatternId.CssTemplate,
};

function runtimeValue(value: StyleProgram["declarations"][number]["value"]): string {
	if (value.kind === StyleValueKindTag.Dynamic) return value.expression;
	if (value.kind === StyleValueKindTag.Token) return JSON.stringify(value.authored);
	return JSON.stringify(value.value);
}

function delimitedRuntimeExpression(
	source: string,
	start: number,
	open: string,
	close: string,
): number | undefined {
	let depth = 0;
	let quote: string | undefined;
	for (let index = start; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === "\\") index++;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			quote = character;
			continue;
		}
		if (character === open) depth++;
		if (character === close && --depth === 0) return index + 1;
	}
	return undefined;
}

function splitRuntimeList(source: string): readonly string[] {
	const parts: string[] = [];
	let start = 0;
	let braces = 0;
	let brackets = 0;
	let parens = 0;
	let quote: string | undefined;
	for (let index = 0; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === "\\") index++;
			else if (character === quote) quote = undefined;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
			quote = character;
			continue;
		}
		if (character === "{") braces++;
		else if (character === "}") braces--;
		else if (character === "[") brackets++;
		else if (character === "]") brackets--;
		else if (character === "(") parens++;
		else if (character === ")") parens--;
		else if (character === "," && braces === 0 && brackets === 0 && parens === 0) {
			parts.push(source.slice(start, index).trim());
			start = index + 1;
		}
	}
	const last = source.slice(start).trim();
	if (last !== "") parts.push(last);
	return parts;
}

function runtimeObjectBody(value: string): string | undefined {
	const trimmed = value.trim();
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
	return trimmed.slice(1, -1);
}

function runtimeObjectField(body: string, name: string): string | undefined {
	for (const part of splitRuntimeList(body)) {
		const colon = part.indexOf(":");
		if (colon < 0) continue;
		const key = part
			.slice(0, colon)
			.trim()
			.replace(/^['"]|['"]$/g, "");
		if (key === name) return part.slice(colon + 1).trim();
	}
	return undefined;
}

function runtimeString(
	value: string | undefined,
	bindings: ReadonlyMap<string, string>,
): string | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	const bound = bindings.get(trimmed);
	if (bound !== undefined) return bound;
	if (!/^['"]/.test(trimmed)) return undefined;
	try {
		return JSON.parse(trimmed) as string;
	} catch {
		return trimmed.slice(1, -1);
	}
}

function runtimeStyleValue(
	value: string | undefined,
	bindings: ReadonlyMap<string, string>,
): StyleValue {
	const trimmed = value?.trim() ?? "undefined";
	const bound = bindings.get(trimmed);
	if (bound !== undefined) return { kind: StyleValueKindTag.Literal, value: bound };
	if (trimmed === "true" || trimmed === "false")
		return { kind: StyleValueKindTag.Literal, value: trimmed === "true" };
	if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed))
		return { kind: StyleValueKindTag.Literal, value: Number(trimmed) };
	const stringValue = runtimeString(trimmed, bindings);
	if (stringValue !== undefined) return { kind: StyleValueKindTag.Literal, value: stringValue };
	return { kind: StyleValueKindTag.Dynamic, expression: trimmed };
}

function runtimeArrayItems(value: string | undefined): readonly string[] {
	if (value === undefined) return [];
	const trimmed = value.trim();
	if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
	return splitRuntimeList(trimmed.slice(1, -1));
}

function runtimeRuleKind(
	value: string | undefined,
	bindings: ReadonlyMap<string, string>,
): StyleRule["kind"] | undefined {
	const kind = runtimeString(value, bindings);
	switch (kind) {
		case StyleRuleKindTag.Style:
		case StyleRuleKindTag.Global:
		case StyleRuleKindTag.Keyframes:
		case StyleRuleKindTag.FontFace:
		case StyleRuleKindTag.Layer:
		case StyleRuleKindTag.Supports:
		case StyleRuleKindTag.Property:
			return kind;
		default:
			return undefined;
	}
}

function runtimeRule(
	value: string,
	bindings: ReadonlyMap<string, string>,
	order: number,
): StyleRule | undefined {
	const body = runtimeObjectBody(value);
	if (body === undefined) return undefined;
	const kind = runtimeRuleKind(runtimeObjectField(body, "kind"), bindings);
	if (kind === undefined) return undefined;
	const declarations = runtimeArrayItems(runtimeObjectField(body, "declarations")).flatMap(
		(item) => {
			const declaration = runtimeObjectBody(item);
			if (declaration === undefined) return [];
			const property = runtimeString(runtimeObjectField(declaration, "property"), bindings);
			if (property === undefined) return [];
			return [
				{
					conditions: [],
					property,
					value: runtimeStyleValue(runtimeObjectField(declaration, "value"), bindings),
				},
			];
		},
	);
	const conditions = runtimeArrayItems(runtimeObjectField(body, "conditions")).flatMap((item) => {
		const value = runtimeString(item, bindings);
		if (value === undefined) return [];
		return [
			{
				kind: inferSemanticConditionKind(value),
				name: value,
				value,
				raw: value,
			},
		];
	});
	const children = runtimeArrayItems(runtimeObjectField(body, "children")).flatMap(
		(item, index) => {
			const child = runtimeRule(item, bindings, index);
			return child === undefined ? [] : [child];
		},
	);
	const selector = runtimeString(runtimeObjectField(body, "selector"), bindings);
	const name = runtimeString(runtimeObjectField(body, "name"), bindings);
	const layer = runtimeString(runtimeObjectField(body, "layer"), bindings);
	return {
		kind,
		...(selector === undefined ? {} : { selector }),
		...(name === undefined ? {} : { name }),
		...(layer === undefined ? {} : { layer }),
		conditions,
		declarations,
		children,
		order,
	};
}

function runtimeBindingValues(source: string): ReadonlyMap<string, string> {
	const values = new Map<string, string>();
	for (const match of source.matchAll(
		/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'][^"']*["'])/gu,
	)) {
		const name = match[1];
		const value = match[2];
		if (name !== undefined && value !== undefined) {
			const parsed = runtimeString(value, new Map());
			if (parsed !== undefined) values.set(name, parsed);
		}
	}
	return values;
}

function runtimeSemanticRuleMatches(
	source: string,
	context: AdapterParseContext,
): AdapterParseResult {
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: Array<AdapterParseResult["residuals"][number]> = [];
	const bindings = runtimeBindingValues(source);
	for (const call of source.matchAll(/\b[A-Za-z_$][\w$]*\.sheet\.registerSemanticRules\s*\(/gu)) {
		const callStart = call.index ?? 0;
		const openParen = source.indexOf("(", callStart);
		const arrayStart = source.indexOf("[", openParen);
		if (openParen < 0 || arrayStart < 0) continue;
		const arrayEnd = delimitedRuntimeExpression(source, arrayStart, "[", "]");
		const callEnd = delimitedRuntimeExpression(source, openParen, "(", ")");
		if (arrayEnd === undefined || callEnd === undefined) continue;
		const rules = splitRuntimeList(source.slice(arrayStart + 1, arrayEnd - 1)).flatMap(
			(item, index) => {
				const parsed = runtimeRule(item, bindings, index);
				return parsed === undefined ? [] : [parsed];
			},
		);
		if (rules.length === 0) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: source.slice(callStart, callEnd),
				hint: "Pandwind runtime semantic rules could not be read back",
			});
			continue;
		}
		let start = callStart;
		let end = callEnd;
		const prefix = "() => (";
		if (
			callStart >= prefix.length &&
			source.slice(callStart - prefix.length, callStart) === prefix
		) {
			start = callStart - prefix.length;
			const outerEnd = delimitedRuntimeExpression(source, callStart - 1, "(", ")");
			if (outerEnd !== undefined) end = outerEnd;
		} else if (callStart > 0 && source[callStart - 1] === "(") {
			start = callStart - 1;
			const outerEnd = delimitedRuntimeExpression(source, start, "(", ")");
			if (outerEnd !== undefined) end = outerEnd;
		} else {
			const iifeStart = source.lastIndexOf("(() => {", callStart);
			const iifeEnd = source.indexOf("})()", callEnd);
			if (iifeStart >= 0 && iifeEnd >= callEnd) {
				start = iifeStart;
				end = iifeEnd + 4;
			}
		}
		const sourceMap = {
			file: context.file,
			start,
			end,
			adapter: context.config.adapter,
			pattern: CodemodPatternId.RuntimeSemanticRules,
		};
		matches.push({
			start,
			end,
			sourceText: source.slice(start, end),
			program: styleProgramFromRules(rules, { source: sourceMap }),
		});
	}
	return { matches, residuals };
}

const PANDWIND_TOKEN_GROUPS: ReadonlyArray<readonly [RegExp, string]> = [
	[/color$/i, "colors"],
	[/^background$/i, "colors"],
	[/^(?:background|border|outline|text)Color$/i, "colors"],
	[/^(?:fill|stroke)$/i, "colors"],
	[/radius$/i, "radii"],
	[/^(?:font)?size$/i, "fontSizes"],
	[/^fontWeight$/i, "fontWeights"],
	[/^lineHeight$/i, "lineHeights"],
	[/^letterSpacing$/i, "letterSpacings"],
	[/^fontFamily$/i, "fonts"],
	[/shadow$/i, "shadows"],
	[/^(?:zIndex)$/i, "zIndices"],
	[/^(?:padding|margin|gap|inset)/i, "spacing"],
	[/^(?:width|height|minWidth|maxWidth|minHeight|maxHeight)$/i, "sizes"],
];

function pandwindTokenGroup(property: string): string | undefined {
	return PANDWIND_TOKEN_GROUPS.find(([pattern]) => pattern.test(property))?.[1];
}

function pandwindSourceValue(
	value: StyleValue,
	property: string,
	context: AdapterParseContext,
): StyleValue {
	if (value.kind !== StyleValueKindTag.Literal || typeof value.value !== "string") return value;
	const group = pandwindTokenGroup(property);
	const catalog = TokenCatalog.fromContract(context.config.tokenCatalog);
	if (group === undefined || catalog === undefined) return value;
	const normalized = normalizeTokenKey(value.value);
	const reference = normalized.startsWith(`${group}.`)
		? normalized.slice(group.length + 1)
		: normalized;
	const match = catalog.findByReference([group], reference);
	return match === undefined
		? value
		: {
				kind: StyleValueKindTag.Token,
				ref: match.ref,
				authored: value.value,
				resolved: match.resolved,
			};
}

/**
 * Prefer a known Pandwind preset token over repeating its resolved literal.
 * The lookup is property-aware: a color may only recover a color token, not a
 * coincidentally equal spacing token. The resolved value stays on the
 * semantic node so validation still compares CSS meaning; the authored token
 * spelling is what the target source receives. Unknown values remain
 * untouched rather than being guessed.
 */
function preserveKnownPresetTokens(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): StyleProgram {
	const catalog =
		TokenCatalog.fromContract(context?.config.tokenCatalog) ??
		TokenCatalog.fromAnyTokens(context?.meta?.tokens) ??
		(context?.project === undefined
			? undefined
			: TokenCatalog.fromContract(context.sourceConfig?.tokenCatalog));
	if (catalog !== undefined)
		return catalog.preserveProgram(program, pandwindTokenGroup, (match) =>
			formatTokenReference(match, context?.tokenReferenceFormat ?? TokenReferenceFormat.Preserve),
		);
	return program.source?.adapter === CodemodAdapterId.Pandwind
		? program
		: materializeSourceTokenValues(program);
}

function unresolvedForeignTokenResiduals(program: StyleProgram): StyleProgram["residuals"] {
	if (program.source?.adapter === CodemodAdapterId.Pandwind) return [];
	const residuals: StyleProgram["residuals"][number][] = [];
	const addResidual = (residual: StyleProgram["residuals"][number]) => {
		if (
			residuals.some(
				(existing) => existing.kind === residual.kind && existing.text === residual.text,
			)
		)
			return;
		residuals.push(residual);
	};
	const visit = (rule: StyleRule): void => {
		for (const declaration of rule.declarations) {
			const tokenValue = declaration.value;
			if (tokenValue.kind !== StyleValueKindTag.Token || tokenValue.resolved !== undefined)
				continue;
			const existing = program.residuals.find(
				(residual) =>
					residual.kind === AdapterCapabilityTag.TokenValues &&
					residual.text === tokenValue.authored,
			);
			if (existing !== undefined) {
				addResidual(existing);
				continue;
			}
			addResidual({
				kind: AdapterCapabilityTag.TokenValues,
				text: tokenValue.authored,
				hint: `source token ${tokenValue.ref} has no verified target value`,
			});
		}
		for (const child of rule.children) visit(child);
	};
	for (const rule of program.rules) visit(rule);
	return residuals;
}

const conditionQuery = (kind: string, value: string): string => {
	const prefix = `@${kind} `;
	return value.startsWith(prefix) ? value.slice(prefix.length) : value;
};

const conditionCatalogEntries = (
	conditionCatalog: AdapterConditionCatalog | undefined,
): readonly [string, string][] => {
	const catalogs = [presetConditions, conditionCatalog];
	const entries = new Map<string, string>();
	for (const catalog of catalogs) {
		if (catalog === undefined) continue;
		for (const [name, value] of Object.entries(catalog)) {
			if (typeof value === "string") entries.set(name, value);
			else if (Array.isArray(value))
				for (const item of value) if (typeof item === "string") entries.set(name, item);
		}
	}
	return [...entries];
};

const pandwindConditionOptions = (
	conditionCatalog: AdapterConditionCatalog | undefined,
): {
	readonly conditionKinds: Readonly<Record<string, SemanticConditionKind>>;
	readonly conditionValues: Readonly<Record<string, string>>;
} => {
	const conditionKinds: Record<string, SemanticConditionKind> = {};
	const conditionValues: Record<string, string> = {};
	for (const [name, value] of conditionCatalogEntries(conditionCatalog)) {
		const normalized = name.replace(/^_/, "");
		conditionKinds[normalized] = inferSemanticConditionKind(value);
		conditionValues[normalized] = value.replace(/^@(media|container|supports)\s+/u, "");
	}
	return { conditionKinds, conditionValues };
};

const conditionCatalogMatch = (
	condition: StyleCondition,
	entries: readonly [string, string][],
): string | undefined => {
	if (condition.kind === SemanticConditionKindTag.Named) {
		const authoredNames = new Set([
			condition.name,
			condition.raw,
			canonicalPandwindConditionName(condition.name),
			condition.raw === undefined ? undefined : canonicalPandwindConditionName(condition.raw),
		]);
		return entries.find(([name]) => authoredNames.has(name))?.[0];
	}
	const authored = condition.value ?? condition.raw ?? condition.name;
	const expected =
		condition.kind === SemanticConditionKindTag.Media ||
		condition.kind === SemanticConditionKindTag.Container ||
		condition.kind === SemanticConditionKindTag.Supports
			? conditionQuery(condition.kind, authored)
			: authored;
	const candidates = entries.filter(([, value]) => {
		const candidate =
			condition.kind === SemanticConditionKindTag.Media ||
			condition.kind === SemanticConditionKindTag.Container ||
			condition.kind === SemanticConditionKindTag.Supports
				? conditionQuery(condition.kind, value)
				: value;
		return candidate === expected;
	});
	const wantsNativeAlias = condition.raw?.startsWith("_") === true;
	candidates.sort(([left], [right]) => {
		const leftAlias = left.startsWith("_") === wantsNativeAlias;
		const rightAlias = right.startsWith("_") === wantsNativeAlias;
		return Number(rightAlias) - Number(leftAlias);
	});
	return candidates[0]?.[0];
};

const conditionCatalogValue = (
	name: string,
	entries: readonly [string, string][],
): string | undefined => entries.find(([candidate]) => candidate === name)?.[1];

const isSafeNestedSelector = (condition: StyleCondition): boolean => {
	if (condition.kind !== SemanticConditionKindTag.Selector) return false;
	const selector = condition.value ?? condition.raw ?? condition.name;
	return selector.trim() !== "";
};

type PandwindConditionResult = {
	readonly condition?: StyleCondition;
	readonly residual?: StyleProgram["residuals"][number];
};

const pandwindCondition = (
	condition: StyleCondition,
	entries: readonly [string, string][],
): PandwindConditionResult => {
	const named = (name: string): StyleCondition => {
		const preserveResolvedValue = condition.kind !== SemanticConditionKindTag.Named;
		const catalogValue = conditionCatalogValue(name, entries);
		const value = preserveResolvedValue
			? (condition.value ??
				catalogValue?.replace(/^@(media|container|supports)\s+/u, "") ??
				condition.name)
			: undefined;
		return {
			kind: preserveResolvedValue ? condition.kind : SemanticConditionKindTag.Named,
			name,
			...(value === undefined ? {} : { value }),
		};
	};
	if (condition.kind === SemanticConditionKindTag.Named && condition.name === "base") return {};
	const authoredName = condition.raw ?? condition.name;
	const canonicalName = canonicalPandwindConditionName(authoredName);
	if (isPandwindConditionName(canonicalName)) return { condition: named(canonicalName) };
	if (
		condition.kind === SemanticConditionKindTag.Selector ||
		condition.kind === SemanticConditionKindTag.Pseudo
	) {
		const selector = condition.value ?? condition.name;
		const selectorName = pandwindConditionNameForSelector(
			selector.startsWith("&") ? selector : `&${selector}`,
		);
		if (selectorName !== undefined) return { condition: named(selectorName) };
	}
	const match = conditionCatalogMatch(condition, entries);
	if (match !== undefined) return { condition: named(match) };
	if (
		condition.kind === SemanticConditionKindTag.Media ||
		condition.kind === SemanticConditionKindTag.Container ||
		condition.kind === SemanticConditionKindTag.Supports
	)
		return { condition };
	if (isSafeNestedSelector(condition)) return { condition };
	return {
		residual: {
			kind: StyleProgramResidualKindTag.Capability,
			text: condition.raw ?? condition.value ?? condition.name,
			hint: "condition is not declared by the Pandwind preset or project condition catalog",
		},
	};
};

function normalizePandwindConditions(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
	onResidual?: (residual: StyleProgram["residuals"][number]) => void,
): StyleProgram {
	const entries = conditionCatalogEntries(context?.config.conditionCatalog);
	if (entries.length === 0) return program;
	const preservedConditionPrefix =
		program.compositions?.some(
			(composition) =>
				composition.kind === StyleProgramCompositionKind.Recipe ||
				composition.kind === StyleProgramCompositionKind.Slot,
		) === true
			? 2
			: 0;
	const normalize = (conditions: readonly StyleCondition[]): readonly StyleCondition[] =>
		conditions.flatMap((condition, index) => {
			if (index < preservedConditionPrefix) return [condition];
			const normalized = pandwindCondition(condition, entries);
			if (normalized.residual !== undefined) onResidual?.(normalized.residual);
			return normalized.condition === undefined ? [] : [normalized.condition];
		});
	const declaration = (item: StyleProgram["declarations"][number]) => ({
		...item,
		conditions: normalize(item.conditions),
	});
	const rule = (item: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...item,
		conditions: normalize(item.conditions),
		declarations: item.declarations.map(declaration),
		children: item.children.map(rule),
	});
	return {
		...program,
		declarations: program.declarations.map(declaration),
		rules: program.rules.map(rule),
	};
}

const PANDWIND_TOKEN_POLICY: AdapterTokenPolicy = {
	schema: "pandwind.adapter-token-policy/1",
	preserve: (program, context) => preserveKnownPresetTokens(program, context),
};

function pandwindConfig(
	context: AdapterConfigContext,
	conditionCatalog?: AdapterConditionCatalog,
): AdapterProjectConfig {
	return {
		adapter: CodemodAdapterId.Pandwind,
		root: context.root,
		files: [context.file],
		values: {},
		...(conditionCatalog === undefined ? {} : { conditionCatalog }),
	};
}

type PresetModule = Record<string, unknown>;

async function importGeneratedPreset(
	bridgePath: string,
	bridgeSource: string,
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<Record<string, Record<string, unknown>> | undefined> {
	const binding = /\bpreset\s*:\s*([A-Za-z_$][\w$]*)/u.exec(bridgeSource)?.[1];
	if (binding === undefined) return undefined;
	for (const match of bridgeSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/gu)) {
		const imported = match[1]
			?.split(",")
			.map((part) => part.trim().split(/\s+as\s+/u))
			.find((parts) => (parts[1] ?? parts[0]) === binding);
		if (imported === undefined || context.root === undefined) continue;
		const specifier = match[2]!;
		let module: PresetModule | undefined;
		if (specifier.startsWith(".")) {
			const path = joinDocumentPath(dirnameDocumentPath(bridgePath), specifier);
			for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}.js`, `${path}.mjs`]) {
				module = await loader.importFile<PresetModule>(candidate);
				if (module !== undefined) break;
			}
		} else {
			module = await loader.importPackage<PresetModule>(specifier, context.root);
		}
		const preset = module?.[imported[0]!] as { tokens?: unknown } | undefined;
		if (preset?.tokens === null || typeof preset?.tokens !== "object") continue;
		return preset.tokens as Record<string, Record<string, unknown>>;
	}
	return undefined;
}

async function officialPandwindConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
	conditionCatalog?: AdapterConditionCatalog,
): Promise<AdapterProjectConfig> {
	const fallback = pandwindConfig(context, conditionCatalog);
	if (context.root === undefined || context.readFile === undefined) return fallback;
	const sourceFile = isAbsoluteDocumentPath(context.file)
		? context.file
		: joinDocumentPath(context.root, context.file);
	const directories: string[] = [];
	let directory = dirnameDocumentPath(sourceFile);
	for (;;) {
		if (!directories.includes(directory)) directories.push(directory);
		if (directory === context.root || directory === "." || directory === "/") break;
		directory = dirnameDocumentPath(directory);
	}
	for (const candidateDirectory of directories) {
		const interopPath = joinDocumentPath(candidateDirectory, "pandwind.interop.json");
		const interopSource = context.readFile(interopPath);
		if (interopSource === undefined) continue;
		try {
			const interop = JSON.parse(interopSource) as {
				generatedFrom?: { bridge?: string };
			};
			const bridgePath = joinDocumentPath(
				candidateDirectory,
				interop.generatedFrom?.bridge ?? "bridge.ts",
			);
			const bridgeSource = context.readFile(bridgePath);
			if (bridgeSource === undefined)
				throw new Error(`generated bridge not found at ${bridgePath}`);
			const tokens = await importGeneratedPreset(bridgePath, bridgeSource, context, loader);
			if (tokens === undefined)
				throw new Error("generated bridge does not expose a loadable preset");
			const tokenCatalog = TokenCatalog.fromNested(tokens)?.contract;
			if (tokenCatalog === undefined)
				throw new Error("generated preset does not contain statically resolvable tokens");
			return {
				...fallback,
				files: [...fallback.files, interopPath, bridgePath],
				tokenCatalog,
				values: {
					pandwindInteropPath: interopPath,
					pandwindBridgePath: bridgePath,
					officialConfigPackage: "pandwind interop artifact",
				},
			};
		} catch (error) {
			return {
				...fallback,
				residuals: [
					{
						kind: StyleProgramResidualKindTag.Configuration,
						text: "Pandwind generated design-system metadata",
						hint: `Pandwind interop loading failed: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
			};
		}
	}
	return fallback;
}

function generatedCssBinding(
	source: string | undefined,
	sourceModules: readonly string[] = [],
	sourceModuleMatchers: readonly ((moduleSpecifier: string) => boolean)[] = [],
): string {
	const input = source ?? "";
	const ownedModules = new Set(sourceModules);
	const cssImports = /\bimport\s+([^;]+?)\s+from\s+["']([^"']+)["']/gu;
	const ownsModule = (moduleSpecifier: string | undefined): boolean =>
		moduleSpecifier !== undefined &&
		(ownedModules.has(moduleSpecifier) ||
			sourceModuleMatchers.some((matcher) => matcher(moduleSpecifier)));
	for (const match of input.matchAll(cssImports)) {
		const clause = match[1]?.trim() ?? "";
		const moduleSpecifier = match[2];
		const named = /\{([^}]*)\}/u.exec(clause)?.[1] ?? "";
		const importsBareCss =
			clause.split(",")[0]?.trim() === "css" ||
			named.split(",").some((specifier) => {
				const [imported, local] = specifier.trim().split(/\s+as\s+/u);
				return imported === "css" && (local === undefined || local === "css");
			});
		if (importsBareCss) return "targetCss";
		if (ownsModule(moduleSpecifier)) continue;
	}
	const bindingInput = input.replace(
		cssImports,
		(statement, _clause: string, moduleSpecifier: string) =>
			ownsModule(moduleSpecifier) ? "" : statement,
	);
	for (const candidate of ["css", "targetCss", "pwCss"]) {
		const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (
			!new RegExp(`\\b(?:const|let|var|import)\\s+(?:default\\s+)?${escaped}\\b`).test(bindingInput)
		)
			return candidate;
	}
	return "targetCss";
}

function renameGeneratedCssBinding(
	emission: { text: string; imports: readonly string[] },
	binding: string,
): { text: string; imports: readonly string[] } {
	if (binding === "css") return emission;
	const rename = (value: string) =>
		value.replace(/\bcss(?=\s*[.({,;}])/g, binding).replace(/\bcss(?=\s*=)/g, binding);
	return { text: rename(emission.text), imports: emission.imports.map(rename) };
}

function projectImportSpecifier(file: string, modulePath: string): string {
	const withoutExtension = modulePath.replace(/\.(?:[cm]?tsx?|jsx?)$/u, "");
	let specifier = relativeDocumentPath(dirnameDocumentPath(file), withoutExtension);
	if (!specifier.startsWith(".")) specifier = `./${specifier}`;
	return specifier;
}

/** Replace per-file Pandwind factories with the project-owned shared modules. */
function useProjectBindings(
	emission: { text: string; imports: readonly string[] },
	binding: string,
	file: string,
	project: AdapterProjectBindings | undefined,
): { text: string; imports: readonly string[] } {
	if (project === undefined) return emission;
	const runtime = emission.imports.some((statement) =>
		/from\s+["']pandwind\/css\/runtime["']/u.test(statement),
	);
	const unsafe = emission.imports.some((statement) =>
		/from\s+["']pandwind\/unsafe\/css["']/u.test(statement),
	);
	const cssModule = runtime ? project.runtimeCssModule : unsafe ? undefined : project.cssModule;
	const exportedBinding = runtime ? (project.runtimeCssBinding ?? "runtimeCss") : "css";
	const localBinding = runtime ? "runtimeCss" : binding;
	let text = emission.text;
	let imports = [...emission.imports];
	if (cssModule !== undefined) {
		imports = imports.filter(
			(statement) =>
				!/(?:from\s+["']pandwind\/(?:css(?:\/runtime)?|unsafe\/css|preset)["'])/u.test(statement) &&
				!new RegExp(`^const\\s+${localBinding}\\s*=\\s*create(?:Runtime|Unsafe)?Css\\(`, "u").test(
					statement.trim(),
				),
		);
		const specifier = projectImportSpecifier(file, cssModule);
		imports.push(
			exportedBinding === localBinding
				? `import { ${exportedBinding} } from "${specifier}";`
				: `import { ${exportedBinding} as ${localBinding} } from "${specifier}";`,
		);
	}
	if (project.cxModule !== undefined) {
		imports = imports.filter(
			(statement) =>
				!/(?:from\s+["']pandwind\/cx["']|^const\s+(?:cx|pandwindCx)\s*=\s*createCx\(\s*\);?)/u.test(
					statement.trim(),
				),
		);
		text = text.replace(/\bpandwindCx\b/gu, "cx");
		imports.push(`import { cx } from "${projectImportSpecifier(file, project.cxModule)}";`);
	}
	return { text, imports };
}

function hasThemeContextValues(program: StyleProgram, source: string | undefined): boolean {
	if (source === undefined || !source.includes("ThemeProvider")) return false;
	return program.rules.some(
		(rule) =>
			rule.declarations.some((declaration) => {
				if (declaration.value.kind !== StyleValueKindTag.Dynamic) return false;
				const binding = declaration.value.expression.trim();
				if (/\btheme\b/.test(binding)) return true;
				if (!/^[A-Za-z_$][\w$]*$/.test(binding)) return false;
				const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				return new RegExp(
					`(?:const|let|var)\\s+${escaped}\\s*=\\s*theme(?:\\.variants)?\\s*\\(`,
				).test(source);
			}) || hasThemeContextValues({ ...program, rules: rule.children }, source),
	);
}

function sourceBindingIsStatic(expression: string, source: string | undefined): boolean {
	if (!/^[A-Za-z_$][\w$]*$/.test(expression) || source === undefined) return false;
	const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const declaration = new RegExp(`(?:const|let|var)\\s+${escaped}\\s*=\\s*([^;]+)`).exec(
		source,
	)?.[1];
	if (declaration === undefined || /[`]|=>|\bfunction\b/.test(declaration)) return false;
	const value = declaration.trim();
	return (
		/^(?:["'`]|[-+]?\d|true\b|false\b|null\b|[([{])/.test(value) ||
		/\bregisterSemanticRules\s*\(/.test(value)
	);
}

function isStaticTemplateExpression(expression: string, source?: string): boolean {
	return (
		/^(?:theme|font)\b/.test(expression) ||
		/^rem\s*\(/.test(expression) ||
		/^(?:[-+]?\d|["'`])/.test(expression) ||
		sourceBindingIsStatic(expression, source)
	);
}

function isStaticSubjectExpression(expression: string): boolean {
	return (
		/^[A-Z_$][\w$]*$/.test(expression) ||
		/^(?:\(\s*[^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*[A-Z_$][\w$]*$/.test(expression)
	);
}

function composedBaseClassName(
	subject: string,
	context: AdapterEmitContext | undefined,
): string | undefined {
	const base = componentExpressionForSubject(subject);
	const source = context?.document?.document.source;
	const file = context?.file;
	if (
		base === undefined ||
		!/^[A-Za-z_$][\w$]*$/.test(base) ||
		source === undefined ||
		file === undefined
	)
		return undefined;
	const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		`(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\s*=\\s*styled(?:\\.|\\s*\\()`,
	).test(source)
		? CodemodStyleIdentity.className(file, base)
		: undefined;
}

function isComposedBase(binding: string, context: AdapterEmitContext | undefined): boolean {
	const source = context?.document?.document.source;
	if (source === undefined) return false;
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`styled\\s*\\(\\s*${escaped}\\s*\\)`).test(source);
}

/**
 * Styled-components lowers a subject component's base rules to zero
 * specificity before a derived styled component adds its own rules. Keep
 * that cascade contract in the semantic object passed to Pandwind, including
 * dynamic declarations whose values are carried by css.vars().
 */
function lowerComposedBaseProgram(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): StyleProgram {
	if (context?.host?.binding === undefined || !isComposedBase(context.host.binding, context))
		return program;
	const rules = program.rules.map((rule) =>
		rule.kind === StyleRuleKindTag.Style ? { ...rule, selector: ":where(&)" } : rule,
	);
	return {
		...program,
		declarations: [],
		rules: [
			{
				kind: StyleRuleKindTag.Style,
				conditions: [],
				declarations: [],
				children: rules,
				order: -1,
			},
		],
	};
}

function hasUnsafeTemplateDynamic(template: string, source?: string): boolean {
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = SourcePass.matchBlock(template, index + 1);
		if (block === null) continue;
		const expression = block.body.trim();
		if (
			/=>|^function\b/.test(expression) ||
			/^(?:p|props|attrs)\b/.test(expression) ||
			(/^[A-Za-z_$][\w$]*$/.test(expression) &&
				!isStaticTemplateExpression(expression, source) &&
				!isStaticSubjectExpression(expression))
		)
			return true;
		index = block.end - 1;
	}
	return false;
}

function hasComponentSelectorInterpolation(template: string): boolean {
	const isSelectorPosition = (end: number): boolean => {
		for (let index = end; index < template.length; index++) {
			const character = template[index];
			if (character === ";" || character === "}") return false;
			if (character === "{") return true;
		}
		return false;
	};
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = SourcePass.matchBlock(template, index + 1);
		if (block === null) continue;
		if (isSelectorPosition(block.end)) return true;
		index = block.end - 1;
	}
	return false;
}

function cssBlockEnd(source: string, open: number): number | undefined {
	let depth = 1;
	for (let index = open + 1; index < source.length; index++) {
		if (source[index] === "$" && source[index + 1] === "{") {
			const interpolation = SourcePass.matchBlock(source, index + 1);
			if (interpolation !== null) {
				index = interpolation.end - 1;
				continue;
			}
		}
		if (source[index] === '"' || source[index] === "'") {
			const quote = source[index];
			index++;
			while (index < source.length && source[index] !== quote) {
				if (source[index] === "\\") index++;
				index++;
			}
			continue;
		}
		if (source[index] === "{") depth++;
		if (source[index] === "}" && --depth === 0) return index;
	}
	return undefined;
}

function augmentAncestorSelectors(template: string, rootSelector: string): string {
	const isInsideAtRule = (position: number): boolean => {
		const atRuleStack: boolean[] = [];
		let pendingAtRule = false;
		let quote: string | undefined;
		for (let index = 0; index < position; index++) {
			const character = template[index];
			if (quote !== undefined) {
				if (character === "\\") index++;
				else if (character === quote) quote = undefined;
				continue;
			}
			if (character === '"' || character === "'") {
				quote = character;
				continue;
			}
			if (character === "@") {
				pendingAtRule = true;
				continue;
			}
			if (character === "{") {
				atRuleStack.push(pendingAtRule);
				pendingAtRule = false;
				continue;
			}
			if (character === "}") {
				atRuleStack.pop();
				pendingAtRule = false;
				continue;
			}
			if (pendingAtRule && (character === ";" || character === "\n")) pendingAtRule = false;
		}
		return atRuleStack.some(Boolean);
	};
	const lifted: string[] = [];
	const selectorPattern = /((?:\$\{[^{}]+\}|[^\n{}])*&(?:\$\{[^{}]+\}|[^\n{}])*)\s*\{/g;
	for (const match of template.matchAll(selectorPattern)) {
		const selector = match[1]?.trim();
		if (selector === undefined || selector.startsWith("@") || selector.includes("@")) continue;
		if (isInsideAtRule(match.index ?? 0)) continue;
		// The selector may contain a JavaScript interpolation (`${Label}`). Use
		// the trailing brace consumed by the full match rather than searching
		// backwards, which can select the interpolation's opening brace when a
		// parser changes the match boundary.
		const open = (match.index ?? 0) + match[0].length - 1;
		const end = cssBlockEnd(template, open);
		if (end === undefined) continue;
		lifted.push(`${selector.replaceAll("&", rootSelector)}{${template.slice(open + 1, end)}}`);
	}
	return `${rootSelector}{${template}}${lifted.join("")}`;
}

function mapRuntimeProps(program: StyleProgram, parameter = "props"): StyleProgram {
	const expressionWithProps = (expression: string): string => {
		if (!expression.includes("=>") && !/\bfunction\b/.test(expression)) return expression;
		if (!expression.startsWith("`") || !expression.endsWith("`"))
			return /=>|\bfunction\b/.test(expression) ? `(${expression})(${parameter})` : expression;
		let output = "";
		let cursor = 0;
		for (let index = 0; index < expression.length; index++) {
			if (expression[index] !== "$" || expression[index + 1] !== "{") continue;
			const block = SourcePass.matchBlock(expression, index + 1);
			if (block === null) continue;
			output += expression.slice(cursor, index) + "${";
			const value = block.body.trim();
			output += /=>|\bfunction\b/.test(value) ? `(${value})(${parameter})` : value;
			output += "}";
			index = block.end - 1;
			cursor = block.end;
		}
		return output + expression.slice(cursor);
	};
	const declaration = (item: StyleProgram["declarations"][number]) => ({
		...item,
		value:
			item.value.kind === StyleValueKindTag.Dynamic && /=>|\bfunction\b/.test(item.value.expression)
				? { ...item.value, expression: expressionWithProps(item.value.expression) }
				: item.value,
	});
	const rule = (item: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...item,
		declarations: item.declarations.map(declaration),
		children: item.children.map(rule),
	});
	return {
		...program,
		declarations: program.declarations.map(declaration),
		rules: program.rules.map(rule),
	};
}

function mapThemeRuntimeValues(
	program: StyleProgram,
	source: string | undefined,
	parameter = "props",
): StyleProgram {
	const themeBindings = new Set<string>();
	if (source !== undefined) {
		for (const match of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*theme\s*\(/g))
			themeBindings.add(match[1]!);
	}
	const declaration = (item: StyleProgram["declarations"][number]) => {
		if (
			item.value.kind !== StyleValueKindTag.Dynamic ||
			!themeBindings.has(item.value.expression.trim())
		)
			return item;
		const binding = item.value.expression.trim();
		return {
			...item,
			value: {
				...item.value,
				expression: `(typeof ${binding} === "function" ? ${binding}(${parameter}) : ${binding})`,
			},
		};
	};
	const rule = (item: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...item,
		declarations: item.declarations.map(declaration),
		children: item.children.map(rule),
	});
	return {
		...program,
		declarations: program.declarations.map(declaration),
		rules: program.rules.map(rule),
	};
}

function runtimeComponent(
	program: StyleProgram,
	programObject: AdapterRenderers["programObject"],
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[]; componentExpression: true } | undefined {
	const host = context?.host;
	const subject = host?.subject ?? program.source?.subject;
	const tag = subject === undefined ? undefined : intrinsicTagForSubject(subject);
	const framework = host?.framework ?? program.source?.framework;
	const componentExpression =
		subject === undefined ? undefined : componentExpressionForSubject(subject);
	const inheritedClass =
		subject === undefined ? undefined : composedBaseClassName(subject, context);
	const componentAttrs =
		host?.subjectAttrs ??
		(subject === undefined ? undefined : componentAttrsExpressionForSubject(subject));
	const componentPropNames =
		subject === undefined ? undefined : componentPropNamesForSubject(subject);
	if (
		host?.binding === undefined ||
		(componentExpression === undefined && tag === undefined) ||
		framework === undefined
	)
		return undefined;
	const needsThemeContext = hasThemeContextValues(program, context?.document?.document.source);
	const object = programObject(mapRuntimeProps(program));
	if (framework === BuiltinHostFramework.Vue) {
		const runtimeProps = needsThemeContext
			? "const props: Record<string, any> = { ...attrs, theme: useTheme() };"
			: "const props: Record<string, any> = attrs;";
		const forwardedAttrs =
			componentPropNames === undefined || componentPropNames.length === 0
				? "attrs"
				: `Object.fromEntries(Object.entries(attrs).filter(([key]) => !${JSON.stringify(componentPropNames)}.includes(key)))`;
		return {
			text: `defineComponent({ inheritAttrs: false, setup(_props, { attrs: rawAttrs, slots }) { const attrs: Record<string, any> = rawAttrs; ${runtimeProps} const style = computed(() => runtimeCss.vars(${object})); return () => h(${JSON.stringify(tag)}, { ...${forwardedAttrs}, class: [style.value.class, attrs.class], style: [style.value.style, attrs.style] }, slots.default?.()); } })`,
			componentExpression: true,
			imports: [
				'import { computed, defineComponent, h } from "vue";',
				'import { createRuntimeCss } from "pandwind/css/runtime";',
				'import { defaultPreset } from "pandwind/preset/default";',
				"const runtimeCss = createRuntimeCss(defaultPreset);",
				...(needsThemeContext ? ['import { useTheme } from "@vue-styled-components/core";'] : []),
			],
		};
	}
	if (
		framework !== BuiltinHostFramework.Solid &&
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact
	)
		return undefined;
	const propsParameter =
		framework === BuiltinHostFramework.React
			? `props: { readonly as?: React.ElementType; readonly className?: string; readonly style?: React.CSSProperties; readonly children?: React.ReactNode; readonly [key: string]: unknown }`
			: framework === BuiltinHostFramework.Preact
				? `props: { readonly as?: JSX.ElementType; readonly className?: string; readonly style?: JSX.CSSProperties; readonly children?: JSX.Element; readonly [key: string]: unknown }`
				: `props: { readonly as?: string | ((props: Record<string, unknown>) => JSX.Element); readonly class?: string; readonly style?: JSX.CSSProperties; readonly children?: JSX.Element; readonly [key: string]: unknown }`;
	const classAttribute = framework === BuiltinHostFramework.Solid ? "class" : "className";
	const hostTypeImports =
		framework === BuiltinHostFramework.Solid ? ['import type { JSX } from "solid-js";'] : [];
	const mergedClass =
		inheritedClass === undefined
			? `runtimeCss.props(style, props.${classAttribute}).className`
			: `composedCx.vars(style, ${JSON.stringify(inheritedClass)}, props.${classAttribute}).class`;
	const composedCxBinding =
		inheritedClass === undefined ? "" : "const composedCx = createCx({ css: runtimeCss }); ";
	if (tag === undefined) {
		const propFilter =
			componentPropNames === undefined || componentPropNames.length === 0
				? ""
				: `Object.fromEntries(Object.entries(props).filter(([key]) => !${JSON.stringify(componentPropNames)}.includes(key)))`;
		const forwardedProps =
			componentAttrs === undefined
				? propFilter === ""
					? "{...props}"
					: `{...${propFilter}}`
				: /=>|\bfunction\b/.test(componentAttrs)
					? `{...(${componentAttrs})(props), ...props}`
					: `{...(${componentAttrs}), ${propFilter === "" ? "...props" : `...${propFilter}`}}`;
		return {
			text: `(${propsParameter}) => { ${composedCxBinding}const style = runtimeCss.vars(${object}); const ResolvedComponent = props.as ?? (${componentExpression}); return <ResolvedComponent ${forwardedProps} ${classAttribute}={${mergedClass}} style={{ ...props.style, ...style.style }} />; }`,
			componentExpression: true,
			imports: [
				...hostTypeImports,
				...(inheritedClass === undefined ? [] : ['import { createCx } from "pandwind/cx";']),
				'import { createRuntimeCss } from "pandwind/css/runtime";',
				'import { defaultPreset } from "pandwind/preset/default";',
				"const runtimeCss = createRuntimeCss(defaultPreset);",
			],
		};
	}
	const solidIntrinsic = framework === BuiltinHostFramework.Solid;
	const renderedComponent = solidIntrinsic
		? `<Dynamic component={ResolvedComponent} {...attrs} {...forwarded} ${classAttribute}={${mergedClass}} style={{ ...props.style, ...style.style }} />`
		: `<ResolvedComponent {...attrs} {...forwarded} ${classAttribute}={${mergedClass}} style={{ ...props.style, ...style.style }} />`;
	const forwardedFilter =
		componentPropNames === undefined || componentPropNames.length === 0
			? '!key.startsWith("$")'
			: `!key.startsWith("$") && !${JSON.stringify(componentPropNames)}.includes(key)`;
	return {
		text: `(${propsParameter}) => { ${composedCxBinding}const style = runtimeCss.vars(${object}); const ResolvedComponent = props.as ?? ${JSON.stringify(tag)}; const { as: _as, ...rest } = props; const forwarded = Object.fromEntries(Object.entries(rest).filter(([key]) => ${forwardedFilter})); const attrs = ${componentAttrs === undefined ? "{}" : /=>|\bfunction\b/.test(componentAttrs) ? `(${componentAttrs})(props)` : `(${componentAttrs})`}; return ${renderedComponent}; }`,
		componentExpression: true,
		imports: [
			...hostTypeImports,
			...(solidIntrinsic ? ['import { Dynamic } from "solid-js/web";'] : []),
			...(inheritedClass === undefined ? [] : ['import { createCx } from "pandwind/cx";']),
			'import { createRuntimeCss } from "pandwind/css/runtime";',
			'import { defaultPreset } from "pandwind/preset/default";',
			"const runtimeCss = createRuntimeCss(defaultPreset);",
		],
	};
}

/**
 * Preserve a styled component's host API without retaining a CSS runtime.
 * Static declarations are emitted through `css.class`; only the component
 * wrapper remains because consumers may import the styled binding from other
 * modules that are outside the current codemod file.
 */
function generatedBinding(source: string | undefined, base: string): string {
	const existing = source ?? "";
	let candidate = base;
	let suffix = 2;
	while (new RegExp(`\\b${candidate}\\b`, "u").test(existing)) {
		candidate = `${base}${suffix}`;
		suffix++;
	}
	return candidate;
}

const PANDWIND_SLOT_MODULE_PATH = "__pandwind/slot.tsx";
const PANDWIND_SLOT_MODULE_CONTENT = `type PandwindSlotProps = Record<string, any> & { as?: any };
type PandwindSlotOptions = {
	readonly defaultComponent: any;
	readonly style: string;
	readonly stableClass: string;
	readonly inheritedClass?: string;
	readonly classAttribute: string;
	readonly attrs: Record<string, any>;
	readonly joinClass: (...values: any[]) => string;
};

export const __pandwindSlot = ({
	defaultComponent,
	style,
	stableClass,
	inheritedClass,
	classAttribute,
	attrs,
	joinClass,
}: PandwindSlotOptions) => {
	const component = (props: PandwindSlotProps) => {
		const Component = props.as ?? defaultComponent;
		const { as: _as, ...rest } = props;
		return <Component {...attrs} {...rest} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, props[classAttribute]) }} />;
	};
	component.__pandwindClassName = stableClass;
	return component;
};
`;
const PANDWIND_SOLID_SLOT_MODULE_PATH = "__pandwind/solid-slot.tsx";
const PANDWIND_SOLID_SLOT_MODULE_CONTENT = `import { Dynamic } from "solid-js/web";

type PandwindSlotProps = Record<string, any> & { as?: any };
type PandwindSlotOptions = {
	readonly defaultComponent: any;
	readonly style: string;
	readonly stableClass: string;
	readonly inheritedClass?: string;
	readonly classAttribute: string;
	readonly attrs: Record<string, any>;
	readonly joinClass: (...values: any[]) => string;
};

export const __pandwindSlot = ({
	defaultComponent,
	style,
	stableClass,
	inheritedClass,
	classAttribute,
	attrs,
	joinClass,
}: PandwindSlotOptions) => {
	const component = (props: PandwindSlotProps) => {
		const Component = props.as ?? defaultComponent;
		const { as: _as, ...rest } = props;
		return <Dynamic component={Component} {...attrs} {...rest} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, props[classAttribute]) }} />;
	};
	component.__pandwindClassName = stableClass;
	return component;
};
`;

const PANDWIND_RECIPE_MODULE_PATH = "__pandwind/recipe.ts";
const PANDWIND_RECIPE_MODULE_CONTENT = `import type { StyleObject } from "pandwind/types/typings";

type RecipeSelection = Readonly<Record<string, string | boolean | undefined>>;
type StyleRecord = StyleObject;
type SlotStyleMap = Readonly<Record<string, StyleRecord>>;
type SlotVariantMap = Readonly<Record<string, SlotStyleMap>>;
type SlotVariants = Readonly<Record<string, SlotVariantMap>>;
type RecipeDefinition = {
  readonly base?: StyleRecord;
  readonly variants?: Readonly<Record<string, Readonly<Record<string, StyleRecord>>>>;
  readonly defaultVariants?: RecipeSelection;
  readonly compoundVariants?: readonly { readonly when: Readonly<Record<string, string | boolean>>; readonly style: StyleRecord }[];
};
type SlotRecipeDefinition = RecipeDefinition & {
  readonly slots: SlotStyleMap;
  readonly slotVariants?: SlotVariants;
};
type CssClass = { readonly class: (...styles: StyleRecord[]) => string };

const selectedValues = (definition: RecipeDefinition, selection: RecipeSelection) => {
  const values: Record<string, string | boolean> = {};
  for (const [name, variants] of Object.entries(definition.variants ?? {})) {
    const value = selection[name] ?? definition.defaultVariants?.[name];
    if (value !== undefined && variants[String(value)] !== undefined) values[name] = value;
  }
  return values;
};

const matches = (
  selection: RecipeSelection,
  conditions: Readonly<Record<string, string | boolean>>,
) => Object.entries(conditions).every(([key, value]) => selection[key] === value);

export const createRecipe = (css: CssClass, definition: RecipeDefinition) =>
  (selection: RecipeSelection = {}) => {
    const values = selectedValues(definition, selection);
	const styles: StyleRecord[] = [];
    if (definition.base !== undefined) styles.push(definition.base);
    for (const [name, value] of Object.entries(values)) {
      const style = definition.variants?.[name]?.[String(value)];
      if (style !== undefined) styles.push(style);
    }
    for (const compound of definition.compoundVariants ?? []) {
      if (matches({ ...values, ...selection }, compound.when)) styles.push(compound.style);
    }
    const generated = css.class(...styles);
    const extra = selection.className;
    return extra === undefined || extra === "" ? generated : generated + " " + extra;
  };

export const createSlotRecipe = (css: CssClass, definition: SlotRecipeDefinition) =>
  (selection: RecipeSelection = {}) => {
    const values = selectedValues(definition, selection);
    const output: Record<string, string> = {};
    for (const [slot, base] of Object.entries(definition.slots)) {
		const styles: StyleRecord[] = [base];
      for (const [name, value] of Object.entries(values)) {
        const style = definition.slotVariants?.[name]?.[String(value)]?.[slot];
        if (style !== undefined) styles.push(style);
      }
      output[slot] = css.class(...styles);
    }
    return output;
  };
`;

function sharedSlotModule(
	context: AdapterEmitContext | undefined,
	framework: BuiltinHostFramework,
): { readonly importPath: string; readonly file: AdapterGeneratedFile } | undefined {
	const root = context?.config.root;
	const file = context?.file;
	if (root === undefined || file === undefined) return undefined;
	const projectFile = isAbsoluteDocumentPath(file) ? relativeDocumentPath(root, file) : file;
	const modulePath =
		framework === BuiltinHostFramework.Solid
			? PANDWIND_SOLID_SLOT_MODULE_PATH
			: PANDWIND_SLOT_MODULE_PATH;
	const moduleContent =
		framework === BuiltinHostFramework.Solid
			? PANDWIND_SOLID_SLOT_MODULE_CONTENT
			: PANDWIND_SLOT_MODULE_CONTENT;
	let importPath = relativeDocumentPath(
		dirnameDocumentPath(projectFile),
		modulePath.replace(/\.(?:[cm]?tsx?|jsx?)$/u, ""),
	);
	if (!importPath.startsWith(".")) importPath = `./${importPath}`;
	return {
		importPath,
		file: {
			path: modulePath,
			purpose: "shared static component slot helper",
			content: moduleContent,
		},
	};
}

function sharedRecipeModule(
	context: AdapterEmitContext | undefined,
): { readonly importPath: string; readonly file: AdapterGeneratedFile } | undefined {
	const root = context?.config.root;
	const file = context?.file;
	if (file === undefined) return undefined;
	if (isAbsoluteDocumentPath(file) && root === undefined) return undefined;
	const projectFile = isAbsoluteDocumentPath(file) ? relativeDocumentPath(root!, file) : file;
	let importPath = relativeDocumentPath(
		dirnameDocumentPath(projectFile),
		PANDWIND_RECIPE_MODULE_PATH.replace(/\.(?:[cm]?tsx?|jsx?)$/u, ""),
	);
	if (!importPath.startsWith(".")) importPath = `./${importPath}`;
	return {
		importPath,
		file: {
			path: PANDWIND_RECIPE_MODULE_PATH,
			purpose: "shared recipe runtime used by migrated source",
			content: PANDWIND_RECIPE_MODULE_CONTENT,
		},
	};
}

function recipeRuntime(
	context: AdapterEmitContext | undefined,
	imported: "createRecipe" | "createSlotRecipe",
): {
	readonly binding: string;
	readonly imports: readonly string[];
	readonly generatedStatements: readonly string[];
	readonly generatedFiles?: readonly AdapterGeneratedFile[];
} {
	const binding = generatedBinding(context?.document?.document.source, `__pandwind${imported}`);
	const sharedModule = sharedRecipeModule(context);
	if (sharedModule !== undefined) {
		return {
			binding,
			imports: [`import { ${imported} as ${binding} } from "${sharedModule.importPath}";`],
			generatedStatements: [],
			generatedFiles: [sharedModule.file],
		};
	}
	const inlineContent = PANDWIND_RECIPE_MODULE_CONTENT.replaceAll(
		"export const createRecipe",
		`const ${imported === "createRecipe" ? binding : "createRecipe"}`,
	).replaceAll(
		"export const createSlotRecipe",
		`const ${imported === "createSlotRecipe" ? binding : "createSlotRecipe"}`,
	);
	return {
		binding,
		imports: [],
		generatedStatements: [inlineContent],
	};
}

function staticComponent(
	program: StyleProgram,
	programObject: AdapterRenderers["programObject"],
	context: AdapterEmitContext | undefined,
):
	| {
			text: string;
			imports: readonly string[];
			generatedStatements: readonly string[];
			generatedFiles?: readonly AdapterGeneratedFile[];
	  }
	| undefined {
	const host = context?.host;
	const subject = host?.subject ?? program.source?.subject;
	const framework = host?.framework ?? program.source?.framework;
	if (host?.binding === undefined || subject === undefined || framework === undefined)
		return undefined;
	if (
		program.rules.some(function containsDynamic(rule): boolean {
			return (
				rule.declarations.some(
					(declaration) => declaration.value.kind === StyleValueKindTag.Dynamic,
				) || rule.children.some(containsDynamic)
			);
		})
	)
		return undefined;
	if (
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact &&
		framework !== BuiltinHostFramework.Solid &&
		framework !== BuiltinHostFramework.Vue
	)
		return undefined;
	const tag = intrinsicTagForSubject(subject);
	const base = componentExpressionForSubject(subject);
	if (tag === undefined && base === undefined) return undefined;
	const classAttribute = framework === BuiltinHostFramework.Solid ? "class" : "className";
	const attrs = host.subjectAttrs ?? componentAttrsExpressionForSubject(subject);
	const componentPropNames = componentPropNamesForSubject(subject);
	if (attrs !== undefined && /=>|\bfunction\b/.test(attrs)) return undefined;
	const stableClass =
		host.stableClassName ??
		CodemodStyleIdentity.className(context?.file ?? "component", host.binding);
	const inheritedClass =
		subject === undefined ? undefined : composedBaseClassName(subject, context);
	const loweredProgram = lowerComposedBaseProgram(program, context);
	const style =
		inheritedClass === undefined
			? `css.class(${programObject(loweredProgram)})`
			: `css(${programObject(loweredProgram)})`;
	const attrsExpression = attrs === undefined ? "{}" : `(${attrs})`;
	const sourceText = context?.document?.document.source;
	const composedCxBinding =
		inheritedClass === undefined ? undefined : generatedBinding(sourceText, "composedCx");
	const sharedModule = sharedSlotModule(context, framework);
	const slotBinding = generatedBinding(sourceText, "__pandwindSlot");
	const slotHelper =
		sharedModule === undefined
			? framework === BuiltinHostFramework.Solid
				? `const ${slotBinding} = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, attrs, joinClass }) => { const component = (props) => { const Component = props.as ?? defaultComponent; const { as: _as, ...rest } = props; return <Dynamic component={Component} {...attrs} {...rest} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };`
				: `const ${slotBinding} = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, attrs, joinClass }) => { const component = (props) => { const Component = props.as ?? defaultComponent; const { as: _as, ...rest } = props; return <Component {...attrs} {...rest} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, props[classAttribute]) }} />; }; component.__pandwindClassName = stableClass; return component; };`
			: undefined;
	const slotImport =
		sharedModule === undefined
			? []
			: [
					`import { __pandwindSlot${slotBinding === "__pandwindSlot" ? "" : ` as ${slotBinding}`} } from "${sharedModule.importPath}";`,
				];
	if (framework === BuiltinHostFramework.Vue) {
		const tagExpression = tag === undefined ? `(${base})` : JSON.stringify(tag);
		const forwardedAttrs =
			componentPropNames === undefined || componentPropNames.length === 0
				? "attrs"
				: `Object.fromEntries(Object.entries(attrs).filter(([key]) => !${JSON.stringify(componentPropNames)}.includes(key)))`;
		return {
			text: `defineComponent({ inheritAttrs: false, setup(_props, { attrs: rawAttrs, slots }) { const attrs: Record<string, any> = rawAttrs; const style = ${style}; return () => h(${tagExpression}, { ...${forwardedAttrs}, class: cx(style, attrs.class) }, slots.default?.()); } })`,
			imports: [
				'import { defineComponent, h } from "vue";',
				'import { createUnsafeCss } from "pandwind/unsafe/css";',
				'import { createCx } from "pandwind/cx";',
				"const css = createUnsafeCss();",
				"const cx = createCx();",
			],
			generatedStatements: [],
		};
	}
	const joinClass = composedCxBinding ?? "cx";
	const defaultComponent = tag === undefined ? `(${base})` : JSON.stringify(tag);
	const inheritedClassExpression =
		inheritedClass === undefined ? "undefined" : JSON.stringify(inheritedClass);
	return {
		text: `${slotBinding}({ defaultComponent: ${defaultComponent}, style: ${style}, stableClass: ${JSON.stringify(stableClass)}, inheritedClass: ${inheritedClassExpression}, classAttribute: ${JSON.stringify(classAttribute)}, attrs: ${attrsExpression}, joinClass: ${joinClass} })`,
		imports: [
			...(sharedModule === undefined && framework === BuiltinHostFramework.Solid
				? ['import { Dynamic } from "solid-js/web";']
				: []),
			'import { createUnsafeCss } from "pandwind/unsafe/css";',
			"const css = createUnsafeCss();",
			'import { createCx } from "pandwind/cx";',
			"const cx = createCx();",
			...slotImport,
		],
		generatedStatements: [
			...(slotHelper === undefined ? [] : [slotHelper]),
			...(composedCxBinding === undefined
				? []
				: [`const ${composedCxBinding} = createCx({ css });`]),
		],
		...(sharedModule === undefined ? {} : { generatedFiles: [sharedModule.file] }),
	};
}

function selectProgramDeclarations(
	program: StyleProgram,
	select: (value: StyleProgram["declarations"][number]["value"]) => boolean,
): StyleProgram {
	const selectRule = (
		rule: StyleProgram["rules"][number],
	): StyleProgram["rules"][number] | undefined => {
		const declarations = rule.declarations.filter((declaration) => select(declaration.value));
		const children = rule.children.flatMap((child) => {
			const selected = selectRule(child);
			return selected === undefined ? [] : [selected];
		});
		return declarations.length === 0 && children.length === 0
			? undefined
			: { ...rule, declarations, children };
	};
	return {
		...program,
		declarations: program.declarations.filter((declaration) => select(declaration.value)),
		rules: program.rules.flatMap((rule) => {
			const selected = selectRule(rule);
			return selected === undefined ? [] : [selected];
		}),
		residuals: [],
	};
}

/**
 * Lower a dynamic styled rule to static atoms plus inline custom properties.
 * This is still a runtime value path, but it does not create or inject CSS at
 * runtime; only values that genuinely depend on props/theme stay dynamic.
 */
function hybridComponent(
	program: StyleProgram,
	programObject: AdapterRenderers["programObject"],
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[] } | undefined {
	const host = context?.host;
	const subject = host?.subject ?? program.source?.subject;
	const framework = host?.framework ?? program.source?.framework;
	const template = program.source?.template;
	if (
		host?.binding === undefined ||
		subject === undefined ||
		framework === undefined ||
		program.residuals.some((residual) => residual.kind === StyleProgramResidualKindTag.Parse) ||
		(template !== undefined && hasComponentSelectorInterpolation(template)) ||
		/\bLiveEditor\b/.test(subject)
	)
		return undefined;
	if (
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact &&
		framework !== BuiltinHostFramework.Solid
	)
		return undefined;
	const tag = intrinsicTagForSubject(subject);
	const base = componentExpressionForSubject(subject);
	if (tag === undefined && base === undefined) return undefined;
	const hasDynamic = program.rules.some(function containsDynamic(rule): boolean {
		return (
			rule.declarations.some(
				(declaration) => declaration.value.kind === StyleValueKindTag.Dynamic,
			) || rule.children.some(containsDynamic)
		);
	});
	if (!hasDynamic) return undefined;
	const staticProgram = lowerComposedBaseProgram(
		selectProgramDeclarations(program, (value) => value.kind !== StyleValueKindTag.Dynamic),
		context,
	);
	const dynamicProgram = lowerComposedBaseProgram(
		selectProgramDeclarations(program, (value) => value.kind === StyleValueKindTag.Dynamic),
		context,
	);
	const source = context?.document?.document.source;
	const needsThemeContext = hasThemeContextValues(program, source);
	const dynamicObject = programObject(
		mapThemeRuntimeValues(mapRuntimeProps(dynamicProgram, "props"), source, "props"),
	);
	const classAttribute = framework === BuiltinHostFramework.Solid ? "class" : "className";
	const attrs = host.subjectAttrs ?? componentAttrsExpressionForSubject(subject);
	if (attrs !== undefined && /=>|\bfunction\b/.test(attrs)) return undefined;
	const attrsExpression = attrs === undefined ? "{}" : `(${attrs})`;
	const themeContextAssignment = needsThemeContext
		? "props = { ...props, theme: props.theme ?? usePandwindTheme() };"
		: "";
	const inheritedClass =
		subject === undefined ? undefined : composedBaseClassName(subject, context);
	const stableClass =
		host.stableClassName ??
		CodemodStyleIdentity.className(context?.file ?? "component", host.binding);
	const staticClass =
		staticProgram.rules.length === 0
			? '""'
			: inheritedClass === undefined
				? `css.class(${programObject(staticProgram)})`
				: `css(${programObject(staticProgram)})`;
	const mergedClass =
		inheritedClass === undefined
			? `css.props(staticClass, dynamic, ${JSON.stringify(stableClass)}, props.${classAttribute}).className`
			: `composedCx.vars(staticClass, dynamic, ${JSON.stringify(inheritedClass)}, ${JSON.stringify(stableClass)}, props.${classAttribute}).class`;
	const composedCxBinding =
		inheritedClass === undefined ? "" : "const composedCx = createCx({ css }); ";
	return {
		text: `(() => { ${composedCxBinding}const staticClass = ${staticClass}; const component = (props) => { ${themeContextAssignment} const dynamic = css.vars(${dynamicObject}); const Component = props.as ?? ${tag === undefined ? `(${base})` : JSON.stringify(tag)}; const { as: _as, ...rest } = props; const attrs = ${attrsExpression}; return <Component {...attrs} {...rest} ${classAttribute}={${mergedClass}} style={{ ...props.style, ...dynamic.style }} />; }; component.__pandwindClassName = ${JSON.stringify(stableClass)}; return component; })()`,
		imports: [
			'import { createUnsafeCss } from "pandwind/unsafe/css";',
			"const css = createUnsafeCss();",
			...(inheritedClass === undefined ? [] : ['import { createCx } from "pandwind/cx";']),
			...(needsThemeContext ? ['import { usePandwindTheme } from "pandwind/theme";'] : []),
		],
	};
}

function runtimeKeyframes(program: StyleProgram, context: AdapterEmitContext | undefined): string {
	const rule = program.rules[0]!;
	const name = `pw-kf-${(context?.host?.binding ?? rule.name ?? "animation").replace(
		/[^A-Za-z0-9_-]/g,
		"-",
	)}`;
	const children = rule.children.map(
		(child) =>
			`{ kind: "style", selector: ${JSON.stringify(child.selector ?? "from")}, declarations: [${child.declarations
				.map(
					(declaration) =>
						`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
				)
				.join(", ")}] }`,
	);
	return `(() => { const name = ${JSON.stringify(name)}; runtimeCss.sheet.registerSemanticRules([{ kind: "keyframes", name, children: [${children.join(", ")}] }]); return name; })()`;
}

function jssNamedClassMap(
	program: StyleProgram,
	renderProgramObject: (program: StyleProgram) => string,
): string | undefined {
	if (program.source?.adapter !== CodemodAdapterId.Jss) return undefined;
	const names = new Set<string>();
	for (const rule of program.rules) {
		if (rule.name !== undefined) names.add(rule.name);
		for (const condition of rule.conditions) {
			if (condition.kind === SemanticConditionKindTag.Named) names.add(condition.name);
		}
		for (const declaration of rule.declarations) {
			for (const condition of declaration.conditions) {
				if (condition.kind === SemanticConditionKindTag.Named) names.add(condition.name);
			}
		}
	}
	if (names.size === 0) return undefined;
	const entries = [...names].map((name) => {
		const rules: StyleRule[] = program.rules.flatMap((rule): StyleRule[] => {
			if (rule.name === name) {
				const { name: _name, ...unnamedRule } = rule;
				return [unnamedRule];
			}
			const ruleConditionMatch = rule.conditions.some(
				(condition) => condition.kind === SemanticConditionKindTag.Named && condition.name === name,
			);
			const declarations = rule.declarations
				.filter(
					(declaration) =>
						ruleConditionMatch ||
						declaration.conditions.some(
							(condition) =>
								condition.kind === SemanticConditionKindTag.Named && condition.name === name,
						),
				)
				.map((declaration) => ({
					...declaration,
					conditions: declaration.conditions.filter(
						(condition) => condition.kind !== SemanticConditionKindTag.Named,
					),
				}));
			if (declarations.length === 0) return [];
			const selectedRule: StyleRule = {
				...rule,
				conditions: rule.conditions.filter(
					(condition) => condition.kind !== SemanticConditionKindTag.Named,
				),
				declarations,
			};
			return [selectedRule];
		});
		const single = {
			...program,
			rules,
			declarations: rules.flatMap((rule) => rule.declarations),
		};
		return `${JSON.stringify(name)}: css.class(${renderProgramObject(single)})`;
	});
	return `{ ${entries.join(", ")} }`;
}

function runtimeGlobalRule(rule: StyleProgram["rules"][number], root: boolean): string {
	const kind = root && rule.kind === StyleRuleKindTag.Style ? StyleRuleKindTag.Global : rule.kind;
	const conditions = rule.conditions.map(
		(condition) => condition.raw ?? condition.value ?? condition.name,
	);
	return `{ kind: ${JSON.stringify(kind)}, selector: ${JSON.stringify(rule.selector)}, conditions: ${JSON.stringify(conditions)}, declarations: [${rule.declarations
		.map(
			(declaration) =>
				`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
		)
		.join(", ")}], children: [${rule.children
		.map((child) => runtimeGlobalRule(child, false))
		.join(", ")}] }`;
}

function runtimeGlobalRules(program: StyleProgram): string {
	const rules: StyleProgram["rules"][number][] = [];
	for (const rule of program.rules) {
		if (rule.declarations.length === 0) rules.push(...rule.children);
		else rules.push(rule);
	}
	return rules.map((rule) => runtimeGlobalRule(rule, true)).join(", ");
}

function runtimeGlobalTemplate(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): string | undefined {
	const template = program.source?.template;
	if (template === undefined) return undefined;
	const binding = context?.host?.binding ?? String(program.source?.start ?? "template");
	const file = context?.file ?? "template";
	const id = `pw-global-${CodemodStyleIdentity.className(file, binding)}`;
	return `(runtimeCss.sheet.register([{ id: ${JSON.stringify(id)}, css: ${runtimeTemplateExpression(template, file)}, priority: 0 }]), null)`;
}

function runtimeTemplateExpression(template: string, file?: string, parameter = "props"): string {
	const pieces: string[] = [];
	let cursor = 0;
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = SourcePass.matchBlock(template, index + 1);
		if (block === null) continue;
		const staticPart = template.slice(cursor, index);
		if (staticPart !== "") pieces.push(JSON.stringify(staticPart));
		const expression = block.body.trim().replace(/\bcss(?:\s*<[^`]*>)?\s*`/g, "`");
		const subject =
			/^(?:\(\s*[^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*([A-Z_$][\w$]*)$/.exec(expression)?.[1] ??
			(/^[A-Z_$][\w$]*$/.test(expression) ? expression : undefined);
		if (subject !== undefined) {
			const fallback =
				file === undefined
					? `.pw-sc-${subject}`
					: `.${CodemodStyleIdentity.className(file, subject)}`;
			pieces.push(
				`(typeof ${subject} !== "undefined" && typeof ${subject}.__pandwindClassName === "string" ? "." + ${subject}.__pandwindClassName : ${JSON.stringify(fallback)})`,
			);
		} else if (/=>|^function\b/.test(expression)) {
			// styled-components omits nullish interpolations. Keeping that
			// invariant matters for SSR parity: String(undefined) would emit an
			// invalid declaration and is observably different from the source.
			const argument = parameter === "undefined" ? "" : parameter;
			pieces.push(`String(((${expression})(${argument})) ?? "")`);
		} else {
			const value = `((${expression}) as unknown)`;
			const argument = parameter === "undefined" ? "" : parameter;
			pieces.push(
				`String((typeof ${value} === "function" ? (${value} as (...args: readonly unknown[]) => unknown)(${argument}) : ${value}) ?? "")`,
			);
		}
		index = block.end - 1;
		cursor = block.end;
	}
	if (cursor < template.length) pieces.push(JSON.stringify(template.slice(cursor)));
	if (pieces.length === 0) return JSON.stringify(template);
	return pieces.join(" + ");
}

function runtimeHostTemplateExpression(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[] } | undefined {
	const host = program.source;
	const template = host?.template;
	if (
		host?.hostOpenTag === undefined ||
		host.hostStyleAttributes === undefined ||
		template === undefined
	)
		return undefined;
	const framework =
		host.framework ??
		context?.document?.framework ??
		(/\.(?:jsx|tsx|mdx)$/.test(context?.file ?? "") ? "react" : undefined);
	const stableClass = CodemodStyleIdentity.className(
		context?.file ?? "host",
		`template-${host.start ?? "0"}`,
	);
	const cssText = `".${stableClass}{" + ${runtimeTemplateExpression(template, context?.file, "undefined")} + "}"`;
	const classExpression = `(() => { const __compiledCss = ${cssText}; runtimeCss.sheet.register([{ id: ${JSON.stringify(stableClass)} + ":" + __compiledCss, css: __compiledCss, priority: 0 }]); return ${JSON.stringify(stableClass)}; })()`;
	const rendered = JsxStyleHost.render(
		host.hostOpenTag,
		host.hostStyleAttributes,
		classExpression,
		framework,
		undefined,
		host.hostTag,
	);
	return {
		text: rendered.text,
		imports: [
			'import { createRuntimeCss } from "pandwind/css/runtime";',
			'import { defaultPreset } from "pandwind/preset/default";',
			"const runtimeCss = createRuntimeCss(defaultPreset);",
			...(rendered.needsCx
				? ['import { createCx } from "pandwind/cx";', "const cx = createCx();"]
				: []),
		],
	};
}

function runtimeStaticTemplateExpression(template: string, file?: string, source?: string): string {
	const pieces: string[] = [];
	let cursor = 0;
	for (let index = 0; index < template.length; index++) {
		if (template[index] !== "$" || template[index + 1] !== "{") continue;
		const block = SourcePass.matchBlock(template, index + 1);
		if (block === null) continue;
		const staticPart = template.slice(cursor, index);
		if (staticPart !== "") pieces.push(JSON.stringify(staticPart));
		const expression = block.body.trim();
		const subject =
			/^(?:\(\s*[^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*([A-Z_$][\w$]*)$/.exec(expression)?.[1] ??
			(/^[A-Z_$][\w$]*$/.test(expression) ? expression : undefined);
		const fallback =
			subject === undefined
				? undefined
				: `.${CodemodStyleIdentity.className(file ?? "component", subject)}`;
		pieces.push(
			subject !== undefined
				? JSON.stringify(fallback)
				: isStaticTemplateExpression(expression, source)
					? `String(((${expression})) ?? "")`
					: JSON.stringify(""),
		);
		index = block.end - 1;
		cursor = block.end;
	}
	if (cursor < template.length) pieces.push(JSON.stringify(template.slice(cursor)));
	return pieces.length === 0 ? JSON.stringify(template) : pieces.join(" + ");
}

function runtimeRawComponent(
	program: StyleProgram,
	context: AdapterEmitContext | undefined,
): { text: string; imports: readonly string[] } | undefined {
	const host = context?.host;
	const subject = host?.subject ?? program.source?.subject;
	const tag = subject === undefined ? undefined : intrinsicTagForSubject(subject);
	const base = subject === undefined ? undefined : componentExpressionForSubject(subject);
	const framework = host?.framework ?? program.source?.framework;
	const template = program.source?.template;
	if (
		host?.binding === undefined ||
		(tag === undefined && base === undefined) ||
		framework === undefined ||
		template === undefined
	)
		return undefined;
	if (
		framework !== BuiltinHostFramework.React &&
		framework !== BuiltinHostFramework.Preact &&
		framework !== BuiltinHostFramework.Solid
	)
		return undefined;
	const stableClass =
		host.stableClassName ??
		CodemodStyleIdentity.className(context?.file ?? "component", host.binding);
	const liveEditorHost = /\bLiveEditor\b/.test(host.subject ?? subject ?? "");
	const hostTemplate = liveEditorHost
		? template.replace(/\$\{\s*editorMixin\s*\}/g, "${__pandwindSanitizeHostStyles(editorMixin)}")
		: template;
	const source = context?.document?.document.source;
	// styled-components intentionally gives rules added by a composed base
	// component zero specificity. This lets host element policies (for example
	// `thead th`) remain authoritative while the composed rule still contributes
	// its declarations. The derived component keeps normal specificity.
	const componentBinding = host.binding;
	const baseBinding = componentBinding;
	const composedBase =
		componentBinding !== undefined &&
		source !== undefined &&
		new RegExp(
			`(?:export\\s+)?(?:const|let|var)\\s+${componentBinding}\\s*=\\s*styled\\s*[.(]`,
		).test(source) &&
		new RegExp(
			`styled\\s*\\(\\s*${baseBinding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\)`,
		).test(source);
	const rootSelector = composedBase ? `:where(.${stableClass})` : `.${stableClass}`;
	const normalizedTemplate = augmentAncestorSelectors(hostTemplate, rootSelector);
	const cssText = runtimeTemplateExpression(normalizedTemplate, context?.file);
	const staticCssText = runtimeStaticTemplateExpression(normalizedTemplate, context?.file, source);
	const classAttribute = framework === BuiltinHostFramework.Solid ? "class" : "className";
	const componentAttrs =
		host?.subjectAttrs ??
		(subject === undefined ? undefined : componentAttrsExpressionForSubject(subject));
	const attrsExpression =
		componentAttrs === undefined
			? "{}"
			: /=>|\bfunction\b/.test(componentAttrs)
				? `(${componentAttrs})(props)`
				: `(${componentAttrs})`;
	if (tag === undefined && base === undefined) return undefined;
	const defaultComponent = tag === undefined ? `(${base})` : JSON.stringify(tag);
	const priority = tag === undefined && base !== undefined ? 2 : 0;
	const dynamic =
		StyleProgramAnalysis.hasFunctionDynamic(program) ||
		hasUnsafeTemplateDynamic(template, source) ||
		hasComponentSelectorInterpolation(template) ||
		liveEditorHost;
	const needsThemeContext = hasThemeContextValues(program, source);
	const dynamicRegistration = `const style = ${cssText}; const className = __pandwindVariantClass(${JSON.stringify(stableClass)}, style); runtimeCss.sheet.register([{ id: className, css: style.replaceAll(${JSON.stringify(`.${stableClass}`)}, "." + className), priority: ${priority} }]);`;
	const registration = dynamic
		? dynamicRegistration
		: `runtimeCss.sheet.register([{ id: ${JSON.stringify(stableClass)}, css: ${cssText}, priority: ${priority} }]);`;
	const staticRegistration = dynamic
		? `runtimeCss.sheet.register([{ id: ${JSON.stringify(stableClass)}, css: ${staticCssText}, priority: ${priority} }]);`
		: "";
	const inheritedClass =
		subject === undefined ? undefined : composedBaseClassName(subject, context);
	const classExpression = dynamic
		? inheritedClass === undefined
			? `runtimeCss.props(className, ${JSON.stringify(stableClass)}, props.${classAttribute}).className`
			: `composedCx(className, ${JSON.stringify(stableClass)}, ${JSON.stringify(inheritedClass)}, props.${classAttribute})`
		: inheritedClass === undefined
			? `runtimeCss.props(${JSON.stringify(stableClass)}, props.${classAttribute}).className`
			: `composedCx(${JSON.stringify(stableClass)}, ${JSON.stringify(inheritedClass)}, props.${classAttribute})`;
	const composedCxBinding =
		inheritedClass === undefined ? "" : "const composedCx = createCx({ css: runtimeCss }); ";
	const solidIntrinsic = framework === BuiltinHostFramework.Solid && tag !== undefined;
	const renderedElement = solidIntrinsic
		? `<Dynamic component={Component} {...attrs} {...rest} ${classAttribute}={${classExpression}} />`
		: `<Component {...attrs} {...rest} ${classAttribute}={${classExpression}} />`;
	const render = `const Component = props.as ?? ${defaultComponent}; const { as: _as, ...rest } = props; const attrs = ${attrsExpression}; const element = ${renderedElement}; return element;`;
	const themeContextAssignment = needsThemeContext
		? "props = { ...props, theme: props.theme ?? usePandwindTheme() };"
		: "";
	const componentFactory = `const component = (props) => { ${themeContextAssignment} ${dynamic ? registration : ""} ${render} }; component.__pandwindClassName = ${JSON.stringify(stableClass)}; return component;`;
	const hostStyleSanitizer = liveEditorHost
		? `const __pandwindSanitizeHostStyles = (value) => { let css = String(value); for (let pass = 0; pass < 8; pass++) css = css.replace(/(?:^|\\n)\\s*[^{}\\n]+\\{[^{}]*\\}/g, ""); return css.replace(/(?:border|border-radius|box-shadow|cursor|min-height|overflow-x|overflow-y|position|white-space):[^;]+;/g, "").replace(/(?:&\\s*)?pre\\s*,\\s*(?:&\\s*)?textarea\\s*\\{[\\s\\S]*?\\}/g, "").replace(/textarea::selection\\s*\\{[\\s\\S]*?\\}/g, "").replace(/(?:^|[\\n}])\\s*\\.token-line\\s*\\{[\\s\\S]*?\\}/g, ""); };`
		: "";
	const variantHelper = dynamic
		? `const __pandwindVariantClass = (base, value) => { let hash = 2166136261; for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return base + "-" + (hash >>> 0).toString(36); };`
		: "";
	return {
		// Static component rules must exist before a framework's SSR insertion
		// hook flushes. Dynamic rules stay in the render closure because their
		// values are a function of the current props.
		text: dynamic
			? `(() => { ${composedCxBinding}${hostStyleSanitizer} ${variantHelper} ${staticRegistration} ${componentFactory} })()`
			: `(() => { ${composedCxBinding}${hostStyleSanitizer} ${registration} ${componentFactory} })()`,
		imports: [
			...(solidIntrinsic ? ['import { Dynamic } from "solid-js/web";'] : []),
			...(inheritedClass === undefined ? [] : ['import { createCx } from "pandwind/cx";']),
			'import { createRuntimeCss } from "pandwind/css/runtime";',
			'import { defaultPreset } from "pandwind/preset/default";',
			"const runtimeCss = createRuntimeCss(defaultPreset);",
			...(needsThemeContext ? ['import { usePandwindTheme } from "pandwind/theme";'] : []),
		],
	};
}

function runtimeFontFaces(program: StyleProgram): string {
	const rules = StyleProgramAnalysis.rules(program);
	return rules
		.filter((rule) => rule.kind === StyleRuleKindTag.FontFace)
		.map(
			(rule) =>
				`{ kind: "font-face", declarations: [${rule.declarations
					.map(
						(declaration) =>
							`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
					)
					.join(", ")} ] }`,
		)
		.join(", ");
}

function runtimeGlobalVars(program: StyleProgram): string {
	const declarations = program.rules
		.flatMap((rule) => rule.declarations)
		.map(
			(declaration) =>
				`{ property: ${JSON.stringify(declaration.property)}, value: ${runtimeValue(declaration.value)} }`,
		)
		.join(", ");
	const variableDeclarations =
		program.declarations.length > 0
			? program.declarations.map((declaration) => ({
					name: declaration.property,
					property: declaration.property.startsWith("--")
						? declaration.property
						: `--${declaration.property}`,
				}))
			: program.rules.flatMap((rule) =>
					rule.kind === StyleRuleKindTag.Global
						? rule.declarations
								.filter((declaration) => declaration.property.startsWith("--"))
								.map((declaration) => ({
									name: declaration.property.slice(2),
									property: declaration.property,
								}))
						: [],
				);
	const references = variableDeclarations
		.map(({ name, property }) => `${JSON.stringify(name)}: ${JSON.stringify(`var(${property})`)}`)
		.join(", ");
	return `(runtimeCss.sheet.registerSemanticRules([{ kind: "global", selector: ":root", declarations: [${declarations}] }]), { ${references} })`;
}

const pandwindRecipeDeclarationsObject = (
	declarationsObject: AdapterRenderers["declarationsObject"],
	declarations: readonly StyleProgram["declarations"][number][],
): string =>
	declarationsObject(
		declarations.map((declaration) => ({
			...declaration,
			conditions: declaration.conditions.map((condition) => {
				if (condition.kind !== SemanticConditionKindTag.Selector) return condition;
				const selector = condition.value ?? condition.name;
				const name = pandwindConditionNameForSelector(selector);
				return name === undefined
					? condition
					: { ...condition, name, value: condition.value ?? selector };
			}),
		})),
	);

function slotRecipeDefinitionObject(
	program: StyleProgram,
	declarationsObject: AdapterRenderers["declarationsObject"],
): string {
	const slots = new Map<string, StyleProgram["declarations"]>();
	const variants = new Map<string, Map<string, Map<string, StyleProgram["declarations"]>>>();
	for (const rule of program.rules) {
		if (rule.kind !== StyleRuleKindTag.Style || rule.name === undefined) continue;
		const base = slots.get(rule.name) ?? [];
		const unconditional = rule.declarations.filter(
			(declaration) => declaration.conditions.length === 0,
		);
		if (unconditional.length > 0) slots.set(rule.name, [...base, ...unconditional]);
		for (const declaration of rule.declarations) {
			const [variant, value] = declaration.conditions;
			if (
				variant?.kind !== SemanticConditionKindTag.Named ||
				value?.kind !== SemanticConditionKindTag.Named
			)
				continue;
			const values = variants.get(variant.name) ?? new Map();
			const slotValues = values.get(value.name) ?? new Map();
			const declarations = slotValues.get(rule.name) ?? [];
			slotValues.set(rule.name, [...declarations, { ...declaration, conditions: [] }]);
			values.set(value.name, slotValues);
			variants.set(variant.name, values);
		}
	}
	const slotNames = program.compositions?.find(
		(composition) => composition.kind === StyleProgramCompositionKind.Slot,
	)?.slots ?? [...slots.keys()];
	const slotsText = slotNames
		.map((name) => `${JSON.stringify(name)}: ${declarationsObject(slots.get(name) ?? [])}`)
		.join(", ");
	const variantsText = [...variants]
		.map(
			([name, values]) =>
				`${JSON.stringify(name)}: { ${[...values]
					.map(
						([value, slotValues]) =>
							`${JSON.stringify(value)}: { ${[...slotValues]
								.map(
									([slot, declarations]) =>
										`${JSON.stringify(slot)}: ${declarationsObject(declarations)}`,
								)
								.join(", ")} }`,
					)
					.join(", ")} }`,
		)
		.join(", ");
	return `{ slots: { ${slotsText} }, slotVariants: { ${variantsText} } }`;
}

function pandwindRecipeReferences(
	context: AdapterParseContext,
	imported: "createRecipe" | "createSlotRecipe",
): readonly string[] {
	const isRecipeModule = (moduleSpecifier: string): boolean =>
		moduleSpecifier === "pandwind/recipe" ||
		/(?:^|[\\/])__pandwind[\\/]recipe(?:\.ts)?$/u.test(moduleSpecifier);
	const bindings = context.bindings?.bindings.filter((binding) => isRecipeModule(binding.source));
	if (bindings !== undefined) {
		return bindings
			.filter((binding) => binding.importedName === imported)
			.map((binding) =>
				binding.kind === SourceBindingKind.Namespace
					? `${binding.localName}.${imported}`
					: binding.localName,
			)
			.filter((reference, index, all) => all.indexOf(reference) === index);
	}
	const references = new Set<string>();
	const moduleSource = "(?:pandwind/recipe|[^\"']*__pandwind[\\\\/]recipe(?:\\.ts)?)";
	const namedImport = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${moduleSource}["']`, "g");
	for (const match of context.source.matchAll(namedImport)) {
		for (const specifier of (match[1] ?? "").split(",")) {
			const parts = specifier.trim().split(/\s+as\s+/u);
			if (parts[0] === imported) references.add(parts[1] ?? parts[0]);
		}
	}
	const namespaceImport = new RegExp(
		`import\\s*\\*\\s*as\\s+([A-Za-z_$][\\w$]*)\\s*from\\s*["']${moduleSource}["']`,
		"g",
	);
	for (const match of context.source.matchAll(namespaceImport)) {
		if (match[1] !== undefined) references.add(`${match[1]}.${imported}`);
	}
	return [...references];
}

function pandwindRecipeMatches(
	source: string,
	context: AdapterParseContext,
	imported: "createRecipe" | "createSlotRecipe",
	pattern: CodemodPatternId,
): AdapterParseResult {
	const references = pandwindRecipeReferences(context, imported);
	if (references.length === 0) return { matches: [], residuals: [] };
	const escaped = references.map((reference) => reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const callPattern = new RegExp(
		`\\b(?:${escaped.join("|")})\\s*\\(\\s*[A-Za-z_$][\\w$]*\\s*,\\s*\\{`,
		"gu",
	);
	const matches: Array<AdapterParseResult["matches"][number]> = [];
	const residuals: Array<AdapterParseResult["residuals"][number]> = [];
	const isExcluded = context.document?.isExcluded ?? (() => false);
	for (const match of source.matchAll(callPattern)) {
		const start = match.index ?? 0;
		if (isExcluded(start)) continue;
		const reference = match[0].match(
			/(?:^|\s)([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/u,
		)?.[1];
		const localName = reference?.split(".")[0];
		if (localName !== undefined && context.bindings?.isShadowedAt(localName, start) === true)
			continue;
		const objectOpen = start + match[0].lastIndexOf("{");
		const object = SourcePass.matchBlock(source, objectOpen);
		if (object === null) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: source.slice(start),
				hint: `${imported} recipe object is unbalanced`,
			});
			continue;
		}
		const closing = /^\s*\)/u.exec(source.slice(object.end));
		if (closing === null) {
			residuals.push({
				kind: StyleProgramResidualKindTag.Parse,
				text: source.slice(start, object.end),
				hint: `${imported} recipe call is unbalanced`,
			});
			continue;
		}
		const end = object.end + closing[0].length;
		const sourceOptions = {
			source: {
				file: context.file,
				start,
				end,
				adapter: CodemodAdapterId.Pandwind,
				pattern,
				...(context.document?.framework ? { framework: context.document.framework } : {}),
				...context.semantic?.source,
			},
			sourceOffset: objectOpen + 1,
			...(context.semantic?.themes ? { themes: context.semantic.themes } : {}),
			...(context.semantic?.compositions ? { compositions: context.semantic.compositions } : {}),
			...(context.semantic?.runtime ? { runtime: context.semantic.runtime } : {}),
			...(context.semantic?.plugins ? { plugins: context.semantic.plugins } : {}),
			...(imported === "createRecipe"
				? recipeSourceObjectOptions()
				: pandwindSlotRecipeSourceObjectOptions()),
		};
		let program = styleProgramFromSourceObject(object.body, sourceOptions);
		program =
			imported === "createRecipe"
				? preserveUnsupportedRecipeFields(program)
				: captureSlotRecipeSlots(preserveUnsupportedSlotRecipeFields(program), source);
		matches.push({ start, end, program, sourceText: source.slice(start, end) });
	}
	return { matches, residuals };
}

export interface PandwindAdapterOptions {
	readonly moduleLoader?: ProjectModuleLoader | null;
	readonly conditionCatalog?: AdapterConditionCatalog;
}

export function createPandwindAdapter(options: PandwindAdapterOptions = {}) {
	const moduleLoader = options.moduleLoader === null ? undefined : options.moduleLoader;
	const configuredConditionCatalog = options.conditionCatalog;
	const adapter = defineCodemodAdapter({
		id: CodemodAdapterId.Pandwind,
		officialApi: {
			pluginSystems: ["presets", "bridge", "splitByRoute"],
			compilerIntegrations: ["pandwind/vite", "pandwind/unplugin"],
			ssrHooks: ["createRuntimeCss", "renderToString"],
		},
		patterns: [
			{ name: "css", regex: /\bcss\.class\s*\(\s*\{/g },
			{ name: "css-vars", regex: /\bcss\.vars\s*\(\s*\{/g },
			{
				name: CodemodPatternId.PandwindCssGroup,
				regex: /\bcss\.group\s*\(\s*\{/g,
				sourceObjectOptions: (_source, context) =>
					context.targetId === CodemodAdapterId.StyleX
						? { namedRuleObjects: true }
						: { nestedObjectKind: "named" },
			},
		],
		packages: CodemodAdapterKit.dependency("pandwind", "runtime"),
		capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Pandwind, "exact", {
			"named-conditions": "exact",
			"named-rules": "exact",
			"function-values": "exact",
			"theme-context": "exact",
			"framework-semantics": "exact",
			composition: "exact",
			recipes: "exact",
			components: "exact",
		}),
		namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
		preserveNamedRules: (context) =>
			context.sourceModules?.includes("style9") === true ||
			context.sourceModules?.includes("styled-system/css") === true,
		detectPatterns: [
			/\bcss\.class\s*\(/,
			/\bcreateCss\s*\(/,
			/\bcreateUnsafeCss\s*\(/,
			/\bcreateRuntimeCss\s*\(/,
			/\b(?:createRecipe|createSlotRecipe)\s*\(/,
			/\b[A-Za-z_$][\w$]*\.sheet\.registerSemanticRules\s*\(/,
		],
		sourceModules: [
			"pandwind/css",
			"pandwind/unsafe/css",
			"pandwind/css/runtime",
			"pandwind/recipe",
		],
		sourceModuleMatchers: [
			(moduleSpecifier) => /(?:^|[\\/])__pandwind[\\/]recipe(?:\.ts)?$/u.test(moduleSpecifier),
		],
		configFiles: ["pandwind.config.ts", "pandwind.interop.json", "bridge.ts", "package.json"],
		loadConfig: (context) => pandwindConfig(context, configuredConditionCatalog),
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) =>
						officialPandwindConfig(context, moduleLoader, configuredConditionCatalog),
				}),
		tokenPolicy: PANDWIND_TOKEN_POLICY,
		sourceObjectOptions: (_source, context) => ({
			...pandwindConditionOptions(context.config.conditionCatalog),
			valueTransforms: {
				"*": (value, property) => pandwindSourceValue(value, property ?? "", context),
			},
		}),
		migration: {
			targetPolicy: PANDWIND_TARGET_POLICY,
			rewrite: ({ code, targetId, complete }) => {
				if (targetId === CodemodAdapterId.Pandwind || !complete) return { code, residuals: [] };
				if (
					!/\bconst\s+(?:css|runtimeCss)\s*=\s*createRuntimeCss\(\s*defaultPreset\s*\)/u.test(code)
				)
					return { code, residuals: [] };
				return {
					code: code
						.replace(
							/import\s*\{\s*defaultPreset\s*\}\s*from\s*["']pandwind\/preset\/default["'];?\s*/gu,
							"",
						)
						.replace(
							/\bconst\s+(?:css|runtimeCss)\s*=\s*createRuntimeCss\(\s*defaultPreset\s*\);?\s*/gu,
							"",
						),
					residuals: [],
				};
			},
		},
		emit(program, { programObject, declarationsObject }, context) {
			const cssBinding = generatedCssBinding(
				context?.document?.document.source,
				context?.sourceModules,
				context?.sourceModuleMatchers,
			);
			const hasFunctionDynamic = program.rules.some(function containsFunction(rule): boolean {
				return (
					rule.declarations.some(
						(declaration) =>
							declaration.value.kind === StyleValueKindTag.Dynamic &&
							/=>|^function\b/.test(declaration.value.expression.trim()),
					) || rule.children.some(containsFunction)
				);
			});
			const conditionResiduals: Array<StyleProgram["residuals"][number]> = [];
			const recordConditionResidual = (residual: StyleProgram["residuals"][number]) => {
				if (
					conditionResiduals.some(
						(existing) =>
							existing.kind === residual.kind &&
							existing.text === residual.text &&
							existing.hint === residual.hint,
					)
				)
					return;
				conditionResiduals.push(residual);
			};
			const normalizeOutput = (value: StyleProgram): StyleProgram =>
				normalizePandwindConditions(
					preserveKnownPresetTokens(value, context),
					context,
					recordConditionResidual,
				);
			const outputProgram = normalizePandwindConditions(
				preserveKnownPresetTokens(program, context),
				context,
				recordConditionResidual,
			);
			const renderProgramObject = (value: StyleProgram): string =>
				programObject(normalizeOutput(value));
			const finalize = (emission: {
				text: string;
				componentExpression?: boolean;
				imports: readonly string[];
				generatedStatements?: readonly string[];
				generatedFiles?: readonly AdapterGeneratedFile[];
				residuals?: readonly StyleProgram["residuals"][number][];
			}) => ({
				...useProjectBindings(
					renameGeneratedCssBinding(emission, cssBinding),
					cssBinding,
					context?.file ?? "",
					context?.project,
				),
				...(emission.generatedStatements === undefined
					? {}
					: { generatedStatements: emission.generatedStatements }),
				...(emission.generatedFiles === undefined
					? {}
					: { generatedFiles: emission.generatedFiles }),
				...(emission.componentExpression === undefined
					? {}
					: { componentExpression: emission.componentExpression }),
				residuals: [...conditionResiduals, ...(emission.residuals ?? [])],
				// The target object syntax is intentionally a projection of the
				// versioned program. Keep the program attached for validation and
				// downstream tools so nested conditions, rule kinds, and provenance are
				// never inferred back from generated JavaScript.
				semantic: outputProgram,
			});
			const unresolvedTokenResiduals = unresolvedForeignTokenResiduals(outputProgram);
			if (unresolvedTokenResiduals.length > 0) {
				const additionalResiduals = unresolvedTokenResiduals.filter(
					(residual) =>
						!outputProgram.residuals.some(
							(existing) => existing.kind === residual.kind && existing.text === residual.text,
						),
				);
				return finalize({ text: "", imports: [], residuals: additionalResiduals });
			}
			if (
				program.source?.pattern === CodemodPatternId.CssTemplate &&
				program.source.hostOpenTag === undefined
			) {
				const hasStaticContent = program.rules.some(function hasContent(rule): boolean {
					return rule.declarations.length > 0 || rule.children.some(hasContent);
				});
				if (
					hasStaticContent &&
					program.residuals.length === 0 &&
					!program.rules.some(function containsDynamic(rule): boolean {
						return (
							rule.declarations.some(
								(declaration) => declaration.value.kind === StyleValueKindTag.Dynamic,
							) || rule.children.some(containsDynamic)
						);
					})
				) {
					return finalize({
						text: `css.class(${renderProgramObject(outputProgram)})`,
						imports: [
							'import { createUnsafeCss } from "pandwind/unsafe/css";',
							"const css = createUnsafeCss();",
						],
					});
				}
				return finalize({
					text: `cssTemplate\`${program.source.template ?? ""}\``,
					imports: [],
				});
			}
			if (program.emissionHints?.includes(StyleProgramEmissionHint.GlobalVariables)) {
				return finalize({
					text: runtimeGlobalVars(outputProgram),
					imports: [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { defaultPreset } from "pandwind/preset/default";',
						"const runtimeCss = createRuntimeCss(defaultPreset);",
					],
				});
			}
			const host = program.source;
			const hasStyleContent = program.rules.some(function hasContent(rule): boolean {
				return rule.declarations.length > 0 || rule.children.some(hasContent);
			});
			if (
				host?.hostOpenTag !== undefined &&
				host.hostTag !== undefined &&
				host.hostStyleAttributes?.length === 0 &&
				!hasStyleContent &&
				program.residuals.length === 0
			) {
				return finalize({
					text: host.hostOpenTag.replace(
						/^<\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?/u,
						`<${host.hostTag}`,
					),
					imports: [],
				});
			}
			if (program.rules.some((rule) => rule.kind === StyleRuleKindTag.Global)) {
				const register = `runtimeCss.sheet.registerSemanticRules([${runtimeGlobalRules(outputProgram)}])`;
				const immediate =
					program.source?.adapter === CodemodAdapterId.VanillaExtract &&
					program.source.pattern === CodemodPatternId.VanillaExtractGlobalStyle;
				const template =
					program.emissionHints?.includes(StyleProgramEmissionHint.RawTemplate) === true
						? runtimeGlobalTemplate(program, context)
						: undefined;
				return finalize({
					text:
						template === undefined
							? immediate
								? `(${register}, null)`
								: `() => (${register}, null)`
							: template,
					imports: [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { defaultPreset } from "pandwind/preset/default";',
						"const runtimeCss = createRuntimeCss(defaultPreset);",
					],
				});
			}
			if (
				context?.host?.representation === StyleHostRepresentationKind.Component &&
				program.emissionHints?.includes(StyleProgramEmissionHint.RawTemplate) === true
			) {
				const component = runtimeRawComponent(program, context);
				if (component !== undefined) return finalize(component);
			}
			if (context?.host?.representation === StyleHostRepresentationKind.Component) {
				const component = staticComponent(outputProgram, renderProgramObject, context);
				if (component !== undefined) return finalize(component);
				const hybrid = hybridComponent(outputProgram, renderProgramObject, context);
				if (hybrid !== undefined) return finalize(hybrid);
			}
			if (host?.hostOpenTag !== undefined && host.hostStyleAttributes !== undefined) {
				const runtimeHost =
					host.template !== undefined && hasComponentSelectorInterpolation(host.template)
						? runtimeHostTemplateExpression(program, context)
						: undefined;
				if (runtimeHost !== undefined) return finalize(runtimeHost);
				const framework =
					host.framework ??
					context?.document?.framework ??
					(/\.(?:jsx|tsx|mdx)$/.test(context?.file ?? "") ? "react" : undefined);
				const dynamicHost = StyleProgramAnalysis.hasRuntimeDynamic(program);
				const programObjectText = renderProgramObject(
					hasFunctionDynamic ? mapRuntimeProps(outputProgram, "undefined") : outputProgram,
				);
				const dynamicVarsExpression = dynamicHost ? `css.vars(${programObjectText})` : undefined;
				const rendered = JsxStyleHost.render(
					host.hostOpenTag,
					host.hostStyleAttributes,
					dynamicVarsExpression === undefined
						? `css.class(${programObjectText})`
						: `${dynamicVarsExpression}.class`,
					framework,
					dynamicVarsExpression === undefined ? undefined : `${dynamicVarsExpression}.style`,
					host.hostTag,
					dynamicVarsExpression,
				);
				return finalize({
					text: rendered.text,
					imports: [
						'import { createUnsafeCss } from "pandwind/unsafe/css";',
						"const css = createUnsafeCss();",
						...(rendered.needsCx
							? ['import { createCx } from "pandwind/cx";', "const cx = createCx();"]
							: []),
					],
				});
			}
			const kind = program.rules[0]?.kind;
			const stylexDynamicGroup =
				program.source?.adapter === CodemodAdapterId.StyleX &&
				program.source.pattern === CodemodPatternId.StyleXCreate;
			if (
				(context?.host?.representation === StyleHostRepresentationKind.Component ||
					hasFunctionDynamic) &&
				!stylexDynamicGroup
			) {
				const component = runtimeComponent(outputProgram, renderProgramObject, context);
				if (component !== undefined) return finalize(component);
			}
			const hasFontFaces = program.rules.some(function containsFontFace(
				rule: StyleProgram["rules"][number],
			): boolean {
				return rule.kind === StyleRuleKindTag.FontFace || rule.children.some(containsFontFace);
			});
			if (hasFontFaces) {
				const withoutFontFaces = (
					rule: StyleProgram["rules"][number],
				): StyleProgram["rules"][number] => ({
					...rule,
					children: rule.children
						.filter((child) => child.kind !== StyleRuleKindTag.FontFace)
						.map(withoutFontFaces),
				});
				const styleProgram = {
					...program,
					rules: program.rules
						.filter((rule) => rule.kind !== StyleRuleKindTag.FontFace)
						.map(withoutFontFaces),
				};
				return finalize({
					text: `(runtimeCss.sheet.registerSemanticRules([${runtimeFontFaces(outputProgram)}]), runtimeCss.group(${renderProgramObject(styleProgram)}))`,
					imports: [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { defaultPreset } from "pandwind/preset/default";',
						"const runtimeCss = createRuntimeCss(defaultPreset);",
					],
				});
			}
			if (kind === StyleRuleKindTag.Keyframes)
				return finalize({
					text: runtimeKeyframes(outputProgram, context),
					imports: [
						'import { createRuntimeCss } from "pandwind/css/runtime";',
						'import { defaultPreset } from "pandwind/preset/default";',
						"const runtimeCss = createRuntimeCss(defaultPreset);",
					],
				});
			// Named conditions such as Panda's `_dark` still belong to one
			// class-string style call. A group is only required when the source
			// actually authored named style members (for example `{ card: {...} }`).
			const authoredNamed = program.rules.some((rule) => rule.name !== undefined);
			const dynamic = StyleProgramAnalysis.hasRuntimeDynamic(program);
			const runtimeStandalone =
				dynamic &&
				(kind === StyleRuleKindTag.Style || kind === undefined) &&
				program.emissionHints?.includes(StyleProgramEmissionHint.RuntimeClass) === true;
			const functionDynamic = program.rules.some(function containsFunction(rule): boolean {
				return (
					rule.declarations.some(
						(declaration) =>
							declaration.value.kind === StyleValueKindTag.Dynamic &&
							/=>|^function\b/.test(declaration.value.expression.trim()),
					) || rule.children.some(containsFunction)
				);
			});
			const jssClassMap =
				!dynamic && !functionDynamic
					? jssNamedClassMap(outputProgram, renderProgramObject)
					: undefined;
			const named = authoredNamed || jssClassMap !== undefined;
			const recipeVariants =
				program.compositions?.some(
					(composition) => composition.kind === StyleProgramCompositionKind.Recipe,
				) === true;
			const slotRecipe =
				program.compositions?.some(
					(composition) => composition.kind === StyleProgramCompositionKind.Slot,
				) === true;
			const needsRuntimeCss =
				!stylexDynamicGroup &&
				(program.emissionHints?.includes(StyleProgramEmissionHint.RuntimeFunction) === true ||
					runtimeStandalone ||
					functionDynamic);
			const dynamicCssBinding = needsRuntimeCss ? "runtimeCss" : "css";
			const hostUsesClassCarrier =
				dynamic &&
				program.source?.hostStyleAttributes?.some((attribute) =>
					/\b(?:className|class)\s*=\s*/u.test(attribute),
				);
			const dynamicEmission = hostUsesClassCarrier
				? `${dynamicCssBinding}.vars(${renderProgramObject(outputProgram)}).class`
				: `${dynamicCssBinding}.vars(${renderProgramObject(outputProgram)})`;
			if (program.source?.pattern === CodemodPatternId.TokenamiCompose)
				return finalize({
					text: `() => { const className = ${cssBinding}.class(${renderProgramObject(outputProgram)}); return [(value?: string) => pandwindCx(className, value), (style?: Record<string, unknown>) => style ?? {}] as const; }`,
					imports: [
						'import { createUnsafeCss } from "pandwind/unsafe/css";',
						`const ${cssBinding} = createUnsafeCss();`,
						'import { createCx } from "pandwind/cx";',
						"const pandwindCx = createCx();",
					],
				});
			const recipe = slotRecipe
				? recipeRuntime(context, "createSlotRecipe")
				: recipeVariants
					? recipeRuntime(context, "createRecipe")
					: undefined;
			const recipeUsesProjectRuntime = context?.project?.runtimeCssModule !== undefined;
			const recipeCssBinding = recipeUsesProjectRuntime ? "runtimeCss" : "css";
			const recipeDeclarationsObject = (
				declarations: readonly StyleProgram["declarations"][number][],
			) => pandwindRecipeDeclarationsObject(declarationsObject, declarations);
			return finalize({
				text: slotRecipe
					? `${recipe?.binding ?? "createSlotRecipe"}(${recipeCssBinding}, ${slotRecipeDefinitionObject(outputProgram, recipeDeclarationsObject)})`
					: recipeVariants
						? `${recipe?.binding ?? "createRecipe"}(${recipeCssBinding}, ${recipeDefinitionObject(outputProgram, recipeDeclarationsObject)})`
						: named
							? (jssClassMap ?? `css.group(${renderProgramObject(outputProgram)})`)
							: functionDynamic
								? `${dynamicCssBinding}.group(${renderProgramObject(outputProgram)})`
								: runtimeStandalone
									? `${dynamicCssBinding}.class(${renderProgramObject(outputProgram)})`
									: dynamic
										? dynamicEmission
										: `css.class(${renderProgramObject(outputProgram)})`,
				imports: slotRecipe
					? recipeUsesProjectRuntime
						? [
								'import { createRuntimeCss } from "pandwind/css/runtime";',
								'import { defaultPreset } from "pandwind/preset/default";',
								...(recipe?.imports ?? []),
								"const runtimeCss = createRuntimeCss(defaultPreset);",
							]
						: [
								'import { createUnsafeCss } from "pandwind/unsafe/css";',
								...(recipe?.imports ?? []),
								"const css = createUnsafeCss();",
							]
					: recipeVariants
						? recipeUsesProjectRuntime
							? [
									'import { createRuntimeCss } from "pandwind/css/runtime";',
									'import { defaultPreset } from "pandwind/preset/default";',
									...(recipe?.imports ?? []),
									"const runtimeCss = createRuntimeCss(defaultPreset);",
								]
							: [
									'import { createUnsafeCss } from "pandwind/unsafe/css";',
									...(recipe?.imports ?? []),
									"const css = createUnsafeCss();",
								]
						: needsRuntimeCss
							? [
									'import { createRuntimeCss } from "pandwind/css/runtime";',
									'import { defaultPreset } from "pandwind/preset/default";',
									"const runtimeCss = createRuntimeCss(defaultPreset);",
								]
							: [
									'import { createUnsafeCss } from "pandwind/unsafe/css";',
									"const css = createUnsafeCss();",
								],
				generatedStatements: recipe?.generatedStatements,
				generatedFiles: recipe?.generatedFiles,
			});
		},
	});
	return {
		...adapter,
		parse(source: string, context: AdapterParseContext) {
			const parsed = adapter.parse(source, context);
			const recipe = pandwindRecipeMatches(
				source,
				context,
				"createRecipe",
				CodemodPatternId.PandwindRecipe,
			);
			const slotRecipe = pandwindRecipeMatches(
				source,
				context,
				"createSlotRecipe",
				CodemodPatternId.PandwindSlotRecipe,
			);
			const runtime = runtimeSemanticRuleMatches(source, context);
			return {
				matches: [
					...parsed.matches,
					...recipe.matches,
					...slotRecipe.matches,
					...runtime.matches,
				].toSorted((a, b) => a.start - b.start),
				residuals: [
					...parsed.residuals,
					...recipe.residuals,
					...slotRecipe.residuals,
					...runtime.residuals,
				],
			};
		},
	};
}
