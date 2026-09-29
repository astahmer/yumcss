import { CodemodCallPatternFormTag } from "../identifiers.ts";
import {
	StyleProgramResidualKindTag,
	StyleDynamicLoweringTag,
	inferSemanticConditionKind,
	StyleRuleKindTag,
	StyleValueKindTag,
	styleProgramFromSourceObject,
	type SemanticConditionKind,
} from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import type {
	AdapterConditionCatalog,
	AdapterConfigContext,
	AdapterParseContext,
	AdapterProjectConfig,
	AdapterTokenPolicy,
} from "../adapter-contract.ts";
import {
	ADAPTER_TOKEN_DEFINITIONS_SCHEMA,
	ADAPTER_TOKEN_POLICY_SCHEMA,
} from "../adapter-contract.ts";
import type { StyleProgram, StyleProgramResidual, StyleValue } from "../semantic-ir.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { AdapterEvidence } from "../adapter-evidence.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import { joinDocumentPath } from "../../path-utils.ts";
import { relativeModuleImport } from "../../shared.ts";
import { isProjectLocalModule } from "../module-specifier.ts";
import { SourcePass } from "../../source-pass-utils.ts";
import type { JsxStyleHostMatch, JsxStylePropSelector } from "../jsx-style-host.ts";
import {
	canonicalizeSourceHost,
	componentAttrsValueExpression,
} from "../host-component-rewriter.ts";
import { materializeSourceTokenValues, recoverSourceToken, TokenCatalog } from "../tokens.ts";

const nativeConditionAttributeCollisions = new Set([
	"checked",
	"default",
	"disabled",
	"hidden",
	"loading",
	"multiple",
	"open",
	"placeholder",
	"readOnly",
	"required",
	"selected",
]);
const nativeChakraHostAttributes = new Set([
	"class",
	"className",
	"id",
	"role",
	"style",
	"tabIndex",
	"title",
]);

function isSpacingProperty(property: string): boolean {
	return (
		/^(?:p|p[trblxyse]|m|m[trblxyse]|gap|rowGap|columnGap)$/.test(property) ||
		property === "padding" ||
		property.startsWith("padding") ||
		property === "margin" ||
		property.startsWith("margin")
	);
}

function chakraTokenSource(adapter: string | undefined): boolean {
	return [CodemodAdapterId.ChakraUi, CodemodAdapterId.Mantine].includes(
		adapter as CodemodAdapterId,
	);
}

const chakraNativeUtilityDeclarations = (
	property: string,
	value: string | boolean | number,
):
	| readonly { readonly property: string; readonly value: string | boolean | number }[]
	| undefined => {
	if (property === "truncate") {
		return value === true
			? [
					{ property: "overflow", value: "hidden" },
					{ property: "textOverflow", value: "ellipsis" },
					{ property: "whiteSpace", value: "nowrap" },
				]
			: value === false
				? []
				: undefined;
	}
	if (property === "srOnly") {
		return value === true
			? [
					{ property: "position", value: "absolute" },
					{ property: "width", value: "1px" },
					{ property: "height", value: "1px" },
					{ property: "padding", value: "0" },
					{ property: "margin", value: "-1px" },
					{ property: "overflow", value: "hidden" },
					{ property: "clipPath", value: "inset(50%)" },
					{ property: "whiteSpace", value: "nowrap" },
					{ property: "borderWidth", value: "0" },
				]
			: value === false
				? []
				: undefined;
	}
	if (property === "WebkitLineClamp") return [{ property: "lineClamp", value }];
	if (property === "WebkitBoxOrient") return [];
	if (property === "clip" && typeof value === "string") {
		if (/^rect\(0(?:px)?[ ,]+0(?:px)?[ ,]+0(?:px)?[ ,]+0(?:px)?\)$/u.test(value))
			return [{ property: "clipPath", value: "inset(50%)" }];
		if (value === "auto") return [{ property: "clipPath", value: "none" }];
	}
	return undefined;
};

const sourceCondition = (
	name: string,
	context: AdapterParseContext,
): StyleProgram["rules"][number]["conditions"][number] => {
	const normalized = name.replace(/^_/, "");
	const rawValue = context.config.conditionCatalog?.[normalized];
	const value = typeof rawValue === "string" ? sourceConditionValue(rawValue) : undefined;
	const condition = {
		kind: inferSemanticConditionKind(normalized),
		name: normalized,
		...(value === undefined ? {} : { value }),
	};
	return name === normalized ? condition : { ...condition, raw: name };
};

function expandChakraTextStyle(
	declaration: StyleProgram["declarations"][number],
	context: AdapterParseContext,
): {
	readonly declarations: readonly StyleProgram["declarations"][number][];
	readonly residuals: readonly StyleProgramResidual[];
} {
	if (
		declaration.value.kind !== StyleValueKindTag.Literal ||
		typeof declaration.value.value !== "string"
	)
		return {
			declarations: [],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.Dynamic,
					text: "textStyle",
					hint: "textStyle must be a statically known Chakra text-style name",
				},
			],
		};
	const config = recordValue(context.config.values.chakraConfig);
	const theme = recordValue(config?.theme);
	const textStyles = recordValue(theme?.textStyles);
	const configuredTextStyle = textStyles?.[declaration.value.value];
	const configuredValue = recordValue(configuredTextStyle)?.value ?? configuredTextStyle;
	if (configuredValue === undefined)
		return {
			declarations: [],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.UnknownUtility,
					text: `textStyle: ${JSON.stringify(declaration.value.value)}`,
					hint: "textStyle is not present in the Chakra theme",
				},
			],
		};
	const serialized = JSON.stringify(configuredValue);
	if (serialized === undefined)
		return {
			declarations: [],
			residuals: [
				{
					kind: StyleProgramResidualKindTag.Parse,
					text: `textStyle: ${JSON.stringify(declaration.value.value)}`,
					hint: "Chakra text-style value could not be serialized safely",
				},
			],
		};
	const conditionValues = Object.fromEntries(
		Object.entries(context.config.conditionCatalog ?? {}).flatMap(([name, value]) =>
			typeof value === "string" ? [[name.replace(/^_/, ""), sourceConditionValue(value)]] : [],
		),
	);
	const conditionKinds = Object.fromEntries(
		Object.keys(conditionValues).map((name) => [name, inferSemanticConditionKind(name)]),
	);
	const propertyAliases = chakraSourceVocabulary(context).propertyAliases;
	const expanded = styleProgramFromSourceObject(serialized.slice(1, -1), {
		conditionKinds,
		conditionValues,
		propertyAliases,
		propertyValueConditions: true,
	});
	return {
		declarations: expanded.declarations.map((entry) => ({
			...declaration,
			conditions: [
				...declaration.conditions,
				...entry.conditions.map((condition) =>
					sourceCondition(condition.raw ?? condition.name, context),
				),
			],
			property: entry.property,
			value: chakraOfficialValue(entry.property, entry.value, context),
		})),
		residuals: expanded.residuals,
	};
}

function lowerChakraComponentDeclaration(
	component: string | undefined,
	declaration: StyleProgram["declarations"][number],
	context: AdapterParseContext,
): {
	readonly declaration?: StyleProgram["declarations"][number];
	readonly residual?: StyleProgramResidual;
} {
	const alias = CHAKRA_COMPONENT_PROPERTY_ALIASES[component ?? ""]?.[declaration.property];
	if (alias === undefined) return { declaration };
	if (declaration.property === "inline") {
		if (
			declaration.value.kind !== StyleValueKindTag.Literal ||
			typeof declaration.value.value !== "boolean"
		)
			return {
				residual: {
					kind: StyleProgramResidualKindTag.Dynamic,
					text: "inline",
					hint: "Chakra inline layout props require a static boolean for intrinsic lowering",
				},
			};
		const display =
			component === "Grid"
				? declaration.value.value
					? "inline-grid"
					: "grid"
				: declaration.value.value
					? "inline-flex"
					: "flex";
		return {
			declaration: {
				...declaration,
				property: alias,
				value: { kind: StyleValueKindTag.Literal, value: display },
			},
		};
	}
	if (component === "SimpleGrid" && declaration.property === "columns") {
		if (declaration.value.kind === StyleValueKindTag.Dynamic) {
			return {
				declaration: {
					...declaration,
					property: alias,
					value: {
						...declaration.value,
						expression: `\`repeat(\${${declaration.value.expression}}, minmax(0, 1fr))\``,
					},
				},
			};
		}
		if (declaration.value.kind !== StyleValueKindTag.Literal)
			return {
				residual: {
					kind: StyleProgramResidualKindTag.Dynamic,
					text: "columns",
					hint: "SimpleGrid columns requires a static or expression integer",
				},
			};
		const count = Number(declaration.value.value);
		if (!Number.isInteger(count) || count < 1)
			return {
				residual: {
					kind: StyleProgramResidualKindTag.UnknownUtility,
					text: `columns: ${String(declaration.value.value)}`,
					hint: "SimpleGrid columns requires a positive integer for intrinsic lowering",
				},
			};
		return {
			declaration: {
				...declaration,
				property: alias,
				value: {
					kind: StyleValueKindTag.Literal,
					value: `repeat(${count}, minmax(0, 1fr))`,
				},
			},
		};
	}
	if (component === "SimpleGrid" && declaration.property === "minChildWidth") {
		const rawValue =
			declaration.value.kind === StyleValueKindTag.Literal
				? String(declaration.value.value)
				: undefined;
		const sizeToken =
			rawValue === undefined
				? undefined
				: TokenCatalog.fromContract(context.config.tokenCatalog)?.findByReference(
						["sizes"],
						rawValue,
					);
		const minimum =
			sizeToken?.resolved ??
			(rawValue !== undefined &&
			/^(?:0|(?:\d+(?:\.\d+)?)(?:px|rem|em|%|vh|vw|svh|svw))$/u.test(rawValue)
				? rawValue
				: undefined);
		if (minimum === undefined)
			return {
				residual: {
					kind: StyleProgramResidualKindTag.UnknownUtility,
					text: `minChildWidth: ${rawValue ?? "dynamic value"}`,
					hint: "SimpleGrid minChildWidth requires a verified Chakra size token or static CSS length",
				},
			};
		return {
			declaration: {
				...declaration,
				property: alias,
				value: {
					kind: StyleValueKindTag.Literal,
					value: `repeat(auto-fit, minmax(${minimum}, 1fr))`,
				},
			},
		};
	}
	if (component === "GridItem" && ["colSpan", "rowSpan"].includes(declaration.property)) {
		if (declaration.value.kind !== StyleValueKindTag.Literal) {
			return {
				residual: {
					kind: StyleProgramResidualKindTag.Dynamic,
					text: declaration.property,
					hint: "GridItem span lowering requires a static value",
				},
			};
		}
		const span = String(declaration.value.value);
		if (span !== "auto" && (!/^\d+$/u.test(span) || Number(span) < 1))
			return {
				residual: {
					kind: StyleProgramResidualKindTag.UnknownUtility,
					text: `${declaration.property}: ${span}`,
					hint: "GridItem span must be auto or a positive integer",
				},
			};
		return {
			declaration: {
				...declaration,
				property: alias,
				value: {
					kind: StyleValueKindTag.Literal,
					value: span === "auto" ? span : `span ${span} / span ${span}`,
				},
			},
		};
	}
	return { declaration: { ...declaration, property: alias } };
}

/** Lower Chakra declarations to CSS semantics before any target emitter sees them. */
function lowerChakraDeclarations(
	program: StyleProgram,
	context: AdapterParseContext,
): StyleProgram {
	const component = chakraSourceComponentNameFromTag(
		sourceHostTag(program.source?.hostOpenTag ?? ""),
		context,
	);
	const residuals: StyleProgramResidual[] = [...program.residuals];
	const lowerRule = (rule: StyleProgram["rules"][number]): StyleProgram["rules"][number] => {
		const declarations: Array<StyleProgram["declarations"][number]> = [];
		for (const declaration of rule.declarations) {
			const componentLowering =
				rule.name === undefined && rule.conditions.length === 0
					? lowerChakraComponentDeclaration(component, declaration, context)
					: { declaration };
			if (componentLowering.residual !== undefined) residuals.push(componentLowering.residual);
			if (componentLowering.declaration === undefined) continue;
			const normalized = componentLowering.declaration;
			if (normalized.property === "textStyle") {
				const expanded = expandChakraTextStyle(normalized, context);
				declarations.push(...expanded.declarations);
				residuals.push(...expanded.residuals);
				continue;
			}
			if (normalized.value.kind !== StyleValueKindTag.Literal) {
				declarations.push(normalized);
				continue;
			}
			const utility = chakraNativeUtilityDeclarations(normalized.property, normalized.value.value);
			if (utility === undefined) {
				declarations.push(normalized);
				continue;
			}
			for (const item of utility)
				declarations.push({
					...normalized,
					property: item.property,
					value: chakraOfficialValue(
						item.property,
						{ kind: StyleValueKindTag.Literal, value: item.value },
						context,
					),
				});
		}
		return { ...rule, declarations, children: rule.children.map(lowerRule) };
	};
	const rules = program.rules.map(lowerRule);
	const root = rules.find(
		(rule) =>
			rule.kind === StyleRuleKindTag.Style &&
			rule.name === undefined &&
			rule.conditions.length === 0,
	);
	return {
		...program,
		rules,
		declarations: root?.declarations ?? [],
		residuals,
	};
}

function lowerChakraProgram(program: StyleProgram, context: AdapterParseContext): StyleProgram {
	const lowered = lowerChakraDeclarations(program, context);
	const residuals: StyleProgramResidual[] = [...lowered.residuals];
	const keyframeConditions = new Set<string>();
	const collectKeyframeConditions = (rule: StyleProgram["rules"][number]): void => {
		for (const declaration of rule.declarations)
			for (const condition of declaration.conditions)
				if (/^@keyframes\b/u.test(condition.name)) keyframeConditions.add(condition.name);
		for (const child of rule.children) collectKeyframeConditions(child);
	};
	for (const rule of lowered.rules) collectKeyframeConditions(rule);
	for (const condition of keyframeConditions)
		residuals.push({
			kind: StyleProgramResidualKindTag.Capability,
			text: condition,
			hint: "Chakra keyframes require an explicit target keyframes API",
		});
	return { ...lowered, residuals };
}

/** Preserve CSS-in-JS numeric dimensions before Chakra's token normalizer runs. */
function normalizeChakraEmissionProgram(program: StyleProgram): StyleProgram {
	if (chakraTokenSource(program.source?.adapter)) return program;
	const normalizeDeclaration = (declaration: StyleProgram["declarations"][number]) =>
		declaration.value.kind === StyleValueKindTag.Literal &&
		typeof declaration.value.value === "number" &&
		declaration.value.value !== 0 &&
		isSpacingProperty(declaration.property)
			? {
					...declaration,
					value: { kind: "literal" as const, value: `${declaration.value.value}px` },
				}
			: declaration;
	const normalizeRule = (rule: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
		...rule,
		declarations: rule.declarations.map(normalizeDeclaration),
		children: rule.children.map(normalizeRule),
	});
	return {
		...program,
		declarations: program.declarations.map(normalizeDeclaration),
		rules: program.rules.map(normalizeRule),
	};
}

function valueTransformPropertyFrom(
	aliases: Readonly<Record<string, string | readonly string[]>>,
	property: string,
): string {
	const alias = aliases[property];
	return typeof alias === "string" ? alias : property;
}

function chakraTokenGroups(property: string, config: AdapterProjectConfig): readonly string[] {
	const system = config.values.chakraSystem as ChakraSystemLike | undefined;
	if (system === undefined) return [];
	const utilityProperty = system.utility?.resolveShorthand?.(property) ?? property;
	const systemConfig = recordValue(system._config);
	const officialUtilities = recordValue(systemConfig?.utilities);
	const propertyConfig = recordValue(officialUtilities?.[utilityProperty]);
	const groups: string[] = [];
	if (typeof propertyConfig?.values === "string") groups.push(propertyConfig.values);
	for (const valueType of system.utility?.getTypes?.().get(utilityProperty) ?? []) {
		const group = /^Tokens\["([^"]+)"\]$/u.exec(valueType)?.[1];
		if (group !== undefined) groups.push(group);
	}
	const tokenDefinitions = config.tokenDefinitions;
	const officialTheme = recordValue(systemConfig?.theme);
	const knownGroups = new Set([
		...Object.keys(config.tokenCatalog?.groups ?? {}),
		...Object.keys(tokenDefinitions?.raw ?? {}),
		...Object.keys(tokenDefinitions?.semantic ?? {}),
		...Object.keys(recordValue(officialTheme?.tokens) ?? {}),
		...Object.keys(recordValue(officialTheme?.semanticTokens) ?? {}),
	]);
	return [...new Set(groups)].filter((group) => knownGroups.has(group));
}

const chakraCssVariableGroup = (group: string): string =>
	group.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`);

const chakraCssVariablePath = (path: string): string =>
	path
		.split(".")
		.filter((segment) => segment.toLowerCase() !== "default")
		.map((segment) => segment.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`))
		.join("-");

interface ChakraTokenDefinitionPath {
	readonly group: string;
	readonly path: string;
	readonly resolved?: string;
}

const chakraColorPaletteSources = (
	tokens: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string>> => {
	const paths: ChakraTokenDefinitionPath[] = [];
	const colors = tokens.colors;
	if (colors === undefined) return {};
	collectChakraTokenDefinitionPaths("colors", colors, [], paths);
	const palettes = new Map<string, string>();
	for (const token of paths) {
		const segments = token.path.split(".");
		const colorPath = segments.length > 1 ? segments.slice(0, -1) : segments;
		for (let index = 1; index <= colorPath.length; index++) {
			const root = colorPath.slice(0, index).join(".");
			palettes.set(root, `colors.${root}`);
		}
	}
	return Object.fromEntries(
		[...palettes.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
	);
};

function collectChakraTokenDefinitionPaths(
	group: string,
	value: unknown,
	path: readonly string[],
	result: ChakraTokenDefinitionPath[],
): void {
	if (typeof value === "string" || typeof value === "number") {
		result.push({ group, path: path.join("."), resolved: String(value) });
		return;
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) return;
	const record = value as Record<string, unknown>;
	if (Object.hasOwn(record, "value")) {
		const tokenValue = record.value;
		const resolved =
			typeof tokenValue === "string" || typeof tokenValue === "number"
				? String(tokenValue)
				: undefined;
		result.push({ group, path: path.join("."), ...(resolved === undefined ? {} : { resolved }) });
		return;
	}
	for (const [key, child] of Object.entries(record))
		collectChakraTokenDefinitionPaths(group, child, [...path, key], result);
}

function chakraTokenDefinitionPaths(
	context: AdapterParseContext,
): readonly ChakraTokenDefinitionPath[] {
	const definitions = context.config.tokenDefinitions;
	if (definitions === undefined) return [];
	const paths: ChakraTokenDefinitionPath[] = [];
	for (const tree of [definitions.raw, definitions.semantic]) {
		for (const [group, values] of Object.entries(tree))
			collectChakraTokenDefinitionPaths(group, values, [], paths);
	}
	return paths;
}

function chakraTokenReferenceForCssVariable(
	variable: string,
	config: AdapterProjectConfig | undefined,
): string | undefined {
	const definitions = config?.tokenDefinitions;
	if (definitions === undefined) return undefined;
	const paths: ChakraTokenDefinitionPath[] = [];
	for (const tree of [definitions.raw, definitions.semantic]) {
		for (const [group, values] of Object.entries(tree))
			collectChakraTokenDefinitionPaths(group, values, [], paths);
	}
	const match = paths.find((candidate) => {
		const prefix = `--chakra-${chakraCssVariableGroup(candidate.group)}-`;
		return (
			variable === `${prefix}${chakraCssVariablePath(candidate.path)}` ||
			(variable === `${prefix}${chakraCssVariablePath(candidate.path)}-default` &&
				candidate.path.toLowerCase().endsWith(".default"))
		);
	});
	return match?.path;
}

function rewriteOwnedChakraCssVariables(
	code: string,
	config: AdapterProjectConfig | undefined,
): { readonly code: string; readonly residuals: readonly StyleProgramResidual[] } {
	const unresolved = new Set<string>();
	const rewritten = code.replace(/var\((--chakra-[^)]+)\)/gu, (authored, variable: string) => {
		const reference = chakraTokenReferenceForCssVariable(variable, config);
		if (reference === undefined) {
			unresolved.add(variable);
			return authored;
		}
		return reference;
	});
	return {
		code: rewritten,
		residuals: [...unresolved].map((variable) => ({
			kind: StyleProgramResidualKindTag.Dynamic,
			text: variable,
			hint: "Chakra CSS variable has no owned source-token equivalent",
		})),
	};
}

function rewriteChakraTypeReferences(
	code: string,
	source: string,
	file: string,
	project: import("../adapter-contract.ts").AdapterProjectBindings | undefined,
): { readonly code: string; readonly imports: readonly string[] } {
	const sourceModules = /from\s*["']@chakra-ui\/react(?:\/[^"']+)?["']/u;
	if (!sourceModules.test(source)) return { code, imports: [] };
	const styleProps = project?.cssModule === undefined ? "StyleObject" : "StyleProps";
	const replacements: Readonly<Record<string, string>> = {
		GroupProps: `React.ComponentProps<"div"> & ${styleProps}`,
		FlexProps: `React.ComponentProps<"div"> & ${styleProps}`,
		TextProps: `React.ComponentProps<"p"> & ${styleProps}`,
		InputProps: `React.ComponentProps<"input"> & ${styleProps}`,
		SelectRootProps: "React.ComponentProps<typeof SelectRoot>",
		SystemStyleObject: styleProps,
	};
	const replacementNames = new Set(Object.keys(replacements));
	let rewritten = code.replace(
		/import\s+(type\s+)?\{([\s\S]*?)\}\s+from\s*(["'])(@chakra-ui\/react(?:\/[^'" ]+)?)\3\s*;?/gu,
		(statement, typeOnly: string | undefined, clause: string, quote: string, module: string) => {
			const kept = clause
				.split(",")
				.map((specifier: string) => specifier.trim())
				.filter((specifier: string) => {
					const imported =
						specifier
							.replace(/^type\s+/u, "")
							.split(/\s+as\s+/u)[0]
							?.trim() ?? "";
					return !replacementNames.has(imported);
				});
			if (kept.length === 0) return "";
			const typePrefix = typeOnly === undefined ? "" : "type ";
			return `import ${typePrefix}{ ${kept.join(", ")} } from ${quote}${module}${quote};`;
		},
	);
	for (const [component, tag] of Object.entries(CHAKRA_SOURCE_COMPONENTS)) {
		if (tag === undefined) continue;
		const escapedComponent = component.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		rewritten = rewritten.replace(
			new RegExp(`ComponentProps<\\s*typeof\\s+${escapedComponent}\\s*>`, "gu"),
			`ComponentProps<"${tag}">`,
		);
	}
	const imports: string[] = [];
	if (styleProps === "StyleProps") {
		const stylePropsModule = relativeModuleImport(file, project!.cssModule!, "").replace(
			/\.(?:[cm]?tsx?|jsx?)$/u,
			"",
		);
		imports.push(`import type { StyleProps } from "${stylePropsModule}";`);
	}
	for (const [name, replacement] of Object.entries(replacements)) {
		if (!new RegExp(`\\b${name}\\b`, "u").test(rewritten)) continue;
		if (name === "SystemStyleObject" && styleProps === "StyleObject")
			imports.push('import type { StyleObject } from "pandwind/types/typings";');
		rewritten = rewritten.replace(new RegExp(`\\b${name}\\b`, "gu"), replacement);
	}
	// An interface extends comma-separated object bases; an intersection is
	// valid in a type alias but invalid in that position. Keep the same
	// project-owned style surface while emitting valid TypeScript.
	const escapedStyleProps = ["StyleObject", "StyleProps"]
		.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("|");
	rewritten = rewritten.replace(
		new RegExp(`(\\bextends\\s+[^\\n{]*?)\\s*&\\s*(${escapedStyleProps})(?=\\s*,)`, "gu"),
		"$1, $2",
	);
	if (rewritten.match(/\bStackProps\b/u) !== null)
		imports.push('import type { StackProps } from "pandwind/stack";');
	return { code: rewritten, imports: [...new Set(imports)] };
}

function recoverChakraCssVariable(
	value: StyleValue,
	property: string,
	context: AdapterParseContext,
): StyleValue {
	if (value.kind !== StyleValueKindTag.Literal || typeof value.value !== "string") return value;
	const variable = /^var\((--chakra-[^)]+)\)$/u.exec(value.value)?.[1];
	if (variable === undefined) return value;
	const propertyGroups = chakraTokenGroups(property, context.config);
	const definitions = chakraTokenDefinitionPaths(context);
	const catalog = TokenCatalog.fromContract(context.config.tokenCatalog);
	const match = definitions.find((candidate) => {
		if (propertyGroups.length > 0 && !propertyGroups.includes(candidate.group)) return false;
		const prefix = `--chakra-${chakraCssVariableGroup(candidate.group)}-`;
		return (
			variable === `${prefix}${chakraCssVariablePath(candidate.path)}` ||
			(variable === `${prefix}${chakraCssVariablePath(candidate.path)}-default` &&
				candidate.path.toLowerCase().endsWith(".default"))
		);
	});
	if (match === undefined) return value;
	const catalogMatch = catalog?.findByReference([match.group], match.path);
	return {
		kind: StyleValueKindTag.Token,
		ref: match.path,
		authored: match.path,
		...(catalogMatch?.resolved === undefined && match.resolved === undefined
			? {}
			: { resolved: catalogMatch?.resolved ?? match.resolved }),
	};
}

const CHAKRA_TOKEN_POLICY: AdapterTokenPolicy = {
	schema: ADAPTER_TOKEN_POLICY_SCHEMA,
	preserve: (program, context) => {
		const catalog = TokenCatalog.fromContract(context.config.tokenCatalog);
		return catalog === undefined
			? materializeSourceTokenValues(program)
			: catalog.preserveProgram(
					program,
					(property) => chakraTokenGroups(property, context.config),
					(match) => match.ref,
				);
	},
};

function chakraOfficialValue(
	property: string,
	value: StyleValue,
	context: AdapterParseContext,
): StyleValue {
	if (
		context.targetId === CodemodAdapterId.Pandwind &&
		property === "colorPalette" &&
		value.kind === StyleValueKindTag.Dynamic
	)
		return { ...value, lowering: StyleDynamicLoweringTag.StaticOnly };
	const candidate = recoverChakraCssVariable(value, property, context);
	const catalog = TokenCatalog.fromContract(context.config.tokenCatalog);
	const groups = chakraTokenGroups(property, context.config);
	const recovered = recoverSourceToken(candidate, property, () => groups, catalog);
	if (recovered.kind === StyleValueKindTag.Token) return recovered;
	if (candidate.kind !== StyleValueKindTag.Literal) return candidate;
	const reference = String(candidate.value);
	if (groups.includes("spacing") && reference === "0") return candidate;
	if (
		!(
			/^[A-Za-z][\w-]*(?:\.[A-Za-z0-9_-]+)+(?:\/[A-Za-z0-9_-]+)?$/u.test(reference) ||
			(groups.includes("spacing") && /^-?\d+(?:\.\d+)?$/u.test(reference))
		) ||
		groups.length === 0
	)
		return candidate;
	return {
		kind: StyleValueKindTag.Token,
		ref: reference,
		authored: reference,
	};
}

interface ChakraSystemLike {
	readonly $$chakra?: true;
	readonly _config?: Record<string, unknown>;
	readonly properties?: ReadonlySet<string>;
	readonly utility?: {
		readonly shorthands?: ReadonlyMap<string, string>;
		readonly resolveShorthand?: (property: string) => string;
		readonly getTypes?: () => ReadonlyMap<string, string[]>;
	};
}

interface ChakraPackage {
	readonly defaultConfig?: Record<string, unknown>;
	readonly createSystem?: (...configs: Record<string, unknown>[]) => ChakraSystemLike;
	readonly isValidSystem?: (value: unknown) => value is ChakraSystemLike;
}

const recordValue = (value: unknown): Record<string, unknown> | undefined => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
};

const mergeTokenTrees = (
	left: Record<string, unknown>,
	right: Record<string, unknown>,
): Record<string, unknown> => {
	const result: Record<string, unknown> = { ...left };
	for (const [key, value] of Object.entries(right)) {
		const leftRecord = recordValue(result[key]);
		const rightRecord = recordValue(value);
		result[key] =
			leftRecord === undefined || rightRecord === undefined
				? value
				: mergeTokenTrees(leftRecord, rightRecord);
	}
	return result;
};

const neutralChakraCondition = (name: string, value: string): string => {
	if (name === "dark") return ".dark &";
	return value.replaceAll(".chakra-theme", "[data-theme]");
};

const addChakraConditions = (catalog: Record<string, string>, value: unknown): void => {
	const record = recordValue(value);
	if (record === undefined) return;
	for (const [name, condition] of Object.entries(record)) {
		if (name === "extend" || typeof condition !== "string") continue;
		const normalized = name.replace(/^_/, "");
		const resolved = neutralChakraCondition(normalized, condition);
		catalog[normalized] = resolved;
		if (!resolved.startsWith("@")) catalog[`_${normalized}`] = resolved;
	}
};

const addChakraBreakpoints = (catalog: Record<string, string>, value: unknown): void => {
	const breakpoints = recordValue(value);
	if (breakpoints === undefined) return;
	const entries = Object.entries(breakpoints).filter(
		(entry): entry is [string, string] => typeof entry[1] === "string" && entry[0] !== "base",
	);
	for (const [index, [name, breakpoint]] of entries.entries()) {
		catalog[name] = `@media (min-width: ${breakpoint})`;
		catalog[`${name}Down`] = `@media (max-width: calc(${breakpoint} - 0.02px))`;
		const next = entries[index + 1];
		if (next === undefined) {
			catalog[`${name}Only`] = `@media (min-width: ${breakpoint})`;
			continue;
		}
		const [nextName, nextBreakpoint] = next;
		const range = `@media (min-width: ${breakpoint}) and (max-width: calc(${nextBreakpoint} - 0.02px))`;
		catalog[`${name}Only`] = range;
		catalog[`${name}To${nextName[0]?.toUpperCase() ?? ""}${nextName.slice(1)}`] = range;
	}
};

const chakraConditionCatalog = (
	chakra: ChakraPackage,
	config: Record<string, unknown>,
): AdapterConditionCatalog => {
	const catalog: Record<string, string> = {};
	const defaultConfig = chakra.defaultConfig ?? {};
	addChakraConditions(catalog, defaultConfig.conditions);
	addChakraConditions(catalog, config.conditions);
	addChakraConditions(catalog, recordValue(config.conditions)?.extend);
	addChakraBreakpoints(catalog, recordValue(recordValue(defaultConfig.theme)?.breakpoints));
	addChakraBreakpoints(catalog, recordValue(recordValue(config.theme)?.breakpoints));
	return catalog;
};

const sourceConditionValue = (value: string): string =>
	value.replace(/^@(media|container|supports)\s+/u, "");

function chakraSourceVocabulary(context: AdapterParseContext): {
	readonly styleProps: JsxStylePropSelector;
	readonly propertyAliases: Readonly<Record<string, string | readonly string[]>>;
	readonly valueTransformProperties: readonly string[];
} {
	const system = context.config.values.chakraSystem as ChakraSystemLike | undefined;
	const aliases = system?.utility?.shorthands;
	const sourceConditionNames = new Set(Object.keys(context.config.conditionCatalog ?? {}));
	const systemConfig = recordValue(system?._config);
	const officialUtilities = recordValue(systemConfig?.utilities);
	const knownProperties = new Set<string>([
		...(system?.properties ?? []),
		...Object.keys(officialUtilities ?? {}),
	]);
	const chakraTheme = recordValue(recordValue(context.config.values.chakraConfig)?.theme);
	if (Object.keys(recordValue(chakraTheme?.textStyles) ?? {}).length > 0)
		knownProperties.add("textStyle");
	const resolvedAliases = aliases === undefined ? {} : Object.fromEntries(aliases);
	const resolvedProperties = [...knownProperties];
	return {
		styleProps: (property, openingTag) =>
			(property === "size" && sourceHostTag(openingTag ?? "") === "Heading") ||
			property === "css" ||
			knownProperties.has(property) ||
			Object.hasOwn(
				CHAKRA_COMPONENT_PROPERTY_ALIASES[
					chakraSourceComponentNameFromTag(sourceHostTag(openingTag ?? ""), context) ?? ""
				] ?? {},
				property,
			) ||
			(sourceConditionNames.has(property) && !nativeConditionAttributeCollisions.has(property)) ||
			(property.startsWith("_") && sourceConditionNames.has(property.replace(/^_/, ""))) ||
			Object.hasOwn(resolvedAliases, property),
		propertyAliases: resolvedAliases,
		valueTransformProperties: [
			...new Set([...resolvedProperties, ...Object.keys(resolvedAliases)]),
		],
	};
}

function chakraConfigCandidate(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const candidate = value as Record<string, unknown>;
	return [
		"theme",
		"conditions",
		"globalCss",
		"preflight",
		"cssVarsPrefix",
		"cssVarsRoot",
		"strictTokens",
	].some((key) => candidate[key] !== undefined)
		? candidate
		: undefined;
}

async function officialChakraConfig(
	context: import("../adapter-contract.ts").AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<import("../adapter-contract.ts").AdapterProjectConfig> {
	const fallback = {
		adapter: CodemodAdapterId.ChakraUi,
		root: context.root,
		files: [context.file],
		values: {},
	};
	if (context.root === undefined) return fallback;
	const discovered =
		context
			.listFiles?.(context.root)
			.filter((candidate) =>
				/(?:^|[\\/])(?:[^\\/]+[\\/])*(?:theme|chakra\.config)(?:[\\/](?:index\.)?(?:ts|tsx|js|mjs|cjs)|\.(?:ts|tsx|js|mjs|cjs))$/u.test(
					candidate,
				),
			) ?? [];
	const candidates = [
		"src/theme.ts",
		"src/theme.tsx",
		"src/theme.js",
		"src/theme.mjs",
		"src/chakra.config.ts",
		"src/chakra.config.js",
		"theme.ts",
		"theme.tsx",
		"theme.js",
		"theme.mjs",
		"chakra.config.ts",
		"chakra.config.js",
		...(discovered ?? []),
	];
	const chakra = await loader.importPackage<ChakraPackage>("@chakra-ui/react", context.root);
	if (chakra === undefined)
		return candidates.some(
			(candidate) =>
				context.readFile?.(
					candidate.startsWith(context.root!)
						? candidate
						: joinDocumentPath(context.root!, candidate),
				) !== undefined,
		)
			? AdapterEvidence.configurationFailure(
					fallback,
					"Chakra project configuration",
					"the official @chakra-ui/react package is unavailable for a discovered theme module",
				)
			: fallback;
	const projectConfig = (
		config: Record<string, unknown>,
		system: ChakraSystemLike | undefined,
		path?: string,
	): import("../adapter-contract.ts").AdapterProjectConfig => {
		const effectiveConfig = system?._config ?? config;
		const theme = recordValue(effectiveConfig.theme) ?? {};
		const rawTokens = recordValue(theme.tokens) ?? {};
		const semanticTokens = recordValue(theme.semanticTokens) ?? {};
		const colorPalettes = chakraColorPaletteSources(mergeTokenTrees(rawTokens, semanticTokens));
		return {
			...fallback,
			...(path === undefined ? {} : { files: [...fallback.files, path] }),
			conditionCatalog: chakraConditionCatalog(chakra, effectiveConfig),
			tokenCatalog: TokenCatalog.fromNested(mergeTokenTrees(rawTokens, semanticTokens))?.contract,
			tokenDefinitions: {
				schema: ADAPTER_TOKEN_DEFINITIONS_SCHEMA,
				raw: rawTokens,
				semantic: semanticTokens,
			},
			...(Object.keys(colorPalettes).length === 0 ? {} : { colorPalettes }),
			values: {
				chakraConfig: effectiveConfig,
				...(system === undefined ? {} : { chakraSystem: system }),
				officialConfigPackage: "@chakra-ui/react",
			},
		};
	};
	for (const candidate of new Set(candidates)) {
		const path = candidate.startsWith(context.root)
			? candidate
			: joinDocumentPath(context.root, candidate);
		// Preserve candidate priority: the first project theme wins.
		const module = await loader.importFile<Record<string, unknown>>(path);
		const isDiscovered = discovered.includes(candidate) || context.readFile?.(path) !== undefined;
		if (module === undefined) {
			if (isDiscovered)
				return AdapterEvidence.configurationFailure(
					fallback,
					path,
					"the official Chakra loader could not evaluate a discovered theme module",
				);
			continue;
		}
		const exported = [module.default, ...Object.values(module)];
		const existingSystem = exported.find((value) => chakra.isValidSystem?.(value) === true) as
			| ChakraSystemLike
			| undefined;
		const config =
			existingSystem?._config ??
			exported.map(chakraConfigCandidate).find((value) => value !== undefined);
		if (config === undefined) {
			if (isDiscovered)
				return AdapterEvidence.configurationFailure(
					fallback,
					path,
					"the discovered module does not expose a supported Chakra system or config",
				);
			continue;
		}
		const system =
			existingSystem ??
			(chakra.createSystem?.(chakra.defaultConfig ?? {}, config) as ChakraSystemLike | undefined);
		return projectConfig(config, system, path);
	}
	const defaultConfig = chakra.defaultConfig ?? {};
	const defaultSystem = chakra.createSystem?.(defaultConfig);
	if (defaultSystem === undefined && Object.keys(defaultConfig).length === 0)
		return AdapterEvidence.configurationFailure(
			fallback,
			"@chakra-ui/react",
			"the installed package exposes neither its default config nor the system factory",
		);
	return projectConfig(defaultConfig, defaultSystem);
}

function preserveSeparatorGap(host: JsxStyleHostMatch): readonly string[] {
	if (!host.attributes.some((attribute) => attribute.name === "separator")) return [];
	return host.styleAttributes
		.filter((attribute) => attribute.name === "gap")
		.map((attribute) => attribute.name);
}

function preserveNextImageFill(host: JsxStyleHostMatch): readonly string[] {
	const tag = /^<\s*([A-Za-z_$][\w$.-]*)/.exec(host.openingTag)?.[1];
	if (tag !== "Image") return [];
	return host.styleAttributes
		.filter(
			(attribute) =>
				attribute.name === "fill" &&
				(attribute.value === true || attribute.value.trim() === "true"),
		)
		.map((attribute) => attribute.name);
}

function objectReferences(source: string): Readonly<Record<string, string>> {
	const references: Record<string, string> = {};
	for (const match of source.matchAll(
		/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:defineStyle\s*\(\s*)?\{/g,
	)) {
		const name = match[1];
		const start = (match.index ?? 0) + match[0].lastIndexOf("{");
		if (name === undefined) continue;
		const block = SourcePass.matchBlock(source, start);
		if (block !== null) references[name] = block.body;
	}
	return references;
}

function compositionResidual(program: StyleProgram, text: string): StyleProgram {
	return {
		...program,
		rules: [],
		declarations: [],
		residuals: [
			...program.residuals,
			{
				kind: StyleProgramResidualKindTag.Composition,
				text,
				hint: "Chakra recipes and attached factory styles require explicit composition lowering",
			},
		],
	};
}

function sourceHostTag(openingTag: string): string | undefined {
	return /^<\s*([A-Za-z_$][\w$.-]*)/u.exec(openingTag)?.[1];
}

function isChakraOwnedHost(source: string, openingTag: string): boolean {
	const tag = sourceHostTag(openingTag);
	if (tag === undefined) return false;
	if (/^[a-z]/u.test(tag)) return true;
	const parts = tag.split(".");
	if (parts.length > 1) {
		const namespace = parts[0];
		return (
			namespace !== undefined &&
			new RegExp(
				`import\\s+\\*\\s+as\\s+${namespace.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s+from\\s+["']@chakra-ui/react["']`,
			).test(source)
		);
	}
	for (const match of source.matchAll(
		/import\s*\{([^}]+)\}\s*from\s*["']@chakra-ui\/react["']/gu,
	)) {
		const localNames = match[1]
			?.split(",")
			.filter((specifier) => !/^type\s+/u.test(specifier.trim()))
			.map((specifier) =>
				specifier
					.trim()
					.split(/\s+as\s+/u)
					.at(-1),
			)
			.map((name) => name?.trim());
		if (localNames?.includes(tag) === true) return true;
	}
	return false;
}

function qualifyChakraIntrinsicHost(
	code: string,
	openingTag: string,
): {
	readonly code: string;
	readonly imports: readonly string[];
} {
	const tag = sourceHostTag(openingTag);
	if (tag === undefined || !/^[a-z]/u.test(tag)) return { code, imports: [] };
	const qualifiedOpening = `<chakra.${tag}`;
	const openingIndex = code.indexOf(openingTag);
	if (openingIndex < 0) return { code, imports: [] };
	const opening = code.slice(openingIndex, openingIndex + openingTag.length);
	const qualified = opening.replace(new RegExp(`^<\\s*${tag}(?=[\\s/>])`, "u"), qualifiedOpening);
	let rewritten = `${code.slice(0, openingIndex)}${qualified}${code.slice(openingIndex + openingTag.length)}`;
	const closing = new RegExp(`</${tag}>`, "g");
	rewritten = rewritten.replace(closing, `</chakra.${tag}>`);
	return {
		code: rewritten,
		imports: ['import { chakra } from "@chakra-ui/react";'],
	};
}

function qualifyFirstChakraIntrinsicHost(code: string): {
	readonly code: string;
	readonly imports: readonly string[];
} {
	const opening = /<([a-z][\w.-]*)(?=[\s/>])[^>]*>/u.exec(code)?.[0];
	return opening === undefined ? { code, imports: [] } : qualifyChakraIntrinsicHost(code, opening);
}

const CHAKRA_SOURCE_COMPONENTS: Readonly<Record<string, string | undefined>> = {
	Box: "div",
	Text: "p",
	Heading: undefined,
	Button: undefined,
	Link: undefined,
	Image: "img",
	Input: undefined,
	Span: "span",
	GridItem: "div",
	WrapItem: "div",
	Flex: "div",
	Stack: "div",
	HStack: "div",
	VStack: "div",
	Center: "div",
	Grid: "div",
	SimpleGrid: "div",
	Wrap: "div",
	Container: undefined,
	AbsoluteCenter: undefined,
	Badge: undefined,
	Card: undefined,
	Circle: undefined,
	Float: undefined,
	Icon: undefined,
	IconButton: undefined,
	LinkBox: undefined,
	LinkOverlay: undefined,
	Portal: undefined,
	Separator: undefined,
	StackSeparator: undefined,
};

const CHAKRA_COMPONENT_PROPERTY_ALIASES: Readonly<
	Record<string, Readonly<Record<string, string>>>
> = {
	Flex: {
		direction: "flexDirection",
		align: "alignItems",
		justify: "justifyContent",
		wrap: "flexWrap",
		basis: "flexBasis",
		grow: "flexGrow",
		shrink: "flexShrink",
		inline: "display",
	},
	Stack: {
		direction: "flexDirection",
		align: "alignItems",
		justify: "justifyContent",
		wrap: "flexWrap",
	},
	HStack: { align: "alignItems", justify: "justifyContent", wrap: "flexWrap" },
	VStack: { align: "alignItems", justify: "justifyContent", wrap: "flexWrap" },
	Center: { inline: "display" },
	Grid: {
		templateAreas: "gridTemplateAreas",
		autoColumns: "gridAutoColumns",
		column: "gridColumn",
		row: "gridRow",
		autoFlow: "gridAutoFlow",
		autoRows: "gridAutoRows",
		templateRows: "gridTemplateRows",
		templateColumns: "gridTemplateColumns",
		inline: "display",
	},
	SimpleGrid: { columns: "gridTemplateColumns", minChildWidth: "gridTemplateColumns" },
	GridItem: {
		area: "gridArea",
		colSpan: "gridColumn",
		colStart: "gridColumnStart",
		colEnd: "gridColumnEnd",
		rowSpan: "gridRow",
		rowStart: "gridRowStart",
		rowEnd: "gridRowEnd",
	},
	Image: { fit: "objectFit", align: "objectPosition" },
	Wrap: {
		align: "alignItems",
		justify: "justifyContent",
		direction: "flexDirection",
	},
};

const CHAKRA_SOURCE_MODULES = ["@chakra-ui/react"] as const;

const isChakraSourceModule = (moduleSpecifier: string): boolean =>
	moduleSpecifier === "@chakra-ui/react" || moduleSpecifier.startsWith("@chakra-ui/react/");

const isChakraSourceHost = (host: JsxStyleHostMatch, context: AdapterParseContext): boolean => {
	const tag = sourceHostTag(host.openingTag);
	if (tag === undefined) return false;
	const localName = tag.split(".", 1)[0];
	if (localName === undefined) return false;
	const binding = context.resolveBinding?.(localName) ?? context.bindings?.binding(localName);
	if (binding !== undefined) {
		if (isProjectLocalModule(binding.source)) return false;
		if (!isChakraSourceModule(binding.source)) return false;
		return !hasChakraNativeHostBlockedProp(host, context);
	}

	// A missing import binding is common in isolated parser snippets, so retain
	// the documented source names there. Unknown local components must fail
	// closed: their props may be application data rather than CSS.
	const member = tag.slice(tag.lastIndexOf(".") + 1);
	const knownSourceHost =
		tag.startsWith("chakra.") ||
		(!tag.includes(".") && Object.hasOwn(CHAKRA_SOURCE_COMPONENTS, tag)) ||
		(tag.startsWith("styled.") && Object.hasOwn(CHAKRA_SOURCE_COMPONENTS, member));
	return knownSourceHost && !hasChakraNativeHostBlockedProp(host, context);
};

const isUnsupportedChakraGridColumnsHost = (
	host: JsxStyleHostMatch,
	context: AdapterParseContext,
): boolean => {
	const tag = sourceHostTag(host.openingTag);
	if (tag === undefined) return false;
	const localName = tag.split(".", 1)[0];
	if (localName === undefined) return false;
	const binding = context.resolveBinding?.(localName) ?? context.bindings?.binding(localName);
	if (binding !== undefined && !isChakraSourceModule(binding.source)) return false;
	if (binding === undefined) {
		const member = tag.slice(tag.lastIndexOf(".") + 1);
		const knownSourceHost =
			tag.startsWith("chakra.") ||
			(!tag.includes(".") && Object.hasOwn(CHAKRA_SOURCE_COMPONENTS, tag)) ||
			(tag.startsWith("styled.") && Object.hasOwn(CHAKRA_SOURCE_COMPONENTS, member));
		if (!knownSourceHost) return false;
	}
	return (
		chakraSourceComponentName(host, context) === "Grid" &&
		host.attributes.some((attribute) => attribute.name === "columns") &&
		hasChakraNativeHostBlockedProp(host, context)
	);
};

const CHAKRA_NATIVE_HOST_BLOCKED_PROPS: Readonly<Record<string, readonly string[]>> = {
	Box: ["as", "asChild", "colorPalette", "component", "renderRoot", "size", "variant"],
	Text: ["as", "asChild", "colorPalette", "component", "renderRoot", "size", "variant"],
	Heading: ["as", "asChild", "colorPalette", "component", "renderRoot", "variant"],
	Button: ["as", "asChild", "colorPalette", "loading", "loadingText", "size", "variant"],
	Link: [
		"as",
		"asChild",
		"colorPalette",
		"component",
		"isExternal",
		"renderRoot",
		"size",
		"variant",
	],
	Image: ["as", "asChild", "fallback", "fallbackSrc", "ignoreFallback"],
	Input: [
		"as",
		"asChild",
		"colorPalette",
		"component",
		"errorBorderColor",
		"focusBorderColor",
		"invalid",
		"isDisabled",
		"isInvalid",
		"isReadOnly",
		"isRequired",
		"loading",
		"loadingText",
		"renderRoot",
		"size",
		"variant",
	],
	GridItem: ["as", "asChild", "renderRoot"],
	Flex: ["as", "asChild", "colorPalette", "component", "renderRoot", "size", "variant"],
	Stack: [
		"as",
		"asChild",
		"colorPalette",
		"component",
		"renderRoot",
		"separator",
		"size",
		"variant",
	],
	HStack: [
		"as",
		"asChild",
		"colorPalette",
		"component",
		"renderRoot",
		"separator",
		"size",
		"variant",
	],
	VStack: [
		"as",
		"asChild",
		"colorPalette",
		"component",
		"renderRoot",
		"separator",
		"size",
		"variant",
	],
	Center: ["as", "asChild", "colorPalette", "component", "renderRoot", "size", "variant"],
	Grid: ["as", "asChild", "columns", "colorPalette", "component", "renderRoot", "size", "variant"],
	SimpleGrid: ["as", "asChild", "colorPalette", "component", "renderRoot", "size", "variant"],
	Wrap: ["as", "asChild", "colorPalette", "component", "renderRoot", "size", "variant"],
	Container: ["as", "asChild", "colorPalette", "component", "renderRoot", "size", "variant"],
	Span: ["as", "asChild", "colorPalette", "component", "renderRoot", "size", "variant"],
};

const chakraSourceComponentName = (
	host: JsxStyleHostMatch,
	context: AdapterParseContext,
): string | undefined => chakraSourceComponentNameFromTag(sourceHostTag(host.openingTag), context);

function chakraSourceComponentNameFromTag(
	tag: string | undefined,
	context: AdapterParseContext,
): string | undefined {
	if (tag === undefined) return undefined;
	const localName = tag.split(".", 1)[0];
	if (localName === undefined) return undefined;
	const binding = context.resolveBinding?.(localName) ?? context.bindings?.binding(localName);
	if (binding !== undefined && isChakraSourceModule(binding.source)) return binding.importedName;
	return tag.slice(tag.lastIndexOf(".") + 1);
}

const chakraSourceComponentTag = (component: string): string | undefined =>
	Object.entries(CHAKRA_SOURCE_COMPONENTS).find(([name]) => name === component)?.[1];

const hasChakraNativeHostBlockedProp = (
	host: JsxStyleHostMatch,
	context: AdapterParseContext,
): boolean => {
	const component = chakraSourceComponentName(host, context);
	if (component === undefined) return false;
	const blocked = new Set(CHAKRA_NATIVE_HOST_BLOCKED_PROPS[component] ?? []);
	return host.attributes.some(
		(attribute) =>
			blocked.has(attribute.name) &&
			!(attribute.name === "as" && !attribute.expression) &&
			!(context.targetId === CodemodAdapterId.Pandwind && attribute.name === "colorPalette"),
	);
};

const chakraSourceComponentsForContext = (
	context: AdapterParseContext,
): Readonly<Record<string, string | undefined>> => {
	const components: Record<string, string | undefined> = { ...CHAKRA_SOURCE_COMPONENTS };
	for (const binding of context.bindings?.bindings ?? []) {
		if (!isChakraSourceModule(binding.source)) {
			delete components[binding.localName];
			continue;
		}
		const entry = Object.entries(CHAKRA_SOURCE_COMPONENTS).find(
			([name]) => name === binding.importedName,
		);
		if (entry !== undefined) components[binding.localName] = entry[1];
	}
	return components;
};

const isChakraNativeHost = (host: JsxStyleHostMatch, context: AdapterParseContext): boolean => {
	if (
		host.styleAttributes.length > 0 ||
		host.attributes.some(
			(attribute) =>
				!attribute.name.startsWith("data-") &&
				!attribute.name.startsWith("aria-") &&
				!nativeChakraHostAttributes.has(attribute.name),
		) ||
		!isChakraSourceHost(host, context)
	)
		return false;
	const component = chakraSourceComponentName(host, context);
	if (component === undefined || chakraSourceComponentTag(component) === undefined) return false;
	return (
		!host.attributes.some((attribute) => attribute.name.startsWith("_")) &&
		!hasChakraNativeHostBlockedProp(host, context)
	);
};

const isUnprojectedChakraHost = (
	host: JsxStyleHostMatch,
	context: AdapterParseContext,
): boolean => {
	if (context.targetId !== CodemodAdapterId.Pandwind) return false;
	if (hasChakraNativeHostBlockedProp(host, context)) return false;
	const sourceStyleProps = chakraSourceVocabulary(context).styleProps;
	const hasSourceStyleProps = host.attributes.some((attribute) =>
		typeof sourceStyleProps === "function"
			? sourceStyleProps(attribute.name, host.openingTag)
			: sourceStyleProps.includes(attribute.name),
	);
	if (hasSourceStyleProps) return false;
	const tag = sourceHostTag(host.openingTag);
	if (tag === undefined || tag.startsWith("chakra.")) return false;
	const localName = tag.split(".", 1)[0];
	if (localName === undefined) return false;
	const binding = context.resolveBinding?.(localName) ?? context.bindings?.binding(localName);
	const component = chakraSourceComponentName(host, context);
	if (component === undefined) return false;
	if (binding !== undefined && !isChakraSourceModule(binding.source)) return false;
	if (binding === undefined && !Object.hasOwn(CHAKRA_SOURCE_COMPONENTS, component)) return false;
	return (
		!Object.hasOwn(CHAKRA_SOURCE_COMPONENTS, component) ||
		CHAKRA_SOURCE_COMPONENTS[component] === undefined
	);
};

function removeUnusedChakraSystemBootstrap(code: string): string {
	const edits: Array<{ readonly start: number; readonly end: number }> = [];
	const declarationPattern =
		/^[ \t]*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createSystem\(\s*([A-Za-z_$][\w$]*)\s*\);?[ \t]*(?:\r?\n|$)/gmu;
	const escapeIdentifier = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	for (const match of code.matchAll(declarationPattern)) {
		const start = match.index;
		const binding = match[1];
		const config = match[2];
		if (start === undefined || binding === undefined || config === undefined) continue;
		const end = start + match[0].length;
		const withoutDeclaration = `${code.slice(0, start)}${code.slice(end)}`;
		const body = withoutDeclaration.replace(
			/(^|\n)[ \t]*import\b[\s\S]*?from\s+["'][^"']+["'];?[ \t]*(?=\r?\n|$)/g,
			"$1",
		);
		const bindingPattern = new RegExp(`\\b${escapeIdentifier(binding)}\\b`, "u");
		const configPattern = new RegExp(`\\b${escapeIdentifier(config)}\\b`, "u");
		if (!bindingPattern.test(body) && !configPattern.test(body)) edits.push({ start, end });
	}
	for (const edit of edits.toReversed())
		code = `${code.slice(0, edit.start)}${code.slice(edit.end)}`;
	return code;
}

const CHAKRA_HOST_DEFAULTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
	Flex: { display: "flex" },
	Stack: { display: "flex", flexDirection: "column", gap: "0.5rem" },
	HStack: { display: "flex", flexDirection: "row", alignItems: "center", gap: "0.5rem" },
	VStack: { display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" },
	Center: { display: "flex", alignItems: "center", justifyContent: "center" },
	Grid: { display: "grid" },
	SimpleGrid: { display: "grid" },
	Wrap: { display: "flex", flexWrap: "wrap", gap: "0.5rem" },
	WrapItem: { display: "flex", alignItems: "flex-start" },
	Image: { objectFit: "cover" },
};

function applyChakraHostDefaults(
	program: StyleProgram,
	context: AdapterParseContext,
): StyleProgram {
	const openingTag = program.source?.hostOpenTag;
	if (openingTag === undefined) return program;
	const component = chakraSourceComponentNameFromTag(sourceHostTag(openingTag), context);
	if (component === undefined) return program;
	const defaults = CHAKRA_HOST_DEFAULTS[component];
	if (defaults === undefined) return program;
	const rootIndex = program.rules.findIndex(
		(rule) =>
			rule.kind === StyleRuleKindTag.Style &&
			rule.name === undefined &&
			rule.conditions.length === 0,
	);
	const rootRule = rootIndex < 0 ? undefined : program.rules[rootIndex];
	if (rootRule === undefined) return program;
	const componentAliases = CHAKRA_COMPONENT_PROPERTY_ALIASES[component] ?? {};
	const existingProperties = new Set(
		rootRule.declarations.map(
			(declaration) => componentAliases[declaration.property] ?? declaration.property,
		),
	);
	const declarations = Object.entries(defaults)
		.filter(([property]) => !existingProperties.has(property))
		.map(([property, value]) => ({
			conditions: [],
			property,
			value: { kind: StyleValueKindTag.Literal as const, value },
		}));
	if (declarations.length === 0) return program;
	const rules = program.rules.map((rule, index) =>
		index === rootIndex ? { ...rule, declarations: [...declarations, ...rule.declarations] } : rule,
	);
	return { ...program, rules, declarations: [...declarations, ...program.declarations] };
}

const isChakraLayoutHostWithoutStyles = (
	host: JsxStyleHostMatch,
	context: AdapterParseContext,
): boolean => {
	if (
		host.styleAttributes.length > 0 ||
		!isChakraSourceHost(host, context) ||
		hasChakraNativeHostBlockedProp(host, context)
	)
		return false;
	const component = chakraSourceComponentName(host, context);
	return component !== undefined && Object.hasOwn(CHAKRA_HOST_DEFAULTS, component);
};

function replaceChakraClassAttribute(
	code: string,
	binding: string | undefined,
	emittedExpression: string,
): string | undefined {
	if (binding !== undefined) {
		const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const match = new RegExp(`\\sclassName\\s*=\\s*\\{\\s*${escapedBinding}\\s*\\}`, "u").exec(
			code,
		);
		return match === null
			? undefined
			: `${code.slice(0, match.index)} css={${emittedExpression}}${code.slice(match.index + match[0].length)}`;
	}
	const match = /\sclassName\s*=\s*\{/u.exec(code);
	if (match === null) return undefined;
	const open = match.index + match[0].lastIndexOf("{");
	const block = SourcePass.matchBlock(code, open);
	if (block === null) return undefined;
	return `${code.slice(0, match.index)} css={${emittedExpression}}${code.slice(block.end)}`;
}

function rewriteChakraStyleHost({
	code,
	program,
	emittedExpression,
}: {
	readonly code: string;
	readonly program: StyleProgram;
	readonly emittedExpression: string;
}): {
	readonly code: string;
	readonly imports: readonly string[];
	readonly residuals: readonly import("../semantic-ir.ts").StyleProgramResidual[];
} {
	const openingTag = program.source?.hostOpenTag;
	if (openingTag === undefined) return { code, imports: [], residuals: [] };
	let host = openingTag;
	for (const attribute of program.source?.hostStyleAttributes ?? []) {
		const index = host.indexOf(attribute);
		if (index < 0) continue;
		const whitespace = index > 0 && /[ \t]/u.test(host[index - 1]!) ? 1 : 0;
		host = `${host.slice(0, index - whitespace)}${host.slice(index + attribute.length)}`;
	}
	const insertion = /\/\s*>$/u.test(host) ? host.length - 2 : host.length - 1;
	host = `${host.slice(0, insertion)} css={${emittedExpression}}${host.slice(insertion)}`;
	const index = code.indexOf(openingTag);
	if (index < 0)
		return {
			code,
			imports: [],
			residuals: [
				{
					kind: "host-framework",
					text: openingTag,
					hint: "Chakra css-prop projection could not locate the source host",
				},
			],
		};
	const replaced = `${code.slice(0, index)}${host}${code.slice(index + openingTag.length)}`;
	const qualified = qualifyChakraIntrinsicHost(replaced, host);
	return { ...qualified, residuals: [] };
}

function rewriteChakraClassHost({
	code,
	binding,
	program,
	emittedExpression,
}: {
	readonly code: string;
	readonly binding?: string;
	readonly program: StyleProgram;
	readonly emittedExpression: string;
}): {
	readonly code: string;
	readonly imports: readonly string[];
	readonly residuals: readonly import("../semantic-ir.ts").StyleProgramResidual[];
} {
	const replaced = replaceChakraClassAttribute(code, binding, emittedExpression);
	if (replaced === undefined)
		return {
			code,
			imports: [],
			residuals: [
				{
					kind: "host-framework",
					text: binding ?? program.source?.hostOpenTag ?? emittedExpression,
					hint: "Chakra css-prop projection could not locate a simple className binding",
				},
			],
		};
	const qualified =
		program.source?.hostOpenTag === undefined
			? qualifyFirstChakraIntrinsicHost(replaced)
			: qualifyChakraIntrinsicHost(replaced, program.source.hostOpenTag);
	return { ...qualified, residuals: [] };
}

function rewriteChakraStyledSubject({
	code,
	binding,
	tag,
	framework,
	emittedExpression,
	attrsExpression,
}: {
	readonly code: string;
	readonly binding: string;
	readonly tag: string;
	readonly framework: string;
	readonly emittedExpression: string;
	readonly attrsExpression?: string;
}): {
	readonly code: string;
	readonly imports: readonly string[];
	readonly residuals: readonly import("../semantic-ir.ts").StyleProgramResidual[];
} {
	if (framework !== BuiltinHostFramework.React && framework !== BuiltinHostFramework.Preact)
		return {
			code,
			imports: [],
			residuals: [
				{
					kind: "host-framework",
					text: binding,
					hint: `Chakra factory projection requires ${BuiltinHostFramework.React} or ${BuiltinHostFramework.Preact}`,
				},
			],
		};
	const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const assignment = new RegExp(`\\b(const|let|var)\\s+${escapedBinding}\\s*=\\s*[^;]+;`).exec(
		code,
	);
	if (assignment === null)
		return {
			code,
			imports: [],
			residuals: [
				{
					kind: "host-framework",
					text: binding,
					hint: "Chakra factory projection could not locate the styled subject declaration",
				},
			],
		};
	const attrsValue = componentAttrsValueExpression(attrsExpression);
	if (attrsExpression !== undefined && attrsValue === undefined)
		return {
			code,
			imports: [],
			residuals: [
				{
					kind: "host-framework",
					text: attrsExpression,
					hint: "Chakra component projection requires static attrs or a props callback",
				},
			],
		};
	const declaration =
		attrsExpression === undefined
			? `${assignment[1]} ${binding} = (props) => <chakra.${tag} {...props} css={${emittedExpression}} />;`
			: `${assignment[1]} ${binding} = (props) => { const attrs = ${attrsValue}; const { as: attrsAs, ...attrsProps } = attrs; const { as: propsAs, ...rest } = props; return <chakra.${tag} as={attrsAs ?? propsAs} {...rest} {...attrsProps} className={[props.className, attrs.className].filter(Boolean).join(" ")} style={{ ...props.style, ...attrs.style }} css={${emittedExpression}} />; };`;
	return {
		code: `${code.slice(0, assignment.index)}${declaration}${code.slice(assignment.index + assignment[0].length)}`,
		imports: ['import { chakra } from "@chakra-ui/react";'],
		residuals: [],
	};
}

export function createChakraAdapter(
	options: { readonly moduleLoader?: ProjectModuleLoader | null } = {},
) {
	const moduleLoader = options.moduleLoader === null ? undefined : options.moduleLoader;
	const adapter = defineCodemodAdapter({
		id: CodemodAdapterId.ChakraUi,
		officialApi: {
			pluginSystems: ["presets", "recipes", "slot-recipes", "conditions", "globalCss"],
			compilerIntegrations: ["@chakra-ui/react"],
			ssrHooks: ["ChakraProvider"],
		},
		patterns: [
			{
				name: "chakra-unsupported-grid-columns",
				regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
				form: CodemodCallPatternFormTag.JsxStyle,
				styleProps: [],
				matchWithoutStyleProps: true,
				hostGuard: isUnsupportedChakraGridColumnsHost,
				transform: (program) => ({
					...program,
					residuals: [
						...program.residuals,
						{
							kind: StyleProgramResidualKindTag.Component,
							text: program.source?.hostOpenTag ?? "Chakra component host",
							hint: "Chakra Grid has no columns prop; choose SimpleGrid or templateColumns explicitly",
						},
					],
				}),
			},
			{
				name: "chakra-style-props",
				regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
				form: CodemodCallPatternFormTag.JsxStyle,
				styleProps: (context) => chakraSourceVocabulary(context).styleProps,
				hostGuard: isChakraSourceHost,
				preserveHostStyleProps: (host) => [
					...preserveSeparatorGap(host),
					...preserveNextImageFill(host),
				],
			},
			{
				name: "chakra-layout-host-defaults",
				regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
				form: CodemodCallPatternFormTag.JsxStyle,
				styleProps: [],
				matchWithoutStyleProps: true,
				hostGuard: isChakraLayoutHostWithoutStyles,
				transform: (program, context) => applyChakraHostDefaults(program, context),
			},
			{
				name: "chakra-unprojected-component-host",
				regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
				form: CodemodCallPatternFormTag.JsxStyle,
				styleProps: [],
				matchWithoutStyleProps: true,
				hostGuard: isUnprojectedChakraHost,
			},
			{
				name: "chakra-native-host",
				regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
				form: CodemodCallPatternFormTag.JsxStyle,
				styleProps: [],
				matchWithoutStyleProps: true,
				hostGuard: isChakraNativeHost,
			},
			// Chakra documents system.css as an interop/source form. Target output
			// uses the public css prop or chakra factory instead of putting its style
			// object into className.
			{
				name: "chakra-system-css",
				regex: /\b(?:system|defaultSystem|chakraSystem)\.css\s*\(\s*\{/g,
				form: CodemodCallPatternFormTag.Object,
			},
			{
				name: "chakra-recipe",
				regex: /\bdefineRecipe\s*\(\s*\{/g,
				form: CodemodCallPatternFormTag.Object,
				transform: (program) => compositionResidual(program, "defineRecipe"),
			},
			{
				name: "chakra-slot-recipe",
				regex: /\bdefineSlotRecipe\s*\(\s*\{/g,
				form: CodemodCallPatternFormTag.Object,
				transform: (program) => compositionResidual(program, "defineSlotRecipe"),
			},
			{
				name: "chakra-cva",
				regex: /\b(?:system|defaultSystem|chakraSystem)\.cva\s*\(\s*\{/g,
				form: CodemodCallPatternFormTag.Object,
				transform: (program) => compositionResidual(program, "system.cva"),
			},
			{
				name: "chakra-sva",
				regex: /\b(?:system|defaultSystem|chakraSystem)\.sva\s*\(\s*\{/g,
				form: CodemodCallPatternFormTag.Object,
				transform: (program) => compositionResidual(program, "system.sva"),
			},
			{
				name: "chakra-factory-styles",
				regex: /\bchakra\s*\(\s*(?:["'][^"']+["']|[A-Za-z_$][\w$]*)\s*,\s*\{/g,
				form: CodemodCallPatternFormTag.Object,
				transform: (program) => compositionResidual(program, "chakra factory styles"),
			},
			{
				name: "chakra-use-recipe",
				regex: /\buseRecipe\s*\(\s*[A-Za-z_$][\w$]*\s*\)/g,
				form: CodemodCallPatternFormTag.Residual,
				residual: {
					kind: StyleProgramResidualKindTag.Composition,
					hint: "Chakra recipe usage requires explicit variant/component lowering",
				},
			},
			{
				name: "chakra-use-slot-recipe",
				regex: /\buseSlotRecipe\s*\(\s*[A-Za-z_$][\w$]*\s*\)/g,
				form: CodemodCallPatternFormTag.Residual,
				residual: {
					kind: StyleProgramResidualKindTag.Composition,
					hint: "Chakra slot recipe usage requires explicit variant/component lowering",
				},
			},
		],
		packages: CodemodAdapterKit.dependency("@chakra-ui/react", "peer"),
		capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.ChakraUi, "partial", {
			"custom-properties": "exact",
			"theme-context": "partial",
			"runtime-context": "partial",
			"framework-semantics": "partial",
			components: "partial",
		}),
		detect: (_context, fallback) => fallback(),
		namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
		migration: {
			rewrite: ({ source, code, file, targetId, sourceConfig, project, complete }) => {
				if (targetId !== CodemodAdapterId.Pandwind) return { code, residuals: [] };
				const variableRewrite = rewriteOwnedChakraCssVariables(code, sourceConfig);
				const typeRewrite = rewriteChakraTypeReferences(
					variableRewrite.code,
					source,
					file,
					project,
				);
				return {
					code:
						complete && variableRewrite.residuals.length === 0
							? removeUnusedChakraSystemBootstrap(typeRewrite.code)
							: typeRewrite.code,
					imports: typeRewrite.imports,
					residuals: variableRewrite.residuals,
				};
			},
			targetPolicy: {
				handlesHostRewrites: true,
				handlesFrameworkSemantics: true,
				hostContextRequiredHint:
					"Chakra css props require an intrinsic Chakra factory host or a Chakra-owned component",
				hostRepresentation: StyleHostRepresentationKind.StyleProp,
				hostFrameworks: [BuiltinHostFramework.React, BuiltinHostFramework.Preact],
				handlesSourceHostAttributes: true,
				handlesDynamicValues: true,
				rewriteHost: ({ code, binding, program, emittedExpression }) => {
					const hasStyleAttributes = (program.source?.hostStyleAttributes?.length ?? 0) > 0;
					return hasStyleAttributes
						? rewriteChakraStyleHost({ code, program, emittedExpression })
						: rewriteChakraClassHost({
								code,
								binding,
								program,
								emittedExpression,
							});
				},
				rewriteComponent: ({ code, binding, tag, framework, emittedExpression, attrsExpression }) =>
					rewriteChakraStyledSubject({
						code,
						binding,
						tag,
						framework,
						emittedExpression,
						attrsExpression,
					}),
				resolveHostRepresentation: ({ framework, hasHostContext, program, source }) => {
					if (!hasHostContext && program.source?.subject === undefined) return undefined;
					const openingTag = program.source?.hostOpenTag;
					if (openingTag !== undefined && !isChakraOwnedHost(source ?? "", openingTag))
						return undefined;
					return framework === undefined ||
						framework === BuiltinHostFramework.React ||
						framework === BuiltinHostFramework.Preact
						? StyleHostRepresentationKind.StyleProp
						: undefined;
				},
			},
		},
		detectPatterns: [/@chakra-ui\/react/, /<(?:(?:Box|Flex|Stack|Text|Button)(?:\s|>))/],
		sourceModules: CHAKRA_SOURCE_MODULES,
		sourceModuleMatchers: [isChakraSourceModule],
		sourceModulesToRemove: (targetId) =>
			targetId === CodemodAdapterId.Pandwind ? CHAKRA_SOURCE_MODULES : [],
		configFiles: ["package.json", "chakra.config.ts", "theme.ts"],
		tokenPolicy: CHAKRA_TOKEN_POLICY,
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) =>
						officialChakraConfig(context, moduleLoader),
				}),
		sourceObjectOptions: (source, context) => {
			const vocabulary = chakraSourceVocabulary(context);
			return {
				...(() => {
					const conditionValues: Record<string, string> = {};
					const conditionKinds: Record<string, SemanticConditionKind> = {};
					for (const [name, value] of Object.entries(context.config.conditionCatalog ?? {})) {
						if (typeof value !== "string") continue;
						const normalized = name.replace(/^_/, "");
						conditionValues[normalized] = sourceConditionValue(value);
						conditionKinds[normalized] = inferSemanticConditionKind(value);
					}
					return { conditionKinds, conditionValues };
				})(),
				propertyAliases: vocabulary.propertyAliases,
				objectReferences: objectReferences(source),
				unwrapNestedObjectKeys: ["css"],
				propertyValueConditions: true,
				valueTransforms: Object.fromEntries(
					vocabulary.valueTransformProperties.map((property) => [
						property,
						(value: StyleValue) =>
							chakraOfficialValue(
								valueTransformPropertyFrom(vocabulary.propertyAliases, property),
								value,
								context,
							),
					]),
				),
			};
		},
		emit(program, { programObject }, context) {
			const outputProgram = normalizeChakraEmissionProgram(program);
			const unsupportedRule = program.rules.some((rule) => rule.kind !== StyleRuleKindTag.Style);
			const unsupportedKeyframesCondition = program.rules.some((rule) =>
				rule.declarations.some((declaration) =>
					declaration.conditions.some((condition) => /^@keyframes\b/u.test(condition.name)),
				),
			);
			if (unsupportedRule || unsupportedKeyframesCondition)
				return {
					text: "",
					residuals: [
						{
							kind: "rule-level",
							text: unsupportedRule
								? program.rules.map((rule) => rule.kind).join(", ")
								: program.rules
										.flatMap((rule) =>
											rule.declarations.flatMap((declaration) =>
												declaration.conditions
													.filter((condition) => /^@keyframes\b/u.test(condition.name))
													.map((condition) => condition.name),
											),
										)
										.join(", "),
							hint: unsupportedKeyframesCondition
								? "Chakra keyframes require an explicit target keyframes API"
								: "Chakra standalone css projection supports style rules only",
						},
					],
				};
			const object = programObject(outputProgram);
			const expression =
				context?.host?.representation === undefined ? `defaultSystem.css(${object})` : object;
			return {
				text: expression,
				...(context?.host?.representation === undefined
					? { imports: ['import { defaultSystem } from "@chakra-ui/react";'] }
					: {}),
				semantic: outputProgram,
			};
		},
	});
	return {
		...adapter,
		parse(source: string, context: AdapterParseContext) {
			const parsed = adapter.parse(source, context);
			return {
				...parsed,
				matches: parsed.matches.map((match) => {
					if (context.targetId !== CodemodAdapterId.Pandwind)
						return { ...match, program: lowerChakraDeclarations(match.program, context) };
					return {
						...match,
						program: lowerChakraProgram(
							applyChakraHostDefaults(
								canonicalizeSourceHost(
									match.program,
									chakraSourceComponentsForContext(context),
									"Chakra",
								),
								context,
							),
							context,
						),
					};
				}),
			};
		},
	};
}
