import { CodemodCallPatternFormTag } from "../identifiers.ts";
import {
	StyleProgramResidualKindTag,
	StyleRuleKindTag,
	StyleValueKindTag,
} from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import { componentAttrsValueExpression } from "../host-component-rewriter.ts";
import type { StyleProgram, StyleValue } from "../semantic-ir.ts";
import type { AdapterConfigContext, AdapterParseContext } from "../adapter-contract.ts";
import { AdapterEvidence } from "../adapter-evidence.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import { joinDocumentPath } from "../../path-utils.ts";
import { canonicalizeSourceHost } from "../host-component-rewriter.ts";
import { createTokenPolicy, recoverSourceToken, TokenCatalog } from "../tokens.ts";
import { BuiltinHostFramework } from "../host-adapters.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";
import {
	CodemodAdapterId,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
	StyleRepresentationKind,
} from "../identifiers.ts";

function hasScalarDynamicProgram(program: StyleProgram): boolean {
	return StyleProgramAnalysis.hasScalarDynamic(program);
}

function renderMantineHost(program: StyleProgram, styleObject: string): string | undefined {
	const source = program.source;
	if (source?.hostOpenTag === undefined) return undefined;
	let host = source.hostOpenTag;
	for (const attribute of source.hostStyleAttributes ?? []) {
		const index = host.indexOf(attribute);
		if (index < 0) continue;
		const whitespace = index > 0 && /[ \t]/u.test(host[index - 1]!) ? 1 : 0;
		host = `${host.slice(0, index - whitespace)}${host.slice(index + attribute.length)}`;
	}
	const insertion = /\/\s*>$/u.test(host) ? host.length - 2 : host.length - 1;
	return `${host.slice(0, insertion)} style={${styleObject}}${host.slice(insertion)}`;
}

function rewriteMantineClassHost({
	code,
	binding,
	representation,
}: {
	readonly code: string;
	readonly binding?: string;
	readonly representation: StyleHostRepresentationKind;
}): { code: string; residuals: readonly import("../semantic-ir.ts").StyleProgramResidual[] } {
	if (representation !== StyleHostRepresentationKind.StyleProp || binding === undefined)
		return { code, residuals: [] };
	const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const classAttribute = new RegExp(`className\\s*=\\{\\s*${escapedBinding}\\s*\\}`, "g");
	if (!classAttribute.test(code))
		return {
			code,
			residuals: [
				{
					kind: "host-framework",
					text: binding,
					hint: "Mantine style-prop projection could not locate a simple className binding",
				},
			],
		};
	return { code: code.replace(classAttribute, `style={${binding}}`), residuals: [] };
}

function rewriteMantineSourceHost({
	code,
	program,
	emittedExpression,
}: {
	readonly code: string;
	readonly program: import("../semantic-ir.ts").StyleProgram;
	readonly emittedExpression: string;
}): { code: string; residuals: readonly import("../semantic-ir.ts").StyleProgramResidual[] } {
	const openingTag = program.source?.hostOpenTag;
	if (openingTag === undefined || (program.source?.hostStyleAttributes?.length ?? 0) === 0)
		return { code, residuals: [] };
	const rendered = renderMantineHost(program, emittedExpression);
	if (rendered === undefined)
		return {
			code,
			residuals: [
				{
					kind: "host-framework",
					text: openingTag,
					hint: "Mantine style-prop projection could not render the source host",
				},
			],
		};
	const index = code.indexOf(openingTag);
	if (index < 0)
		return {
			code,
			residuals: [
				{
					kind: "host-framework",
					text: openingTag,
					hint: "Mantine style-prop projection could not locate the source host",
				},
			],
		};
	return {
		code: `${code.slice(0, index)}${rendered}${code.slice(index + openingTag.length)}`,
		residuals: [],
	};
}

function rewriteChakraBoxImport(code: string): string {
	const match = /import\s*\{\s*([^}]+?)\s*\}\s*from\s*["']@chakra-ui\/react["'];?/u.exec(code);
	if (match === null) return code;
	const imported =
		match[1]
			?.split(",")
			.map((name) => name.trim())
			.filter(Boolean) ?? [];
	if (imported.length !== 1 || imported[0] !== "Box") return code;
	return code.replace(match[0], 'import { Box } from "@mantine/core";');
}

// These are documented Mantine source spellings, not a project vocabulary.
// Theme values are always taken from the official loaded theme when context
// is available; the map only lets the synchronous parser recognize syntax.
const styleProps = [
	"style",
	"sx",
	"m",
	"mt",
	"mb",
	"ml",
	"mr",
	"ms",
	"me",
	"mx",
	"my",
	"p",
	"pt",
	"pb",
	"pl",
	"pr",
	"ps",
	"pe",
	"px",
	"py",
	"maw",
	"mah",
	"miw",
	"mih",
	"w",
	"h",
	"size",
	"c",
	"bg",
	"bd",
	"bdrs",
	"radius",
	"shadow",
	"fw",
	"fz",
	"ff",
	"lh",
	"ta",
	"td",
	"tt",
	"lts",
	"pos",
	"top",
	"left",
	"right",
	"bottom",
	"inset",
	"display",
	"flex",
	"opacity",
] as const;

const propertyAliases = {
	m: "margin",
	p: "padding",
	c: "color",
	bg: "backgroundColor",
	bd: "border",
	bdrs: "borderRadius",
	radius: "borderRadius",
	shadow: "boxShadow",
	fw: "fontWeight",
	fz: "fontSize",
	ff: "fontFamily",
	lh: "lineHeight",
	maw: "maxWidth",
	mah: "maxHeight",
	miw: "minWidth",
	mih: "minHeight",
	pos: "position",
	ta: "textAlign",
	td: "textDecoration",
	tt: "textTransform",
	lts: "letterSpacing",
	w: "width",
	h: "height",
	size: ["width", "height"],
	ms: "marginInlineStart",
	me: "marginInlineEnd",
	mx: "marginInline",
	my: "marginBlock",
	ps: "paddingInlineStart",
	pe: "paddingInlineEnd",
	px: "paddingInline",
	py: "paddingBlock",
} as const;

function mantineProperties(property: string): readonly string[] {
	const alias = Object.entries(propertyAliases).find(([name]) => name === property)?.[1];
	if (typeof alias === "string") return [alias];
	if (alias !== undefined) return alias;
	return [property];
}

const mantineTokenGroup = (property: string): string | undefined => {
	const properties = mantineProperties(property);
	if (
		properties.some(
			(candidate) =>
				candidate === "color" || candidate === "background" || candidate.endsWith("Color"),
		)
	)
		return "colors";
	if (properties.includes("borderRadius")) return "radii";
	if (
		properties.some(
			(candidate) =>
				/^(?:padding|margin|gap|inset)/u.test(candidate) ||
				/^(?:min|max)?(?:width|height)$/u.test(candidate),
		)
	)
		return "spacing";
	if (properties.includes("fontSize")) return "fontSizes";
	if (properties.includes("lineHeight")) return "lineHeights";
	if (properties.includes("boxShadow")) return "shadows";
	return undefined;
};

const MANTINE_TOKEN_POLICY = createTokenPolicy(mantineTokenGroup, (match, property) => {
	const namespace =
		property === "color" || property === "background" || property.endsWith("Color")
			? "color"
			: property === "fontSize"
				? "font-size"
				: property === "lineHeight"
					? "line-height"
					: property === "borderRadius"
						? "radius"
						: property === "boxShadow"
							? "shadow"
							: "spacing";
	return `var(--mantine-${namespace}-${match.ref.replaceAll(".", "-")})`;
});

const MANTINE_SCALED_PROPERTIES = new Set([
	"margin",
	"marginBlock",
	"marginInline",
	"marginTop",
	"marginRight",
	"marginBottom",
	"marginLeft",
	"marginInlineStart",
	"marginInlineEnd",
	"padding",
	"paddingBlock",
	"paddingInline",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"paddingInlineStart",
	"paddingInlineEnd",
	"width",
	"height",
	"minWidth",
	"maxWidth",
	"minHeight",
	"maxHeight",
	"top",
	"right",
	"bottom",
	"left",
	"inset",
	"letterSpacing",
]);

const MANTINE_TOKEN_REFERENCE = /^[A-Za-z][\w-]*(?:\.[\w-]+)+$/u;

interface MantineThemeLike {
	readonly spacing?: unknown;
	readonly fontSizes?: unknown;
	readonly lineHeights?: unknown;
	readonly colors?: unknown;
	readonly radius?: unknown;
	readonly shadows?: unknown;
	readonly headings?: Record<string, unknown>;
}

interface MantinePackage {
	readonly createTheme?: (options?: Record<string, unknown>) => MantineThemeLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mantineThemeCandidate(value: unknown): Record<string, unknown> | undefined {
	if (!isRecord(value)) return undefined;
	// `spacing` is also a common MUI theme field. Require a Mantine-owned
	// collection so a shared theme module cannot be claimed by the wrong loader.
	return ["fontSizes", "lineHeights", "colors", "radius", "shadows", "headings"].some(
		(key) => value[key] !== undefined,
	)
		? value
		: undefined;
}

function themeCollection(value: unknown): unknown {
	if (value === undefined || value === null || typeof value !== "object") return value;
	const root: Record<string, unknown> = {};
	const stack: Array<{ readonly source: unknown; readonly target: Record<string, unknown> }> = [
		{ source: value, target: root },
	];
	while (stack.length > 0) {
		const current = stack.pop()!;
		const entries = Array.isArray(current.source)
			? current.source.map((entry, index) => [String(index), entry] as const)
			: Object.entries(current.source as Record<string, unknown>);
		for (const [key, child] of entries) {
			if (child !== null && typeof child === "object") {
				const nested: Record<string, unknown> = {};
				current.target[key] = nested;
				stack.push({ source: child, target: nested });
			} else current.target[key] = child;
		}
	}
	return root;
}

function resolveThemePath(
	theme: MantineThemeLike | undefined,
	path: string,
): string | number | undefined {
	let current: unknown = theme;
	for (const segment of path.split(".")) {
		if (Array.isArray(current)) current = current[Number(segment)];
		else if (isRecord(current)) current = current[segment];
		else return undefined;
	}
	return typeof current === "string" || typeof current === "number" ? current : undefined;
}

function resolveValuePath(root: unknown, path: string): string | number | undefined {
	let current = root;
	for (const segment of path.split(".")) {
		if (Array.isArray(current)) current = current[Number(segment)];
		else if (isRecord(current)) current = current[segment];
		else return undefined;
	}
	return typeof current === "string" || typeof current === "number" ? current : undefined;
}

function resolveMantineValue(
	property: string,
	value: string,
	theme: MantineThemeLike | undefined,
): string | number | undefined {
	const direct = resolveThemePath(theme, value);
	if (direct !== undefined) return direct;
	const group = mantineTokenGroup(property);
	const collection =
		group === "colors"
			? theme?.colors
			: group === "fontSizes"
				? theme?.fontSizes
				: group === "lineHeights"
					? theme?.lineHeights
					: group === "radii"
						? theme?.radius
						: group === "shadows"
							? theme?.shadows
							: group === "spacing"
								? theme?.spacing
								: undefined;
	const collectionValue = resolveValuePath(collection, value);
	if (collectionValue !== undefined) return collectionValue;
	return undefined;
}

async function officialMantineConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<import("../adapter-contract.ts").AdapterProjectConfig> {
	const fallback = {
		adapter: CodemodAdapterId.Mantine,
		root: context.root,
		files: [context.file],
		values: {},
	};
	if (context.root === undefined) return fallback;
	const discovered =
		context
			.listFiles?.(context.root)
			.filter((file) =>
				/(?:^|[\\/])(?:theme|mantine-theme)(?:[\\/](?:index\.)?(?:ts|tsx|js|mjs|cjs)|\.(?:ts|tsx|js|mjs|cjs))$/u.test(
					file,
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
		...discovered,
	];
	const mantine = await loader.importPackage<MantinePackage>("@mantine/core", context.root);
	const hasThemeFile = candidates.some(
		(candidate) =>
			context.readFile?.(
				candidate.startsWith(context.root!)
					? candidate
					: joinDocumentPath(context.root!, candidate),
			) !== undefined,
	);
	if (mantine === undefined)
		return hasThemeFile
			? AdapterEvidence.configurationFailure(
					fallback,
					"Mantine project theme",
					"the official @mantine/core package is unavailable for a discovered theme module",
				)
			: fallback;
	for (const candidate of new Set(candidates)) {
		const path = candidate.startsWith(context.root)
			? candidate
			: joinDocumentPath(context.root, candidate);
		const module = await loader.importFile<Record<string, unknown>>(path);
		if (module === undefined) continue;
		const config = [module.default, ...Object.values(module)]
			.map(mantineThemeCandidate)
			.find((value): value is Record<string, unknown> => value !== undefined);
		if (config === undefined) continue;
		const theme = mantine.createTheme?.(config) ?? (config as MantineThemeLike);
		return {
			...fallback,
			files: [...fallback.files, path],
			tokenCatalog: TokenCatalog.fromNested({
				colors: themeCollection(config.colors),
				spacing: themeCollection(config.spacing),
				fontSizes: themeCollection(config.fontSizes),
				lineHeights: themeCollection(config.lineHeights),
				radii: themeCollection(config.radius),
				shadows: themeCollection(config.shadows),
			})?.contract,
			values: {
				mantineTheme: theme,
				mantineThemeConfig: config,
				officialConfigPackage: "@mantine/core",
			},
		};
	}
	return fallback;
}

function mantineRem(value: string | number): string | undefined {
	const numeric =
		typeof value === "number" ? value : Number(value.endsWith("px") ? value.slice(0, -2) : value);
	if (!Number.isFinite(numeric)) return undefined;
	if (numeric === 0) return "0rem";
	return `calc(${numeric / 16}rem * var(--mantine-scale))`;
}

function mantineValue(property: string, value: StyleValue, theme?: MantineThemeLike): StyleValue {
	if (value.kind !== StyleValueKindTag.Literal) return value;
	const resolved =
		typeof value.value === "string" ? resolveMantineValue(property, value.value, theme) : undefined;
	if (resolved !== undefined) return { kind: StyleValueKindTag.Literal, value: resolved };
	const properties = mantineProperties(property);
	const scaled = properties.some((candidate) => MANTINE_SCALED_PROPERTIES.has(candidate));
	if (scaled && (typeof value.value === "string" || typeof value.value === "number")) {
		const rem = mantineRem(value.value);
		if (rem !== undefined) return { kind: StyleValueKindTag.Literal, value: rem };
	}
	if (typeof value.value !== "string") return value;
	const isMargin = properties.some(
		(candidate) => candidate === "margin" || candidate.startsWith("margin"),
	);
	if (isMargin && value.value === "auto") return value;
	if (/^(?:-?\d+(?:\.\d+)?)(?:px|rem|em|%|vh|vw)$/.test(value.value)) return value;
	if (isMargin && /^[A-Za-z][\w-]*$/.test(value.value))
		return { kind: StyleValueKindTag.Literal, value: `var(--mantine-spacing-${value.value})` };
	if (
		(properties.includes("fontSize") || properties.includes("lineHeight")) &&
		/^[A-Za-z][\w-]*$/.test(value.value)
	)
		return {
			kind: StyleValueKindTag.Literal,
			value: `var(--mantine-${properties.includes("fontSize") ? "font-size" : "line-height"}-${value.value})`,
		};
	if (
		properties.includes("color") &&
		/^(?:red|blue|green|black|white|gray|grey|transparent|currentColor)$/i.test(value.value)
	)
		return value;
	if (properties.includes("color") && /^[A-Za-z][\w-]*$/.test(value.value))
		return { kind: StyleValueKindTag.Literal, value: `var(--mantine-color-${value.value})` };
	return value;
}

function unresolvedMantineTokenResiduals(
	program: StyleProgram,
	theme: MantineThemeLike | undefined,
): StyleProgram["residuals"] {
	const residuals = new Map<string, StyleProgram["residuals"][number]>();
	const inspect = (declaration: StyleProgram["declarations"][number]) => {
		const value = declaration.value;
		if (value.kind !== StyleValueKindTag.Literal || typeof value.value !== "string") return;
		if (!MANTINE_TOKEN_REFERENCE.test(value.value)) return;
		if (mantineTokenGroup(declaration.property) === undefined) return;
		if (resolveMantineValue(declaration.property, value.value, theme) !== undefined) return;
		residuals.set(`${declaration.property}:${value.value}`, {
			kind: StyleProgramResidualKindTag.Configuration,
			text: value.value,
			hint: `Mantine token reference '${value.value}' is unresolved without verified theme metadata`,
		});
	};
	const visit = (rule: StyleProgram["rules"][number]) => {
		rule.declarations.forEach(inspect);
		rule.children.forEach(visit);
	};
	program.declarations.forEach(inspect);
	program.rules.forEach(visit);
	return [...residuals.values()];
}

const MANTINE_SOURCE_COMPONENTS = {
	Box: "div",
	Text: "p",
	Button: "button",
	Anchor: "a",
	Image: "img",
	Paper: "div",
} as const;

export function createMantineAdapter(
	options: { readonly moduleLoader?: ProjectModuleLoader | null } = {},
) {
	const moduleLoader = options.moduleLoader === null ? undefined : options.moduleLoader;
	const adapter = defineCodemodAdapter({
		id: CodemodAdapterId.Mantine,
		officialApi: {
			pluginSystems: ["theme.components", "style", "styles", "classNames", "vars"],
			ssrHooks: ["MantineProvider"],
		},
		patterns: [
			{
				name: "mantine-style-props",
				regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
				form: CodemodCallPatternFormTag.JsxStyle,
				styleProps,
			},
			{
				name: "mantine-createStyles",
				regex: /\bcreateStyles\s*\(\s*\{/g,
				form: CodemodCallPatternFormTag.Object,
				sourceObjectOptions: { namedRuleObjects: true },
				suffix: /\.classes\b/u,
			},
			{
				name: "mantine-style-api",
				regex: /\b(?:styles|classNames|vars)\s*=/g,
				form: CodemodCallPatternFormTag.Residual,
				sourceGuard: (source) => /\bfrom\s*["']@mantine\/core["']/u.test(source),
				residual: {
					kind: "host-framework",
					hint: "Mantine styles, classNames, and vars require component-aware host lowering",
				},
			},
			{
				name: "runtime-context",
				regex: /(?:import[^;\n]*\bMantineProvider\b[^;\n]*;|<MantineProvider\b[^>]*>)/g,
				form: CodemodCallPatternFormTag.Residual,
				residual: {
					kind: StyleProgramResidualKindTag.RuntimeContext,
					hint: "MantineProvider requires target-aware theme and runtime-context lowering",
				},
			},
		],
		packages: CodemodAdapterKit.dependency("@mantine/core", "peer"),
		capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Mantine, "partial", {
			"important-priority": "unsupported",
			"theme-context": "partial",
			"runtime-context": "partial",
			"framework-semantics": "partial",
			components: "partial",
		}),
		namedRuleStrategy: StyleNamedRuleStrategy.NativeMap,
		migration: {
			targetPolicy: {
				handlesHostRewrites: true,
				handlesFrameworkSemantics: true,
				handlesDynamicComponentValues: true,
				handlesSourceHostAttributes: true,
				hostRepresentation: StyleHostRepresentationKind.StyleProp,
				resolveHostRepresentation: ({ program, framework }) => {
					if (StyleProgramAnalysis.hasFunctionDynamic(program)) return undefined;
					return framework === undefined || framework === BuiltinHostFramework.React
						? StyleHostRepresentationKind.StyleProp
						: StyleHostRepresentationKind.Class;
				},
				rewriteComponent: ({
					code,
					binding,
					tag,
					framework,
					emittedExpression,
					attrsExpression,
				}) => {
					if (framework !== BuiltinHostFramework.React)
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: binding,
									hint: `Mantine style-prop projection requires ${BuiltinHostFramework.React}`,
								},
							],
						};
					const escapedBinding = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
					const assignment = new RegExp(
						`\\b(?:const|let|var)\\s+${escapedBinding}\\s*=\\s*[^;]+;`,
					).exec(code);
					if (assignment === null)
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: binding,
									hint: "Mantine style-prop component declaration could not be located",
								},
							],
						};
					const attrsValue = componentAttrsValueExpression(attrsExpression);
					if (attrsExpression !== undefined && attrsValue === undefined)
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: attrsExpression,
									hint: "Mantine component projection requires static attrs or a props callback",
								},
							],
						};
					const declaration =
						attrsExpression === undefined
							? `${binding} = (props) => <${tag} {...props} style={{ ...${emittedExpression}, ...props.style }} />;`
							: `${binding} = (props) => { const attrs = ${attrsValue}; const { as: attrsAs, ...attrsProps } = attrs; const { as: propsAs, ...rest } = props; const Component = attrsAs ?? propsAs ?? ${JSON.stringify(tag)}; return <Component {...rest} {...attrsProps} className={[props.className, attrs.className].filter(Boolean).join(" ")} style={{ ...${emittedExpression}, ...props.style, ...attrs.style }} />; };`;
					const bindingOffset = assignment[0].indexOf(binding);
					return {
						code:
							code.slice(0, assignment.index + bindingOffset) +
							declaration +
							code.slice(assignment.index + assignment[0].length),
						residuals: [],
					};
				},
				rewriteHost: ({ code, binding, representation, program, emittedExpression }) => {
					const sourceHost = rewriteMantineSourceHost({ code, program, emittedExpression });
					if (sourceHost.residuals.length > 0) return sourceHost;
					const host = rewriteMantineClassHost({
						code: sourceHost.code,
						binding,
						representation,
					});
					return { ...host, code: rewriteChakraBoxImport(host.code) };
				},
				resolveRepresentation: ({ program, hostRepresentation }) =>
					hostRepresentation === StyleHostRepresentationKind.Class &&
					program.rules.every((rule) => rule.kind === StyleRuleKindTag.Style) &&
					program.rules.every((rule) => rule.name === undefined) &&
					program.residuals.length === 0
						? StyleRepresentationKind.PortableArtifact
						: undefined,
				capabilitiesForRepresentation: ({ program, representation }) =>
					representation === StyleRepresentationKind.TargetNative &&
					hasScalarDynamicProgram(program)
						? ["dynamic-values", "theme-context"]
						: [],
				preservesResidualKindsForRepresentation: ({ program, representation }) =>
					representation === StyleRepresentationKind.TargetNative &&
					hasScalarDynamicProgram(program)
						? ["dynamic"]
						: [],
			},
		},
		detectPatterns: [/@mantine\/core/, /\b(?:style|sx|maw|fz|c|bg)\s*=/],
		sourceModules: [],
		sourceModulesToRemove: (targetId) =>
			targetId === CodemodAdapterId.Pandwind ? ["@mantine/core"] : [],
		configFiles: ["package.json", "src/theme.ts", "src/theme.js"],
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) =>
						officialMantineConfig(context, moduleLoader),
				}),
		tokenPolicy: MANTINE_TOKEN_POLICY,
		sourceObjectOptions: (source, context) => ({
			propertyAliases,
			valueTransforms: {
				"*": (value, property) => {
					if (
						value.kind !== StyleValueKindTag.Literal ||
						typeof value.value !== "string" ||
						property === undefined
					)
						return value;
					const group = mantineTokenGroup(property);
					if (group === undefined) return value;
					const namespace =
						group === "colors"
							? "color"
							: group === "fontSizes"
								? "font-size"
								: group === "lineHeights"
									? "line-height"
									: group === "radii"
										? "radius"
										: group === "shadows"
											? "shadow"
											: "spacing";
					const matches = Object.entries(context.config.tokenCatalog?.groups[group] ?? {}).filter(
						([reference]) =>
							value.value === `var(--mantine-${namespace}-${reference.replaceAll(".", "-")})`,
					);
					if (matches.length !== 1) return value;
					return {
						kind: StyleValueKindTag.Token,
						ref: matches[0]![0],
						authored: value.value,
						resolved: matches[0]![1],
					};
				},
				...Object.fromEntries(
					styleProps.map((property) => [
						property,
						(value: StyleValue) =>
							recoverSourceToken(
								mantineValue(
									property,
									value,
									context.config.values.mantineTheme as MantineThemeLike | undefined,
								),
								property,
								mantineTokenGroup,
								TokenCatalog.fromContract(context.config.tokenCatalog),
							),
					]),
				),
			},
		}),
		emit(program, { programObject }, context) {
			if (program.rules.some((rule) => rule.kind !== StyleRuleKindTag.Style))
				return {
					text: programObject(program),
					residuals: [
						{
							kind: "rule-level",
							text: program.rules.map((rule) => rule.kind).join(", "),
							hint: "Mantine standalone style projection supports style rules only",
						},
					],
				};
			const styleObject = programObject(program);
			if (
				context?.host?.subject !== undefined ||
				context?.host?.representation === StyleHostRepresentationKind.StyleProp
			)
				return { text: styleObject, semantic: program };
			if (program.rules.some((rule) => rule.name !== undefined))
				return {
					text: styleObject,
					residuals: [
						{
							kind: "host-framework",
							text: styleObject,
							hint: "Mantine style maps require a host component style prop or an explicit CSS module",
						},
					],
				};
			return {
				text: styleObject,
				residuals: [
					{
						kind: "host-framework",
						text: styleObject,
						hint: "Mantine standalone styles require a host style prop or a portable Pandwind artifact",
					},
				],
			};
		},
	});
	return {
		...adapter,
		parse(source: string, context: AdapterParseContext) {
			const parsed = adapter.parse(source, context);
			const theme = context.config.values.mantineTheme as MantineThemeLike | undefined;
			return {
				...parsed,
				matches: parsed.matches.map((match) => {
					const program =
						context.targetId === CodemodAdapterId.Pandwind
							? canonicalizeSourceHost(match.program, MANTINE_SOURCE_COMPONENTS, "Mantine")
							: match.program;
					const residuals = unresolvedMantineTokenResiduals(program, theme);
					return residuals.length === 0
						? { ...match, program }
						: {
								...match,
								program: { ...program, residuals: [...program.residuals, ...residuals] },
							};
				}),
			};
		},
	};
}
