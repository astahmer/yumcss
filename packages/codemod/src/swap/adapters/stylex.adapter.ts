import { CodemodCallPatternFormTag } from "../identifiers.ts";
import { StyleRuleKindTag, StyleValueKindTag } from "../semantic-ir.ts";
import { StyleProgramResidualKindTag } from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import type { StyleProgram, StyleValue } from "../semantic-ir.ts";
import type { StyleLowering } from "../lowering.ts";
import { STYLE_LOWERING_SCHEMA } from "../lowering.ts";
import type { AdapterParseContext } from "../adapter-contract.ts";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { SourcePass } from "../../source-pass-utils.ts";
import type { OxcNode } from "pandwind/tw/literal";
import { parseObjectLiteral } from "../parse.ts";
import {
	CodemodAdapterId,
	CodemodCallPatternKindTag,
	CodemodPatternId,
	StyleProgramConditionOrder,
	StyleProgramEmissionHint,
	StyleHostRepresentationKind,
	StyleLoweringId,
} from "../identifiers.ts";
import {
	BuiltinHostFramework,
	canConvertStaticVueSfc,
	rewriteVueSfcToJsx,
} from "../host-adapters.ts";

function generatedCssBinding(source: string): string {
	if (/\bimport\s+css\s+from\b/.test(source) && !/\b(?:const|let|var)\s+targetCss\b/.test(source))
		return "targetCss";
	for (const candidate of ["css", "targetCss", "pwCss"]) {
		const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (!new RegExp(`\\b(?:const|let|var|import)\\s+(?:default\\s+)?${escaped}\\b`).test(source))
			return candidate;
	}
	return "targetCss";
}

function staticImports(binding: string): readonly string[] {
	return ['import { createCss } from "pandwind/css";', `const ${binding} = createCss();`];
}

function moveStyleAfterPropsSpread(code: string, binding: string): string {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const styleAttribute = /\bstyle\s*=\s*\{/g;
	const propsSpread = new RegExp(`\\{\\s*\\.\\.\\.${binding}\\.props\\(`, "g");
	for (const match of code.matchAll(styleAttribute)) {
		const styleStart = match.index ?? 0;
		const open = styleStart + match[0].lastIndexOf("{");
		const styleBlock = SourcePass.matchBlock(code, open);
		if (styleBlock === null) continue;
		const spreadSearch = new RegExp(propsSpread.source, "g");
		spreadSearch.lastIndex = styleBlock.end;
		const spreadMatch = spreadSearch.exec(code);
		if (spreadMatch === null) continue;
		const spreadStart = spreadMatch.index;
		const spreadBlock = SourcePass.matchBlock(code, spreadStart);
		if (spreadBlock === null) continue;
		const between = code.slice(styleBlock.end, spreadStart);
		if (between.trim() !== "") continue;
		edits.push({
			start: styleStart,
			end: spreadBlock.end,
			text: `${code.slice(spreadStart, spreadBlock.end)}${between}${code.slice(styleStart, styleBlock.end)}`,
		});
	}
	for (const edit of edits.toReversed())
		code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
	return code;
}

/**
 * JSX applies later attributes after object spreads. StyleX's transform merges
 * its generated class with an existing `className`; a plain Pandwind spread
 * would otherwise be overwritten by the later attribute. Keep that host
 * contract explicit in the migrated source so CSS-module and user classes
 * remain additive.
 */
function mergeClassNameAfterPropsSpread(code: string, binding: string): string {
	const edits: Array<{ start: number; end: number; text: string }> = [];
	const spread = new RegExp(`\\{\\s*\\.\\.\\.${binding}\\.props\\(`, "g");
	for (const match of code.matchAll(spread)) {
		const spreadStart = match.index ?? 0;
		const spreadBlock = SourcePass.matchBlock(code, spreadStart);
		if (spreadBlock === null) continue;
		const tagEnd = code.indexOf(">", spreadBlock.end);
		if (tagEnd < 0) continue;
		const classNameMatch = /\bclassName\s*=\s*\{/g;
		classNameMatch.lastIndex = spreadBlock.end;
		const className = classNameMatch.exec(code);
		if (className === null || className.index >= tagEnd) continue;
		const classBlock = SourcePass.matchBlock(code, className.index + className[0].lastIndexOf("{"));
		if (classBlock === null || classBlock.end > tagEnd) continue;
		const classBodyStart = className.index + className[0].lastIndexOf("{") + 1;
		const spreadText = code.slice(spreadStart, spreadBlock.end);
		const propsStart = spreadText.indexOf(".props(");
		const propsEnd = spreadText.lastIndexOf(")");
		if (propsStart < 0 || propsEnd <= propsStart) continue;
		const styleExpression = spreadText.slice(propsStart + ".props(".length, propsEnd).trim();
		const classExpression = classBlock.body.trim();
		if (styleExpression === "" || classExpression === "") continue;
		edits.push({
			start: classBodyStart,
			end: classBlock.end - 1,
			text: `[${binding}.props(${styleExpression}).className, ${classExpression}].filter(Boolean).join(" ")`,
		});
	}
	for (const edit of edits.toReversed())
		code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
	return code;
}

function findJsxTagEnd(source: string, start: number): number | undefined {
	let quote: string | undefined;
	let braces = 0;
	for (let index = start; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === quote && source[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === "'" || character === '"' || character === "`") {
			quote = character;
			continue;
		}
		if (character === "{") {
			braces++;
			continue;
		}
		if (character === "}" && braces > 0) {
			braces--;
			continue;
		}
		if (character === ">" && braces === 0) return index;
	}
	return undefined;
}

function isRuntimeStyleXCarrier(expression: string): boolean {
	return /\b(?:dynamic|stylex)\s*(?:\.|\(|\[)/.test(expression);
}

function rewriteStaticXstyleHosts(source: string, binding: string): string {
	const excluded = SourcePass.computeExcludedRanges(source, "pandwind-stylex-hosts.tsx");
	const edits: Array<{ start: number; end: number; text: string }> = [];
	for (const match of source.matchAll(/\bxstyle\s*=\s*\{/g)) {
		const attributeStart = match.index ?? 0;
		if (excluded.isExcluded(attributeStart)) continue;
		const open = attributeStart + match[0].lastIndexOf("{");
		const value = SourcePass.matchBlock(source, open);
		if (value === null || isRuntimeStyleXCarrier(value.body)) continue;
		const tagStart = source.lastIndexOf("<", attributeStart);
		if (tagStart < 0 || source.slice(tagStart, attributeStart).includes(">")) continue;
		const tagEnd = findJsxTagEnd(source, tagStart);
		if (tagEnd === undefined || tagEnd < value.end) continue;
		const tag = source.slice(tagStart, tagEnd + 1);
		const expression = value.body.trim();
		if (expression === "") continue;

		const localAttributeEnd = value.end;
		const className = /\bclassName\s*=\s*(\{)/.exec(tag);
		if (className !== null) {
			const classOpen = tagStart + className.index + className[0].lastIndexOf("{");
			const classBlock = SourcePass.matchBlock(source, classOpen);
			if (classBlock === null || classBlock.end > tagEnd) continue;
			const classExpression = classBlock.body.trim();
			if (classExpression === "") continue;
			edits.push({
				start: classOpen + 1,
				end: classBlock.end - 1,
				text: `[${binding}.props(${expression}).className, ${classExpression}].filter(Boolean).join(" ")`,
			});
			edits.push({
				start: attributeStart,
				end: localAttributeEnd,
				text: "",
			});
			continue;
		}
		const staticClassName = /\bclassName\s*=\s*(["'])([^"']*)\1/.exec(tag);
		if (staticClassName !== null) {
			const classStart = tagStart + staticClassName.index;
			const classEnd = classStart + staticClassName[0].length;
			edits.push({
				start: classStart,
				end: classEnd,
				text: `className={[${binding}.props(${expression}).className, ${JSON.stringify(staticClassName[2]!.trim())}].filter(Boolean).join(" ")}`,
			});
			edits.push({
				start: attributeStart,
				end: localAttributeEnd,
				text: "",
			});
			continue;
		}
		edits.push({
			start: attributeStart,
			end: localAttributeEnd,
			text: `className={${binding}.props(${expression}).className}`,
		});
	}
	return SourcePass.applyEdits(source, edits);
}

function stylexWhenCondition(expression: string): string | undefined {
	const when = expression.match(
		/^stylex\.when\.(ancestor|descendant|siblingBefore|siblingAfter|anySibling)\(\s*(['"])([^'"]+)\2\s*(?:,\s*([A-Za-z_$][\w$]*))?\s*\)$/,
	);
	if (when?.[1] === undefined || when[3] === undefined) return undefined;
	const marker = when[4] === undefined ? "pw-default-marker" : `pw-marker-${when[4]}`;
	const pseudo = `${marker}${when[3]}`;
	return when[1] === "ancestor"
		? `:where(.${pseudo} *) &`
		: when[1] === "descendant"
			? `&:where(:has(.${pseudo}))`
			: when[1] === "siblingBefore"
				? `:where(.${pseudo} ~ *) &`
				: when[1] === "siblingAfter"
					? `&:where(:has(~ .${pseudo}))`
					: `:where(.${pseudo} ~ *, :has(~ .${pseudo})) &`;
}

function stylexConditionValues(source: string): Readonly<Record<string, string>> {
	const definitions = new Map<string, string>();
	for (const match of source.matchAll(
		/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])([\s\S]*?)\2\s*;?/g,
	))
		definitions.set(match[1]!, match[3]!);
	const resolving = new Set<string>();
	const resolve = (name: string): string | undefined => {
		const value = definitions.get(name);
		if (value === undefined || resolving.has(name)) return value;
		resolving.add(name);
		const resolved = value.replace(
			/\$\{([A-Za-z_$][\w$]*)\}/g,
			(match, reference: string) => resolve(reference) ?? match,
		);
		resolving.delete(name);
		return resolved;
	};
	return Object.fromEntries(
		[...definitions.keys()]
			.map((name) => [name, resolve(name)])
			.filter((entry): entry is [string, string] => entry[1]?.startsWith("@") === true),
	);
}

export interface StyleXImportedReferenceResolver {
	importedScope(file: string, program: OxcNode): ReadonlyMap<string, unknown>;
}

function importedStyleReferences(
	context: AdapterParseContext,
	resolver: StyleXImportedReferenceResolver | undefined,
): Readonly<Record<string, string>> {
	if (resolver === undefined) return {};
	if (!context.file.startsWith("/") && context.root === undefined) return {};
	try {
		const parsed = SOURCE_SCANNER_SERVICE.parse({
			file: context.file,
			source: context.source,
			language: SOURCE_SCANNER_SERVICE.languageForFile(context.file),
		});
		const scope = resolver.importedScope(context.file, parsed.program as unknown as OxcNode);
		const references: Record<string, string> = {};
		for (const [binding, value] of scope) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
			for (const [key, child] of Object.entries(value)) {
				if (typeof child !== "string" && typeof child !== "number") continue;
				references[`${binding}.${key}`] = String(child);
				references[`${binding}['${key}']`] = String(child);
				references[`${binding}["${key}"]`] = String(child);
			}
		}
		return references;
	} catch {
		return {};
	}
}

export function createStyleXSourceObjectOptions(
	source: string,
	context: AdapterParseContext,
	resolver: StyleXImportedReferenceResolver | undefined,
	apiName = "stylex",
) {
	const conditionValues = stylexConditionValues(source);
	const computedKeys = Object.fromEntries([
		...[...source.matchAll(/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\b/g)].map((match) => [
			`${match[1]}.${match[2]}`,
			`--${match[2]}`,
		]),
		...[...source.matchAll(/\b([A-Za-z_$][\w$]*)\[(['"])(--[^'"]+)\2\]/g)].map((match) => [
			match[0],
			match[3],
		]),
	]);
	const dynamicReferences: Record<string, string> = {
		...stylexVariableReferences(source, apiName),
		...importedStyleReferences(context, resolver),
	};
	return {
		conditionValues,
		namedRuleObjects: true,
		computedKeys,
		computedKeyResolver: stylexWhenCondition,
		propertyValueConditions: true,
		propertyValueConditionNames: STYLEX_PROPERTY_NAMES,
		preserveDefaultGroup: true,
		canonicalization: {
			ignoredConditions: [{ kind: "named" as const, name: "base" }],
			conditionalOrder: StyleProgramConditionOrder.Depth,
		},
		valueTransforms: { "*": stylexNumericValue },
		dynamicReferences,
	};
}

function stylexVariableReferences(
	source: string,
	apiName: string,
): Readonly<Record<string, string>> {
	const references: Record<string, string> = {};
	const escapedApiName = apiName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	for (const match of source.matchAll(
		new RegExp(
			`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escapedApiName}\\.defineVars\\s*\\(`,
			"g",
		),
	)) {
		const binding = match[1];
		if (binding === undefined) continue;
		const open = source.indexOf("{", (match.index ?? 0) + match[0].length);
		if (open < 0) continue;
		const block = SourcePass.matchBlock(source, open);
		if (block === null) continue;
		const variables = parseObjectLiteral(block.body);
		for (const entry of variables?.keys ?? [])
			references[`${binding}.${entry.key}`] = `var(--${entry.key})`;
	}
	return references;
}

export interface StyleXAdapterOptions {
	readonly crossModuleResolver?: StyleXImportedReferenceResolver;
}

const STYLEX_UNITLESS_PROPERTIES = new Set([
	"animationIterationCount",
	"aspectRatio",
	"borderImageOutset",
	"borderImageSlice",
	"borderImageWidth",
	"boxFlex",
	"boxFlexGroup",
	"boxOrdinalGroup",
	"columnCount",
	"columns",
	"flex",
	"flexGrow",
	"flexNegative",
	"flexOrder",
	"flexPositive",
	"flexShrink",
	"fontWeight",
	"gridArea",
	"gridColumn",
	"gridColumnEnd",
	"gridColumnSpan",
	"gridColumnStart",
	"gridRow",
	"gridRowEnd",
	"gridRowSpan",
	"gridRowStart",
	"lineClamp",
	"lineHeight",
	"opacity",
	"order",
	"orphans",
	"tabSize",
	"widows",
	"zIndex",
	"zoom",
	"WebkitLineClamp",
	"fillOpacity",
	"floodOpacity",
	"stopOpacity",
	"strokeDasharray",
	"strokeDashoffset",
	"strokeMiterlimit",
	"strokeOpacity",
	"strokeWidth",
	"scale",
]);

// StyleX permits a nested condition object both as a named style (for example
// `focusRing: { ':focus-visible': ... }`) and as a property value (for example
// `color: { default: ..., ':hover': ... }`). The parser needs the adapter's
// CSS-property vocabulary to distinguish those two shapes without guessing
// from arbitrary user-defined style names.
const STYLEX_PROPERTY_NAMES = new Set([
	...STYLEX_UNITLESS_PROPERTIES,
	"accentColor",
	"alignContent",
	"alignItems",
	"alignSelf",
	"all",
	"animation",
	"animationDirection",
	"animationDuration",
	"animationFillMode",
	"animationName",
	"animationPlayState",
	"animationTimingFunction",
	"appearance",
	"aspectRatio",
	"backdropFilter",
	"backfaceVisibility",
	"background",
	"backgroundAttachment",
	"backgroundBlendMode",
	"backgroundClip",
	"backgroundColor",
	"backgroundImage",
	"backgroundOrigin",
	"backgroundPosition",
	"backgroundPositionX",
	"backgroundPositionY",
	"backgroundRepeat",
	"backgroundSize",
	"blockSize",
	"border",
	"borderBlock",
	"borderBlockColor",
	"borderBlockEnd",
	"borderBlockEndColor",
	"borderBlockEndStyle",
	"borderBlockEndWidth",
	"borderBlockStart",
	"borderBlockStartColor",
	"borderBlockStartStyle",
	"borderBlockStartWidth",
	"borderBlockStyle",
	"borderBlockWidth",
	"borderBottom",
	"borderBottomColor",
	"borderBottomLeftRadius",
	"borderBottomRightRadius",
	"borderBottomStyle",
	"borderBottomWidth",
	"borderCollapse",
	"borderColor",
	"borderEndEndRadius",
	"borderEndStartRadius",
	"borderInline",
	"borderInlineColor",
	"borderInlineEnd",
	"borderInlineEndColor",
	"borderInlineEndStyle",
	"borderInlineEndWidth",
	"borderInlineStart",
	"borderInlineStartColor",
	"borderInlineStartStyle",
	"borderInlineStartWidth",
	"borderInlineStyle",
	"borderInlineWidth",
	"borderLeft",
	"borderLeftColor",
	"borderLeftStyle",
	"borderLeftWidth",
	"borderRadius",
	"borderRight",
	"borderRightColor",
	"borderRightStyle",
	"borderRightWidth",
	"borderSpacing",
	"borderStyle",
	"borderTop",
	"borderTopColor",
	"borderTopLeftRadius",
	"borderTopRightRadius",
	"borderTopStyle",
	"borderTopWidth",
	"borderWidth",
	"bottom",
	"boxDecorationBreak",
	"boxShadow",
	"boxSizing",
	"breakAfter",
	"breakBefore",
	"breakInside",
	"captionSide",
	"caretColor",
	"clear",
	"clip",
	"clipPath",
	"color",
	"colorScheme",
	"columnCount",
	"columnFill",
	"columnGap",
	"columnRule",
	"columnRuleColor",
	"columnRuleStyle",
	"columnRuleWidth",
	"columnSpan",
	"columnWidth",
	"columns",
	"contain",
	"content",
	"cursor",
	"direction",
	"display",
	"emptyCells",
	"filter",
	"flex",
	"flexBasis",
	"flexDirection",
	"flexFlow",
	"flexGrow",
	"flexShrink",
	"flexWrap",
	"float",
	"font",
	"fontFamily",
	"fontFeatureSettings",
	"fontKerning",
	"fontSize",
	"fontSizeAdjust",
	"fontStretch",
	"fontStyle",
	"fontVariant",
	"fontVariationSettings",
	"fontWeight",
	"gap",
	"grid",
	"gridArea",
	"gridAutoColumns",
	"gridAutoFlow",
	"gridAutoRows",
	"gridColumn",
	"gridColumnEnd",
	"gridColumnGap",
	"gridColumnStart",
	"gridGap",
	"gridRow",
	"gridRowEnd",
	"gridRowGap",
	"gridRowStart",
	"gridTemplate",
	"gridTemplateAreas",
	"gridTemplateColumns",
	"gridTemplateRows",
	"height",
	"hyphens",
	"inset",
	"insetBlock",
	"insetBlockEnd",
	"insetBlockStart",
	"insetInline",
	"insetInlineEnd",
	"insetInlineStart",
	"isolation",
	"justifyContent",
	"justifyItems",
	"justifySelf",
	"left",
	"letterSpacing",
	"lineBreak",
	"lineClamp",
	"lineHeight",
	"listStyle",
	"margin",
	"marginBlock",
	"marginBlockEnd",
	"marginBlockStart",
	"marginBottom",
	"marginInline",
	"marginInlineEnd",
	"marginInlineStart",
	"marginLeft",
	"marginRight",
	"marginTop",
	"maxBlockSize",
	"maxHeight",
	"maxInlineSize",
	"maxWidth",
	"minBlockSize",
	"minHeight",
	"minInlineSize",
	"minWidth",
	"objectFit",
	"objectPosition",
	"opacity",
	"order",
	"outline",
	"outlineColor",
	"outlineOffset",
	"outlineStyle",
	"outlineWidth",
	"overflow",
	"overflowAnchor",
	"overflowBlock",
	"overflowInline",
	"overflowWrap",
	"overflowX",
	"overflowY",
	"padding",
	"paddingBlock",
	"paddingBlockEnd",
	"paddingBlockStart",
	"paddingBottom",
	"paddingInline",
	"paddingInlineEnd",
	"paddingInlineStart",
	"paddingLeft",
	"paddingRight",
	"paddingTop",
	"placeContent",
	"placeItems",
	"placeSelf",
	"pointerEvents",
	"position",
	"resize",
	"right",
	"rotate",
	"rowGap",
	"scrollBehavior",
	"scrollMargin",
	"scrollPadding",
	"scrollSnapAlign",
	"scrollSnapType",
	"tabSize",
	"tableLayout",
	"textAlign",
	"textDecoration",
	"textDecorationColor",
	"textDecorationLine",
	"textDecorationStyle",
	"textDecorationThickness",
	"textIndent",
	"textOverflow",
	"textRendering",
	"textShadow",
	"textTransform",
	"textUnderlineOffset",
	"top",
	"transform",
	"transformOrigin",
	"transition",
	"transitionDelay",
	"transitionDuration",
	"transitionProperty",
	"transitionTimingFunction",
	"translate",
	"userSelect",
	"verticalAlign",
	"visibility",
	"whiteSpace",
	"width",
	"wordBreak",
	"wordSpacing",
	"wordWrap",
	"writingMode",
	"zIndex",
]);

function stylexNumericValue(value: StyleValue, property?: string): StyleValue {
	const numeric =
		value.kind === StyleValueKindTag.Literal && typeof value.value === "number"
			? value.value
			: value.kind === StyleValueKindTag.Dynamic
				? evaluateNumericExpression(value.expression)
				: undefined;
	if (numeric === undefined || !Number.isFinite(numeric)) return value;
	if (STYLEX_UNITLESS_PROPERTIES.has(property ?? "")) return { kind: "literal", value: numeric };
	return { kind: "literal", value: `${numeric}px` };
}

const stylexNumericLowering: StyleLowering = {
	schema: STYLE_LOWERING_SCHEMA,
	id: StyleLoweringId.StyleXNumericNormalization,
	apply: ({ program, target }) => {
		if (target.adapter !== CodemodAdapterId.StyleX) return { program, residuals: [], applied: [] };
		let changed = false;
		const declaration = (item: StyleProgram["declarations"][number]) => {
			const value = stylexNumericValue(item.value, item.property);
			if (value === item.value) return item;
			changed = true;
			return { ...item, value };
		};
		const rule = (item: StyleProgram["rules"][number]): StyleProgram["rules"][number] => ({
			...item,
			declarations: item.declarations.map(declaration),
			children: item.children.map(rule),
		});
		const rules = program.rules.map(rule);
		return {
			program: changed
				? { ...program, declarations: program.declarations.map(declaration), rules }
				: program,
			residuals: [],
			applied: changed ? [StyleLoweringId.StyleXNumericNormalization] : [],
		};
	},
};

function evaluateNumericExpression(expression: string): number | undefined {
	const tokens = expression.match(/\d*\.?\d+|[()+\-*/]/g);
	if (tokens === null || tokens.join("") !== expression.replace(/\s+/g, "")) return undefined;
	let index = 0;
	const peek = (): string | undefined => tokens[index];
	const consume = (): string | undefined => tokens[index++];
	const primary = (): number | undefined => {
		if (peek() === "(") {
			consume();
			const value = additive();
			if (consume() !== ")") return undefined;
			return value;
		}
		const token = consume();
		return token === undefined ? undefined : Number(token);
	};
	const multiplicative = (): number | undefined => {
		let value = primary();
		while (value !== undefined && (peek() === "*" || peek() === "/")) {
			const operator = consume();
			const right = primary();
			if (right === undefined || (operator === "/" && right === 0)) return undefined;
			value = operator === "*" ? value * right : value / right;
		}
		return value;
	};
	const additive = (): number | undefined => {
		let value = multiplicative();
		while (value !== undefined && (peek() === "+" || peek() === "-")) {
			const operator = consume();
			const right = multiplicative();
			if (right === undefined) return undefined;
			value = operator === "+" ? value + right : value - right;
		}
		return value;
	};
	const value = additive();
	return index === tokens.length ? value : undefined;
}

export function normalizeStyleXVariables(program: StyleProgram): StyleProgram {
	const root = program.rules[0];
	const variableProperty = (property: string): string =>
		property.startsWith("--") ? property : `--${property}`;
	return {
		...program,
		rules:
			root === undefined
				? program.rules
				: [
						{
							...root,
							kind: StyleRuleKindTag.Global,
							selector: ":root",
							declarations: root.declarations.map((declaration) => ({
								...declaration,
								property: variableProperty(declaration.property),
							})),
						},
						...program.rules.slice(1),
					],
		emissionHints: [...(program.emissionHints ?? []), StyleProgramEmissionHint.GlobalVariables],
	};
}

export function createStyleXAdapter(options: StyleXAdapterOptions = {}) {
	return defineCodemodAdapter({
		id: CodemodAdapterId.StyleX,
		officialApi: {
			pluginSystems: ["defineVars", "createTheme", "conditionalStyles"],
			compilerIntegrations: ["@stylexjs/babel-plugin"],
		},
		patterns: [
			{
				name: CodemodPatternId.StyleXCreate,
				regex: /\bstylex\.create\s*\(\s*\{/g,
				objectKind: "named",
			},
			{
				name: CodemodPatternId.StyleXKeyframes,
				regex: /\bstylex\.keyframes\s*\(\s*\{/g,
				kind: CodemodCallPatternKindTag.Keyframes,
			},
			{
				name: CodemodPatternId.StyleXDefineVars,
				regex: /\bstylex\.defineVars\s*\(\s*\{/g,
				transform: normalizeStyleXVariables,
			},
			{
				name: "stylex-create-theme",
				regex: /\bstylex\.createTheme\s*\(/g,
				form: CodemodCallPatternFormTag.Residual,
				residual: {
					kind: StyleProgramResidualKindTag.Configuration,
					hint: "StyleX createTheme requires variable-aware theme lowering",
				},
			},
		],
		packages: CodemodAdapterKit.dependency("@stylexjs/stylex", "peer"),
		capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.StyleX, "partial", {
			"named-conditions": "exact",
			"named-rules": "exact",
			"dynamic-values": "partial",
			composition: "partial",
			"font-face": "unsupported",
			layers: "unsupported",
			"supports-rules": "unsupported",
			"property-rules": "unsupported",
		}),
		detectPatterns: [/@stylexjs\/stylex/, /\bstylex\.create\s*\(/],
		sourceModules: ["@stylexjs/stylex"],
		configFiles: ["package.json"],
		sourceObjectOptions: (source, context) =>
			createStyleXSourceObjectOptions(source, context, options.crossModuleResolver),
		migration: {
			targetPolicy: {
				handlesHostRewrites: true,
				handlesFrameworkSemantics: true,
				hostFrameworkConversions: [
					{
						from: BuiltinHostFramework.Solid,
						to: BuiltinHostFramework.React,
						canConvert: ({ file, source }) =>
							/\.(?:jsx|tsx)$/.test(file) &&
							!/\b(?:createSignal|createMemo|createEffect)\s*\(|\bon:|\buse:|\bclass\s*=/.test(
								source,
							),
					},
					{
						from: BuiltinHostFramework.Vue,
						to: BuiltinHostFramework.React,
						canConvert: ({ file, source }) => canConvertStaticVueSfc(file, source),
						rewriteDocument: ({ code, targetFramework }) =>
							rewriteVueSfcToJsx(code, targetFramework),
					},
				],
				hostRepresentation: StyleHostRepresentationKind.Component,
				resolveHostRepresentation: ({ program, hasHostContext, framework }) => {
					if (framework !== undefined && framework !== BuiltinHostFramework.React) return undefined;
					return program.source?.subject === undefined
						? StyleHostRepresentationKind.StyleProp
						: hasHostContext
							? StyleHostRepresentationKind.StyleProp
							: StyleHostRepresentationKind.Component;
				},
				rewriteHost: ({ code, emittedExpression, binding, framework, representation }) => {
					if (representation !== StyleHostRepresentationKind.StyleProp)
						return { code, residuals: [] };
					if (framework !== undefined && framework !== BuiltinHostFramework.React)
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: emittedExpression,
									hint: `StyleX host projection requires ${BuiltinHostFramework.React}`,
								},
							],
						};
					const expression = binding ?? emittedExpression;
					const escaped = expression.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					const pattern = new RegExp(`(\\s)className\\s*=\\s*\\{\\s*${escaped}\\s*\\}`);
					if (!pattern.test(code))
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: expression,
									hint: "StyleX host projection requires an exact className binding",
								},
							],
						};
					return {
						code: code.replace(pattern, `$1{...stylex.props(${expression})}`),
						residuals: [],
					};
				},
				rewriteComponent: ({ code, binding, tag, framework, representation }) => {
					if (representation !== StyleHostRepresentationKind.StyleProp)
						return { code, residuals: [] };
					if (framework !== BuiltinHostFramework.React)
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: binding,
									hint: `StyleX component projection requires ${BuiltinHostFramework.React}`,
								},
							],
						};
					const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					const selfClosing = new RegExp(`<${escapedBinding}\\b([^<>]*?)/\\s*>`, "g");
					let found = false;
					const rewritten = code.replace(selfClosing, (_match, rawAttrs: string) => {
						found = true;
						const attrs = String(rawAttrs).trimEnd();
						if (/\b(?:className|style)\s*=/.test(attrs)) return _match;
						return `<${tag}${attrs} {...stylex.props(${binding})} />`;
					});
					if (!found || rewritten === code)
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: binding,
									hint: "StyleX component projection requires a simple self-closing host use",
								},
							],
						};
					return { code: rewritten, residuals: [] };
				},
			},
			prepareDynamic: ({ source, targetId, binding }) => ({
				handled:
					targetId === CodemodAdapterId.Pandwind &&
					binding !== undefined &&
					(new RegExp(
						`\\bstylex\\.props\\([\\s\\S]*?\\b${binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*(?:\\.|\\[)`,
					).test(source) ||
						new RegExp(
							`\\bexport\\s+(?:const|let|var)\\s+${binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*=`,
						).test(source)),
			}),
			rewrite: ({ source, code, targetId, convertedBindings }) => {
				// A file may contain both statically extractable groups and a small
				// runtime-only carrier. Rewrite the static consumers even when the
				// file remains partial; leaving `stylex.props(staticGroup)` in place
				// would type-check against the wrong compiled-style contract and would
				// make the static portion depend on the source runtime.
				if (targetId !== CodemodAdapterId.Pandwind) return { code, residuals: [] };
				let rewritten = code;
				const cssBinding = generatedCssBinding(source);
				// StyleX permits runtime-generated selector keys such as
				// `Object.fromEntries([`:nth-child(...)`, value])`; Pandwind's
				// self-selector dialect needs the explicit `&` prefix.
				rewritten = rewritten.replace(
					/(Object\.fromEntries\(\s*\[[\s\S]*?)([`"'])(?=(?:[:.]|\u005b))/g,
					"$1$2&",
				);
				rewritten = rewritten.replaceAll("stylex.defineConsts(", "(");
				rewritten = rewritten.replaceAll("stylex.types.angle(", "(");
				rewritten = rewritten.replace(
					/import\s*\{\s*type\s+StyleXStyles\s*\}\s*from\s*['"]@stylexjs\/stylex['"];?/g,
					"type StyleXStyles = any;",
				);
				rewritten = rewritten.replace(
					/import\s+type\s*,?\s*\{\s*StyleXStyles\s*\}\s*from\s*['"]@stylexjs\/stylex['"];?/g,
					"type StyleXStyles = any;",
				);
				rewritten = rewritten.replaceAll("stylex.StyleXStyles", "Record<string, string> | string");
				rewritten = rewritten.replace(
					/(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*stylex\.defineMarker\(\)/g,
					(_match, declaration: string, binding: string) =>
						`${declaration} ${binding} = ${JSON.stringify(`pw-marker-${binding}`)}`,
				);
				rewritten = rewritten.replaceAll("stylex.defaultMarker()", '"pw-default-marker"');
				for (const binding of convertedBindings) {
					const escaped = binding.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&");
					rewritten = rewritten.replace(
						new RegExp(
							`\\bstylex\\.props\\((\\s*${escaped}(?:\\s*\\.[A-Za-z_$][\\w$]*|\\s*\\[[^\\]]+\\]))`,
							"g",
						),
						`${cssBinding}.props($1`,
					);
				}
				rewritten = rewritten.replaceAll("stylex.props(", `${cssBinding}.props(`);
				rewritten = moveStyleAfterPropsSpread(rewritten, cssBinding);
				rewritten = mergeClassNameAfterPropsSpread(rewritten, cssBinding);
				// Some StyleX host components pass `xstyle` through StyleX's runtime
				// `stylex.props` implementation. A compiled Pandwind group is static,
				// but that host port does not know how to consume its class map. Move
				// static carriers to the universal React className port at the adapter
				// boundary; leave dynamic carriers on xstyle for their residual path.
				rewritten = rewriteStaticXstyleHosts(rewritten, cssBinding);
				return {
					code: rewritten,
					imports: rewritten === code ? [] : staticImports(cssBinding),
					residuals: [],
				};
			},
		},
		lowerings: [stylexNumericLowering],
		emit(program, { programObject }) {
			if (
				program.source?.pattern === CodemodPatternId.StyleXKeyframes ||
				program.rules[0]?.kind === StyleRuleKindTag.Keyframes
			) {
				return {
					text: `stylex.keyframes(${programObject(program)})`,
					imports: ['import * as stylex from "@stylexjs/stylex";'],
				};
			}
			if (program.source?.pattern === CodemodPatternId.StyleXDefineVars) {
				return {
					text: `stylex.defineVars(${programObject(program)})`,
					imports: ['import * as stylex from "@stylexjs/stylex";'],
				};
			}
			const named = program.rules.some((rule) => rule.name !== undefined);
			return {
				// StyleX's target value is a compiled style object, not a class
				// string. Named programs keep their map; an unnamed program gets a
				// stable local `style` key so it can be consumed by stylex.props.
				text: named
					? `stylex.create(${programObject(program)})`
					: `stylex.create({ style: ${programObject(program)} }).style`,
				imports: ['import * as stylex from "@stylexjs/stylex";'],
			};
		},
	});
}
