import {
	inferSemanticConditionKind,
	StyleRuleKindTag,
	StyleValueKindTag,
	type SemanticConditionKind,
} from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import type {
	AdapterConfigContext,
	AdapterParseContext,
	AdapterTokenPolicy,
} from "../adapter-contract.ts";
import type { StyleProgram, StyleValue } from "../semantic-ir.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { AdapterEvidence } from "../adapter-evidence.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
} from "../identifiers.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import { joinDocumentPath } from "../../path-utils.ts";
import { SourcePass } from "../../source-pass-utils.ts";
import type { JsxStyleHostMatch, JsxStylePropSelector } from "../jsx-style-host.ts";
import { TokenCatalog } from "../tokens.ts";

const styleProps = [
	"css",
	"__css",
	"bg",
	"bgColor",
	"background",
	"backgroundColor",
	"color",
	"p",
	"px",
	"py",
	"pt",
	"pr",
	"pb",
	"pl",
	"m",
	"mx",
	"my",
	"mt",
	"mr",
	"mb",
	"ml",
	"w",
	"h",
	"width",
	"height",
	"minW",
	"maxW",
	"minH",
	"maxH",
	"display",
	"flex",
	"flexDirection",
	"flexDir",
	"direction",
	"wrap",
	"pos",
	"align",
	"alignItems",
	"justify",
	"justifyContent",
	"gap",
	"rowGap",
	"columnGap",
	"fontSize",
	"fontWeight",
	"lineHeight",
	"letterSpacing",
	"fontFamily",
	"textDecoration",
	"textDecorationColor",
	"textDecorationThickness",
	"textUnderlineOffset",
	"border",
	"borderWidth",
	"borderTopWidth",
	"borderRightWidth",
	"borderBottomWidth",
	"borderLeftWidth",
	"borderStyle",
	"borderColor",
	"borderTop",
	"borderRight",
	"borderBottom",
	"borderLeft",
	"borderTopColor",
	"borderRightColor",
	"borderBottomColor",
	"borderLeftColor",
	"borderRadius",
	"rounded",
	"shadow",
	"boxShadow",
	"position",
	"padding",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"margin",
	"marginTop",
	"marginRight",
	"marginBottom",
	"marginLeft",
	"top",
	"right",
	"bottom",
	"left",
	"inset",
	"insetStart",
	"insetEnd",
	"ps",
	"pe",
	"paddingX",
	"paddingY",
	"marginX",
	"marginY",
	"insetX",
	"insetY",
	"ms",
	"me",
	"overflow",
	"overflowX",
	"overflowY",
	"opacity",
	"zIndex",
	"visibility",
	"alignSelf",
	"alignContent",
	"justifySelf",
	"flexGrow",
	"flexShrink",
	"flexBasis",
	"flexWrap",
	"gridTemplateColumns",
	"gridTemplateRows",
	"gridColumn",
	"gridRow",
	"order",
	"objectFit",
	"aspectRatio",
	"scrollMarginTop",
	"scrollMargin",
	"transition",
	"transform",
	"filter",
	"backdropFilter",
	"outline",
	"outlineWidth",
	"outlineStyle",
	"outlineColor",
	"outlineOffset",
	"backgroundImage",
	"bgImage",
	"fill",
	"stroke",
	"textAlign",
	"textTransform",
	"whiteSpace",
	"cursor",
	"_hover",
	"_focus",
	"_active",
	"_disabled",
	"_before",
	"_after",
	"borderTopRadius",
	"borderBottomRadius",
	"borderStartRadius",
	"borderEndRadius",
	"borderStartWidth",
	"borderEndWidth",
	"borderStartColor",
	"borderEndColor",
] as const;

function isSpacingProperty(property: string): boolean {
	return (
		/^(?:p|p[trblxyse]|m|m[trblxyse]|gap|rowGap|columnGap)$/.test(property) ||
		property === "padding" ||
		property.startsWith("padding") ||
		property === "margin" ||
		property.startsWith("margin")
	);
}

const propertyAliases = {
	bg: "backgroundColor",
	bgColor: "backgroundColor",
	rounded: "borderRadius",
	w: "width",
	h: "height",
	p: "padding",
	px: ["paddingLeft", "paddingRight"],
	py: ["paddingTop", "paddingBottom"],
	pt: "paddingTop",
	pr: "paddingRight",
	pb: "paddingBottom",
	pl: "paddingLeft",
	m: "margin",
	mx: ["marginLeft", "marginRight"],
	my: ["marginTop", "marginBottom"],
	mt: "marginTop",
	mr: "marginRight",
	mb: "marginBottom",
	ml: "marginLeft",
	minW: "minWidth",
	maxW: "maxWidth",
	minH: "minHeight",
	maxH: "maxHeight",
	align: "alignItems",
	justify: "justifyContent",
	direction: "flexDirection",
	flexDir: "flexDirection",
	wrap: "flexWrap",
	pos: "position",
	shadow: "boxShadow",
	ps: "paddingInlineStart",
	pe: "paddingInlineEnd",
	ms: "marginInlineStart",
	me: "marginInlineEnd",
	marginX: "marginInline",
	marginY: "marginBlock",
	paddingX: "paddingInline",
	paddingY: "paddingBlock",
	insetX: "insetInline",
	insetY: "insetBlock",
	insetStart: "insetInlineStart",
	insetEnd: "insetInlineEnd",
	bgImage: "backgroundImage",
	borderTopRadius: ["borderStartStartRadius", "borderStartEndRadius"],
	borderBottomRadius: ["borderEndStartRadius", "borderEndEndRadius"],
	borderStartRadius: ["borderStartStartRadius", "borderEndStartRadius"],
	borderEndRadius: ["borderStartEndRadius", "borderEndEndRadius"],
	borderStartWidth: "borderInlineStartWidth",
	borderEndWidth: "borderInlineEndWidth",
	borderStartColor: "borderInlineStartColor",
	borderEndColor: "borderInlineEndColor",
} as const;

function chakraValue(property: string, value: StyleValue): StyleValue {
	if (value.kind !== StyleValueKindTag.Literal) return value;
	if (typeof value.value === "number" && isSpacingProperty(property)) {
		if (value.value === 0) return { kind: "literal", value: 0 };
		const absolute = Math.abs(value.value);
		const variable = `var(--chakra-spacing-${absolute})`;
		return {
			kind: "literal",
			value: value.value < 0 ? `calc(${variable} * -1)` : variable,
		};
	}
	if (typeof value.value !== "string") return value;
	if (/^(?:-?\d+(?:\.\d+)?)(?:px|rem|em|%|vh|vw|svh|svw)$/.test(value.value)) return value;
	const tokenName = /^(?:[A-Za-z][A-Za-z0-9_.-]*|\d+[A-Za-z][A-Za-z0-9_.-]*)$/.test(value.value);
	if (isSpacingProperty(property)) {
		if (/^-?\d+(?:\.\d+)?$/.test(value.value)) {
			const absolute = value.value.replace(/^-/, "");
			const variable = `var(--chakra-spacing-${absolute})`;
			return {
				kind: "literal",
				value: value.value.startsWith("-") ? `calc(${variable} * -1)` : variable,
			};
		}
	}
	if ((property === "borderRadius" || property === "rounded") && tokenName)
		return { kind: "literal", value: `var(--chakra-radii-${value.value})` };
	if (property === "fontWeight" && tokenName)
		return { kind: "literal", value: `var(--chakra-font-weights-${value.value})` };
	if (property === "fontSize" && tokenName)
		return { kind: "literal", value: `var(--chakra-font-sizes-${value.value})` };
	if (property === "lineHeight" && tokenName)
		return { kind: "literal", value: `var(--chakra-line-heights-${value.value})` };
	if (property === "letterSpacing" && tokenName)
		return { kind: "literal", value: `var(--chakra-letter-spacings-${value.value})` };
	const numericDimension = /^\d+(?:\.\d+)?$/.test(value.value);
	if (
		["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"].includes(property) &&
		(tokenName || numericDimension)
	)
		return { kind: "literal", value: `var(--chakra-sizes-${value.value})` };
	if (property === "fontFamily" && tokenName)
		return { kind: "literal", value: `var(--chakra-fonts-${value.value})` };
	if (property === "shadow" && tokenName)
		return { kind: "literal", value: `var(--chakra-shadows-${value.value})` };
	if (
		property === "color" ||
		property === "backgroundColor" ||
		property === "borderColor" ||
		property === "bg" ||
		property === "bgColor"
	) {
		if (/^[A-Za-z][\w-]*(?:\.[\w-]+)+(?:\/[\w-]+)?$/.test(value.value))
			return {
				kind: "literal",
				value: `var(--chakra-colors-${value.value
					.replaceAll(".", "-")
					.replace("colorPalette", "color-palette")
					.replace("/", "-")})`,
			};
	}
	return value;
}

function chakraTokenSource(adapter: string | undefined): boolean {
	return [CodemodAdapterId.ChakraUi, CodemodAdapterId.Mantine, CodemodAdapterId.Panda].includes(
		adapter as CodemodAdapterId,
	);
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

function chakraTokenGroup(property: string): string | undefined {
	if (
		property === "color" ||
		property === "backgroundColor" ||
		property === "borderColor" ||
		property.endsWith("Color")
	)
		return "colors";
	if (property === "borderRadius") return "radii";
	if (property === "fontWeight") return "fontWeights";
	if (property === "fontSize") return "fontSizes";
	if (property === "lineHeight") return "lineHeights";
	if (property === "letterSpacing") return "letterSpacings";
	if (property === "fontFamily") return "fonts";
	if (property === "boxShadow") return "shadows";
	if (
		property === "padding" ||
		property.startsWith("padding") ||
		property === "margin" ||
		property.startsWith("margin") ||
		property === "gap" ||
		property.endsWith("Gap")
	)
		return "spacing";
	if (
		property === "width" ||
		property === "height" ||
		property === "minWidth" ||
		property === "maxWidth" ||
		property === "minHeight" ||
		property === "maxHeight"
	)
		return "sizes";
	return undefined;
}

const CHAKRA_TOKEN_POLICY: AdapterTokenPolicy = {
	schema: "pandwind.adapter-token-policy/1",
	preserve: (program, context) =>
		TokenCatalog.fromContract(context.config.tokenCatalog)?.preserveProgram(
			program,
			chakraTokenGroup,
			(match) => match.ref,
		) ?? program,
};

function hasConfigToken(config: unknown, group: string, token: string): boolean {
	if (typeof config !== "object" || config === null) return false;
	const root = config as Record<string, unknown>;
	const theme = root.theme;
	if (typeof theme !== "object" || theme === null) return false;
	for (const collection of ["tokens", "semanticTokens"]) {
		let current: unknown = (theme as Record<string, unknown>)[collection];
		for (const segment of [group, ...token.split(".")]) {
			if (typeof current !== "object" || current === null) {
				current = undefined;
				break;
			}
			current = (current as Record<string, unknown>)[segment];
		}
		if (typeof current === "object" && current !== null && "value" in current) return true;
	}
	return false;
}

function chakraOfficialValue(
	property: string,
	value: StyleValue,
	context: AdapterParseContext,
): StyleValue {
	const fallback = chakraValue(property, value);
	if (value.kind !== StyleValueKindTag.Literal || typeof value.value !== "string") return fallback;
	const system = context.config.values.chakraSystem as ChakraSystemLike | undefined;
	const config = context.config.values.chakraConfig;
	const group = chakraTokenGroup(property);
	if (
		system?.token?.var === undefined ||
		group === undefined ||
		!hasConfigToken(config, group, value.value)
	)
		return fallback;
	const catalog = TokenCatalog.fromContract(context.config.tokenCatalog);
	const token = catalog?.findByReference([group], value.value);
	// Keep a statically resolvable Chakra token as a token IR node. Resolving it
	// directly to `var(--chakra-...)` would make later target adapters lose the
	// authored token and would prevent a configured target preset from reusing it.
	if (token !== undefined)
		return {
			kind: "token",
			ref: token.ref,
			authored: value.value,
			resolved: token.resolved,
		};
	const resolved = system.token.var(`${group}.${value.value}`);
	return typeof resolved === "string" ? { kind: "literal", value: resolved } : fallback;
}

interface ChakraSystemLike {
	readonly $$chakra?: true;
	readonly _config?: Record<string, unknown>;
	readonly properties?: ReadonlySet<string>;
	readonly utility?: {
		readonly shorthands?: ReadonlyMap<string, string>;
	};
	readonly token?: {
		var?(path: string, fallback?: unknown): unknown;
	};
}

interface ChakraPackage {
	readonly defaultConfig?: Record<string, unknown>;
	readonly createSystem?: (...configs: Record<string, unknown>[]) => ChakraSystemLike;
	readonly isValidSystem?: (value: unknown) => value is ChakraSystemLike;
}

function chakraSourceVocabulary(context: AdapterParseContext): {
	readonly styleProps: JsxStylePropSelector;
	readonly propertyAliases: Readonly<Record<string, string | readonly string[]>>;
} {
	const system = context.config.values.chakraSystem as ChakraSystemLike | undefined;
	const aliases = system?.utility?.shorthands;
	return {
		styleProps:
			system?.properties === undefined
				? styleProps
				: (property) => system.properties?.has(property) === true,
		propertyAliases: aliases === undefined ? propertyAliases : Object.fromEntries(aliases),
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
				/(?:^|[\\/])(?:src[\\/])?theme(?:[\\/](?:index\.)?(?:ts|tsx|js|mjs|cjs)|\.(?:ts|tsx|js|mjs|cjs))$/u.test(
					candidate,
				),
			) ?? [];
	const candidates = [
		"src/theme.ts",
		"src/theme.tsx",
		"src/theme.js",
		"src/theme.mjs",
		"theme.ts",
		"theme.tsx",
		"theme.js",
		"theme.mjs",
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
	for (const candidate of new Set(candidates)) {
		const path = candidate.startsWith(context.root)
			? candidate
			: joinDocumentPath(context.root, candidate);
		// Preserve candidate priority: the first project theme wins.
		const module = await loader.importFile<Record<string, unknown>>(path);
		if (module === undefined) continue;
		const exported = [module.default, ...Object.values(module)];
		const existingSystem = exported.find((value) => chakra.isValidSystem?.(value) === true) as
			| ChakraSystemLike
			| undefined;
		const config =
			existingSystem?._config ??
			exported.map(chakraConfigCandidate).find((value) => value !== undefined);
		if (config === undefined) continue;
		const system =
			existingSystem ??
			(chakra.createSystem?.(chakra.defaultConfig ?? {}, config) as ChakraSystemLike | undefined);
		return {
			...fallback,
			files: [...fallback.files, path],
			tokenCatalog: TokenCatalog.fromNested({
				...((config.theme as Record<string, unknown> | undefined)?.tokens as
					| Record<string, unknown>
					| undefined),
				...((config.theme as Record<string, unknown> | undefined)?.semanticTokens as
					| Record<string, unknown>
					| undefined),
			})?.contract,
			values: {
				chakraConfig: config,
				...(system === undefined ? {} : { chakraSystem: system }),
				officialConfigPackage: "@chakra-ui/react",
			},
		};
	}
	return fallback;
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
				kind: "composition",
				text,
				hint: "Chakra recipes and attached factory styles require explicit composition lowering",
			},
		],
	};
}

function sourceHostTag(openingTag: string): string | undefined {
	return /^<\s*([A-Za-z_$][\w$.-]*)/u.exec(openingTag)?.[1];
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
}: {
	readonly code: string;
	readonly binding: string;
	readonly tag: string;
	readonly framework: string;
	readonly emittedExpression: string;
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
	const declaration =
		`${assignment[1]} ${binding} = (props) => <chakra.${tag} {...props} ` +
		`css={${emittedExpression}} />;`;
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
	return defineCodemodAdapter({
		id: CodemodAdapterId.ChakraUi,
		officialApi: {
			pluginSystems: ["presets", "recipes", "slot-recipes", "conditions", "globalCss"],
			compilerIntegrations: ["@chakra-ui/react"],
			ssrHooks: ["ChakraProvider"],
		},
		patterns: [
			{
				name: "chakra-style-props",
				regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
				form: "jsx-style",
				styleProps: (context) => chakraSourceVocabulary(context).styleProps,
				preserveHostStyleProps: (host) => [
					...preserveSeparatorGap(host),
					...preserveNextImageFill(host),
				],
			},
			// Chakra documents system.css as an interop/source form. Target output
			// uses the public css prop or chakra factory instead of putting its style
			// object into className.
			{
				name: "chakra-system-css",
				regex: /\b(?:system|defaultSystem|chakraSystem)\.css\s*\(\s*\{/g,
				form: "object",
			},
			{
				name: "chakra-recipe",
				regex: /\bdefineRecipe\s*\(\s*\{/g,
				form: "object",
				transform: (program) => compositionResidual(program, "defineRecipe"),
			},
			{
				name: "chakra-slot-recipe",
				regex: /\bdefineSlotRecipe\s*\(\s*\{/g,
				form: "object",
				transform: (program) => compositionResidual(program, "defineSlotRecipe"),
			},
			{
				name: "chakra-cva",
				regex: /\b(?:system|defaultSystem|chakraSystem)\.cva\s*\(\s*\{/g,
				form: "object",
				transform: (program) => compositionResidual(program, "system.cva"),
			},
			{
				name: "chakra-sva",
				regex: /\b(?:system|defaultSystem|chakraSystem)\.sva\s*\(\s*\{/g,
				form: "object",
				transform: (program) => compositionResidual(program, "system.sva"),
			},
			{
				name: "chakra-factory-styles",
				regex: /\bchakra\s*\(\s*(?:["'][^"']+["']|[A-Za-z_$][\w$]*)\s*,\s*\{/g,
				form: "object",
				transform: (program) => compositionResidual(program, "chakra factory styles"),
			},
			{
				name: "chakra-use-recipe",
				regex: /\buseRecipe\s*\(\s*[A-Za-z_$][\w$]*\s*\)/g,
				form: "residual",
				residual: {
					kind: "composition",
					hint: "Chakra recipe usage requires explicit variant/component lowering",
				},
			},
			{
				name: "chakra-use-slot-recipe",
				regex: /\buseSlotRecipe\s*\(\s*[A-Za-z_$][\w$]*\s*\)/g,
				form: "residual",
				residual: {
					kind: "composition",
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
		namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
		migration: {
			targetPolicy: {
				handlesHostRewrites: true,
				handlesFrameworkSemantics: true,
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
				rewriteComponent: ({ code, binding, tag, framework, emittedExpression }) =>
					rewriteChakraStyledSubject({
						code,
						binding,
						tag,
						framework,
						emittedExpression,
					}),
				resolveHostRepresentation: ({ framework, hasHostContext, program }) => {
					if (!hasHostContext && program.source?.subject === undefined) return undefined;
					return framework === undefined ||
						framework === BuiltinHostFramework.React ||
						framework === BuiltinHostFramework.Preact
						? StyleHostRepresentationKind.StyleProp
						: undefined;
				},
			},
		},
		detectPatterns: [/@chakra-ui\/react/, /<(?:(?:Box|Flex|Stack|Text|Button)(?:\s|>))/],
		// Component imports remain in place because the host element still uses Chakra's component.
		sourceModules: [],
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
					const configured = context.config.values.chakraConfig as
						| { readonly conditions?: Record<string, unknown> }
						| undefined;
					const conditionValues: Record<string, string> = {};
					const conditionKinds: Record<string, SemanticConditionKind> = {};
					for (const [name, value] of Object.entries(configured?.conditions ?? {})) {
						if (typeof value !== "string") continue;
						const normalized = name.replace(/^_/, "");
						conditionValues[normalized] = value;
						conditionKinds[normalized] = inferSemanticConditionKind(value);
					}
					return { conditionKinds, conditionValues };
				})(),
				propertyAliases: vocabulary.propertyAliases,
				objectReferences: objectReferences(source),
				unwrapNestedObjectKeys: ["css"],
				propertyValueConditions: true,
				valueTransforms: Object.fromEntries(
					[
						...new Set([
							...Object.keys(vocabulary.propertyAliases),
							...(typeof vocabulary.styleProps === "function" ? [] : vocabulary.styleProps),
						]),
					].map((property) => [
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
			if (program.rules.some((rule) => rule.kind !== StyleRuleKindTag.Style))
				return {
					text: programObject(outputProgram),
					residuals: [
						{
							kind: "rule-level",
							text: program.rules.map((rule) => rule.kind).join(", "),
							hint: "Chakra standalone css projection supports style rules only",
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
}
