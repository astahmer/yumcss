import { allRuleCapabilities, defineCodemodAdapter, dependency } from "../external-adapters.ts";
import type {
	AdapterConfigContext,
	AdapterHostRewriteResult,
	AdapterParseContext,
} from "../adapter-contract.ts";
import type { StyleProgram, StyleValue } from "../semantic-ir.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
	StyleRepresentationKind,
} from "../identifiers.ts";
import { NODE_PROJECT_MODULE_LOADER, type ProjectModuleLoader } from "../project-module-loader.ts";
import { joinDocumentPath } from "../../path-utils.ts";
import { matchBlock } from "../../sources.ts";
import type { JsxStyleHostMatch } from "../jsx-style-host.ts";

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

function hasDynamicValues(program: StyleProgram): boolean {
	return program.rules.some(function containsDynamic(rule): boolean {
		return (
			rule.declarations.some((declaration) => declaration.value.kind === "dynamic") ||
			rule.children.some(containsDynamic)
		);
	});
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
	if (value.kind !== "literal") return value;
	const isSpacingProperty =
		/^(?:p|p[trblxysexy]|m|m[trblxysexy]|gap|rowGap|columnGap)$/.test(property) ||
		property === "padding" ||
		property.startsWith("padding") ||
		property === "margin" ||
		property.startsWith("margin") ||
		property === "paddingX" ||
		property === "paddingY" ||
		property === "marginX" ||
		property === "marginY";
	if (typeof value.value === "number" && isSpacingProperty) {
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
	if (isSpacingProperty) {
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

function valueTransformProperty(property: string): string {
	const alias = propertyAliases[property as keyof typeof propertyAliases];
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
	if (value.kind !== "literal" || typeof value.value !== "string") return fallback;
	const system = context.config.values.chakraSystem as ChakraSystemLike | undefined;
	const config = context.config.values.chakraConfig;
	const group = chakraTokenGroup(property);
	if (
		system?.token?.var === undefined ||
		group === undefined ||
		!hasConfigToken(config, group, value.value)
	)
		return fallback;
	const resolved = system.token.var(`${group}.${value.value}`);
	return typeof resolved === "string" ? { kind: "literal", value: resolved } : fallback;
}

interface ChakraSystemLike {
	readonly $$chakra?: true;
	readonly _config?: Record<string, unknown>;
	readonly token?: {
		var?(path: string, fallback?: unknown): unknown;
	};
}

interface ChakraPackage {
	readonly defaultConfig?: Record<string, unknown>;
	readonly createSystem?: (...configs: Record<string, unknown>[]) => ChakraSystemLike;
	readonly isValidSystem?: (value: unknown) => value is ChakraSystemLike;
}

function chakraConfigCandidate(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const candidate = value as Record<string, unknown>;
	return candidate.theme !== undefined || candidate.conditions !== undefined
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
	const chakra = await loader.importPackage<ChakraPackage>("@chakra-ui/react", context.root);
	if (chakra === undefined) return fallback;
	const candidates = [
		"src/theme.ts",
		"src/theme.tsx",
		"src/theme.js",
		"src/theme.mjs",
		"theme.ts",
		"theme.tsx",
		"theme.js",
		"theme.mjs",
	];
	for (const candidate of candidates) {
		const path = joinDocumentPath(context.root, candidate);
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
		const block = matchBlock(source, start);
		if (block !== null) references[name] = block.body;
	}
	return references;
}

function renderChakraHost(
	program: StyleProgram,
	expression: string,
): AdapterHostRewriteResult | undefined {
	const source = program.source;
	if (source === undefined || source.hostOpenTag === undefined) return undefined;
	const opening = source.hostOpenTag;
	let host = opening;
	for (const attribute of source.hostStyleAttributes ?? []) {
		const index = host.indexOf(attribute);
		if (index < 0) continue;
		const whitespace = index > 0 && /[ \t]/u.test(host[index - 1]!) ? 1 : 0;
		host = `${host.slice(0, index - whitespace)}${host.slice(index + attribute.length)}`;
	}
	const insertion = /\/\s*>$/u.test(host) ? host.length - 2 : host.length - 1;
	return {
		code: `${host.slice(0, insertion)} className={${expression}}${host.slice(insertion)}`,
		residuals: [],
	};
}

export function createChakraAdapter(
	options: { readonly moduleLoader?: ProjectModuleLoader | null } = {},
) {
	const moduleLoader =
		options.moduleLoader === null
			? undefined
			: (options.moduleLoader ?? NODE_PROJECT_MODULE_LOADER);
	return defineCodemodAdapter({
		id: CodemodAdapterId.ChakraUi,
		patterns: [
			{
				name: "chakra-style-props",
				regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
				form: "jsx-style",
				styleProps,
				preserveHostStyleProps: (host) => [
					...preserveSeparatorGap(host),
					...preserveNextImageFill(host),
				],
			},
			// This is the adapter's canonical standalone projection. Keeping it in
			// the source pattern set makes a Chakra emission a valid source for the
			// reverse route instead of creating a one-way pseudo target.
			{
				name: "chakra-css",
				regex: /\bcss\s*\(\s*\{/g,
				form: "object",
			},
		],
		packages: dependency("@chakra-ui/react", "peer"),
		capabilities: allRuleCapabilities(CodemodAdapterId.ChakraUi, "partial", {
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
				hostRepresentation: StyleHostRepresentationKind.Class,
				resolveRepresentation: ({ program, hasHostContext }) =>
					!hasHostContext && program.source?.subject === undefined && hasDynamicValues(program)
						? StyleRepresentationKind.RuntimeCarrier
						: undefined,
				capabilitiesForRepresentation: ({ representation }) =>
					representation === StyleRepresentationKind.RuntimeCarrier
						? ["dynamic-values", "theme-context", "runtime-context"]
						: [],
			},
		},
		detectPatterns: [/@chakra-ui\/react/, /<(?:(?:Box|Flex|Stack|Text|Button)(?:\s|>))/],
		// Component imports remain in place because the host element still uses Chakra's component.
		sourceModules: [],
		configFiles: ["package.json", "chakra.config.ts", "theme.ts"],
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) =>
						officialChakraConfig(context, moduleLoader),
				}),
		sourceObjectOptions: (source, context) => ({
			propertyAliases,
			objectReferences: objectReferences(source),
			unwrapNestedObjectKeys: ["css"],
			propertyValueConditions: true,
			conditionKinds: {
				sm: "named",
				md: "named",
				lg: "named",
				xl: "named",
				"2xl": "named",
			},
			valueTransforms: Object.fromEntries(
				[...new Set([...styleProps, ...Object.keys(propertyAliases)])].map((property) => [
					property,
					(value: StyleValue) =>
						chakraOfficialValue(valueTransformProperty(property), value, context),
				]),
			),
		}),
		emit(program, { programObject }) {
			if (program.rules.some((rule) => rule.kind !== "style"))
				return {
					text: programObject(program),
					residuals: [
						{
							kind: "rule-level",
							text: program.rules.map((rule) => rule.kind).join(", "),
							hint: "Chakra standalone css projection supports style rules only",
						},
					],
				};
			const expression = `css(${programObject(program)})`;
			const host = renderChakraHost(program, expression);
			return {
				text: host?.code ?? expression,
				imports: ['import { css } from "@chakra-ui/react";'],
				...(host === undefined ? {} : { residuals: host.residuals }),
			};
		},
	});
}
