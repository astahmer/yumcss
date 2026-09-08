import { CodemodCallPatternFormTag } from "../identifiers.ts";
import { StyleProgramResidualKindTag, StyleValueKindTag } from "../semantic-ir.ts";
import { CodemodAdapterKit, defineCodemodAdapter } from "../external-adapters.ts";
import type {
	AdapterConfigContext,
	AdapterHostRewriteResult,
	AdapterTokenPolicy,
} from "../adapter-contract.ts";
import type { StyleProgram, StyleValue } from "../semantic-ir.ts";
import {
	BuiltinHostFramework,
	canConvertStaticVueSfc,
	rewriteVueSfcToJsx,
} from "../host-adapters.ts";
import {
	CodemodAdapterId,
	CodemodCallPatternKindTag,
	StyleHostRepresentationKind,
	StyleNamedRuleStrategy,
	StyleRepresentationKind,
} from "../identifiers.ts";
import {
	componentExpressionForSubject,
	intrinsicTagForSubject,
} from "../host-component-rewriter.ts";
import { StyleProgramAnalysis } from "../style-program-analysis.ts";
import { AdapterEvidence } from "../adapter-evidence.ts";
import type { ProjectModuleLoader } from "../project-module-loader.ts";
import { joinDocumentPath } from "../../path-utils.ts";
import { TokenCatalog } from "../tokens.ts";

const muiTokenGroup = (property: string): string | undefined => {
	if (property === "color" || property.endsWith("Color")) return "colors";
	if (property === "borderRadius") return "radii";
	if (/^(?:padding|margin|gap|inset)/u.test(property)) return "spacing";
	if (property === "fontSize") return "fontSizes";
	if (property === "fontWeight") return "fontWeights";
	if (property === "lineHeight") return "lineHeights";
	if (property === "letterSpacing") return "letterSpacings";
	if (property === "fontFamily") return "fonts";
	if (property === "boxShadow") return "shadows";
	if (property === "zIndex") return "zIndices";
	return undefined;
};

const MUI_TOKEN_POLICY: AdapterTokenPolicy = {
	schema: "pandwind.adapter-token-policy/1",
	preserve: (program, context) =>
		TokenCatalog.fromContract(context.config.tokenCatalog)?.preserveProgram(
			program,
			muiTokenGroup,
			(match) => match.ref,
		) ?? program,
};

// These are documented MUI source spellings, not a project vocabulary. The
// official theme loader below supplies project-specific values and overrides
// the no-context source parser where possible.
const spacing = new Set([
	"m",
	"mt",
	"mr",
	"mb",
	"ml",
	"mx",
	"my",
	"p",
	"pt",
	"pr",
	"pb",
	"pl",
	"px",
	"py",
]);
const styleProps = ["sx"] as const;
const propertyAliases = {
	m: "margin",
	mt: "marginTop",
	mr: "marginRight",
	mb: "marginBottom",
	ml: "marginLeft",
	mx: ["marginLeft", "marginRight"],
	my: ["marginTop", "marginBottom"],
	p: "padding",
	pt: "paddingTop",
	pr: "paddingRight",
	pb: "paddingBottom",
	pl: "paddingLeft",
	px: ["paddingLeft", "paddingRight"],
	py: ["paddingTop", "paddingBottom"],
	bgcolor: "backgroundColor",
} as const;

interface MuiThemeLike {
	readonly spacing?:
		| ((factor: number | string) => string | number)
		| readonly unknown[]
		| Record<string, unknown>;
	readonly palette?: Record<string, unknown>;
	readonly shape?: Record<string, unknown>;
	readonly typography?: Record<string, unknown>;
	readonly shadows?: unknown;
	readonly zIndex?: unknown;
}

interface MuiPackage {
	readonly createTheme?: (options?: Record<string, unknown>) => MuiThemeLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function muiThemeCandidate(value: unknown): Record<string, unknown> | undefined {
	if (!isRecord(value)) return undefined;
	// `spacing` alone is not enough to identify a MUI theme: Mantine exposes
	// the same field. Require metadata owned by MUI's theme contract.
	return ["palette", "shape", "typography", "breakpoints", "shadows", "zIndex"].some(
		(key) => value[key] !== undefined,
	)
		? value
		: undefined;
}

function resolveThemePath(
	theme: MuiThemeLike | undefined,
	path: string,
): string | number | undefined {
	let current: unknown = theme;
	for (const segment of path.split(".")) {
		if (typeof current === "function") return undefined;
		if (Array.isArray(current)) current = current[Number(segment)];
		else if (isRecord(current)) current = current[segment];
		else return undefined;
	}
	return typeof current === "string" || typeof current === "number" ? current : undefined;
}

function resolveMuiValue(
	property: string,
	value: string,
	theme: MuiThemeLike | undefined,
): string | number | undefined {
	const direct = resolveThemePath(theme, value);
	if (direct !== undefined) return direct;
	if (property === "color" || property === "backgroundColor" || property === "borderColor")
		return resolveThemePath(theme?.palette as MuiThemeLike | undefined, value);
	if (
		property === "fontFamily" ||
		property === "fontSize" ||
		property === "fontWeight" ||
		property === "lineHeight" ||
		property === "letterSpacing"
	)
		return resolveThemePath(theme?.typography as MuiThemeLike | undefined, value);
	if (property === "boxShadow") return resolveValuePath(theme?.shadows, value);
	if (property === "zIndex") return resolveValuePath(theme?.zIndex, value);
	return undefined;
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

function typographyCollection(value: unknown, field: string): unknown {
	if (!isRecord(value)) return undefined;
	return Object.fromEntries(
		Object.entries(value).flatMap(([key, entry]) => {
			if (!isRecord(entry)) return [];
			const fieldValue = entry[field];
			return typeof fieldValue === "string" || typeof fieldValue === "number"
				? [[key, fieldValue]]
				: [];
		}),
	);
}

function themeCollection(value: unknown): unknown {
	if (!Array.isArray(value)) return value;
	return Object.fromEntries(value.map((entry, index) => [String(index), entry]));
}

function muiThemeShape(shape: unknown): unknown {
	if (shape === null || typeof shape !== "object") return undefined;
	const borderRadius = (shape as Record<string, unknown>).borderRadius;
	return borderRadius === undefined ? undefined : { base: borderRadius };
}

async function officialMuiConfig(
	context: AdapterConfigContext,
	loader: ProjectModuleLoader,
): Promise<import("../adapter-contract.ts").AdapterProjectConfig> {
	const fallback = {
		adapter: CodemodAdapterId.Mui,
		root: context.root,
		files: [context.file],
		values: {},
	};
	if (context.root === undefined) return fallback;
	const discovered =
		context
			.listFiles?.(context.root)
			.filter((file) =>
				/(?:^|[\\/])(?:theme|mui-theme)(?:[\\/](?:index\\.)?(?:ts|tsx|js|mjs|cjs)|\\.(?:ts|tsx|js|mjs|cjs))$/u.test(
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
	const muiSystem = await loader.importPackage<MuiPackage>("@mui/system", context.root);
	const mui = muiSystem ?? (await loader.importPackage<MuiPackage>("@mui/material", context.root));
	const officialPackage = muiSystem === undefined ? "@mui/material" : "@mui/system";
	const hasThemeFile = candidates.some(
		(candidate) =>
			context.readFile?.(
				candidate.startsWith(context.root!)
					? candidate
					: joinDocumentPath(context.root!, candidate),
			) !== undefined,
	);
	if (mui === undefined)
		return hasThemeFile
			? AdapterEvidence.configurationFailure(
					fallback,
					"MUI project theme",
					"the official @mui/system or @mui/material package is unavailable for a discovered theme module",
				)
			: fallback;
	for (const candidate of new Set(candidates)) {
		const path = candidate.startsWith(context.root)
			? candidate
			: joinDocumentPath(context.root, candidate);
		const module = await loader.importFile<Record<string, unknown>>(path);
		if (module === undefined) continue;
		const config = [module.default, ...Object.values(module)]
			.map(muiThemeCandidate)
			.find((value): value is Record<string, unknown> => value !== undefined);
		if (config === undefined) continue;
		const theme = mui.createTheme?.(config) ?? (config as MuiThemeLike);
		return {
			...fallback,
			files: [...fallback.files, path],
			tokenCatalog: TokenCatalog.fromNested({
				colors: config.palette,
				spacing: themeCollection(config.spacing),
				radii: muiThemeShape(config.shape),
				fontSizes: typographyCollection(config.typography, "fontSize"),
				fontWeights: typographyCollection(config.typography, "fontWeight"),
				lineHeights: typographyCollection(config.typography, "lineHeight"),
				shadows: themeCollection(config.shadows),
				zIndices: themeCollection(config.zIndex),
			})?.contract,
			values: {
				muiTheme: theme,
				muiThemeConfig: config,
				officialConfigPackage: officialPackage,
			},
		};
	}
	return fallback;
}

function defaultSpacing(property: string, value: StyleValue, theme?: MuiThemeLike): StyleValue {
	if (value.kind !== StyleValueKindTag.Literal) return value;
	if (spacing.has(property) && typeof value.value === "number") {
		const resolved =
			typeof theme?.spacing === "function"
				? theme.spacing(value.value)
				: Array.isArray(theme?.spacing)
					? theme.spacing[value.value]
					: isRecord(theme?.spacing)
						? theme.spacing[String(value.value)]
						: undefined;
		if (typeof resolved === "string" || typeof resolved === "number")
			return { kind: "literal", value: resolved };
		return { kind: "literal", value: `${value.value * 8}px` };
	}
	if (property === "borderRadius" && typeof value.value === "number") {
		const base = theme?.shape?.borderRadius;
		if (typeof base === "number") return { kind: "literal", value: `${value.value * base}px` };
		if (typeof base === "string") return { kind: "literal", value: base };
		return { kind: "literal", value: `${value.value * 4}px` };
	}
	if (
		typeof value.value === "string" &&
		/^[A-Za-z_$][\w$-]*\.[A-Za-z_$][\w$-]*$/.test(value.value)
	) {
		return { kind: "literal", value: `var(--mui-${value.value.replace(".", "-")})` };
	}
	return value;
}

function muiTransforms(
	source: string,
	theme?: MuiThemeLike,
): Readonly<Record<string, (value: StyleValue) => StyleValue>> {
	return Object.fromEntries(
		[
			...spacing,
			"bgcolor",
			"backgroundColor",
			"color",
			"borderRadius",
			"fontSize",
			"fontWeight",
			"lineHeight",
			"letterSpacing",
			"boxShadow",
			"zIndex",
		].map((property) => [
			property,
			(value: StyleValue) => {
				if (value.kind === StyleValueKindTag.Literal && typeof value.value === "string") {
					const resolved = resolveMuiValue(property, value.value, theme);
					if (resolved !== undefined) return { kind: "literal", value: resolved };
					const [group, key] = value.value.split(".");
					if (group !== undefined && key !== undefined) {
						const escapedGroup = group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
						const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
						const resolved = new RegExp(
							`\\b${escapedGroup}\\s*:\\s*\\{[^{}]*\\b${escapedKey}\\s*:\\s*(['"])(.*?)\\1`,
						).exec(source)?.[2];
						if (resolved !== undefined) return { kind: "literal", value: resolved };
					}
				}
				return defaultSpacing(property, value, theme);
			},
		]),
	);
}

function renderMuiSxHost(
	openingTag: string,
	styleAttributes: readonly string[],
	styleObject: string,
): string {
	let tag = openingTag;
	for (const raw of styleAttributes) {
		const index = tag.indexOf(raw);
		if (index === -1) continue;
		const whitespace = index > 0 && /[ \t]/.test(tag[index - 1]!) ? 1 : 0;
		tag = `${tag.slice(0, index - whitespace)}${tag.slice(index + raw.length)}`;
	}
	const insertion = tag.endsWith("/>") ? tag.length - 2 : tag.length - 1;
	return `${tag.slice(0, insertion)} sx={${styleObject}}${tag.slice(insertion)}`;
}

function findTagEnd(source: string, start: number): number | undefined {
	let quote: string | undefined;
	let braces = 0;
	for (let index = start; index < source.length; index++) {
		const character = source[index]!;
		if (quote !== undefined) {
			if (character === quote && source[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === '"' || character === "'" || character === "`") {
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

interface HostUse {
	readonly start: number;
	readonly end: number;
	readonly openingEnd: number;
	readonly tag: string;
	readonly opening: string;
	readonly attribute: string;
}

function findHostUse(source: string, binding: string | undefined): HostUse | undefined {
	if (binding === undefined) return undefined;
	const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const attribute = new RegExp(`\\b(?:className|class)\\s*=\\s*\\{\\s*${escaped}\\s*\\}`);
	for (const match of source.matchAll(/<[A-Za-z][\w:.-]*/g)) {
		const start = match.index ?? 0;
		const openingEnd = findTagEnd(source, start);
		if (openingEnd === undefined) continue;
		const opening = source.slice(start, openingEnd + 1);
		const attributeMatch = attribute.exec(opening);
		if (attributeMatch === null) continue;
		const tag = /^<([A-Za-z][\w:.-]*)/.exec(opening)?.[1];
		if (tag === undefined) continue;
		return {
			start,
			end: openingEnd + 1,
			openingEnd,
			tag,
			opening,
			attribute: attributeMatch[0],
		};
	}
	return undefined;
}

function tagForOpening(opening: string | undefined): string | undefined {
	return opening === undefined ? undefined : /^<([A-Za-z][\w:.-]*)/.exec(opening)?.[1];
}

function isKnownMuiComponent(source: string, tag: string): boolean {
	if (tag === "Box") return true;
	const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(
		`import\\s+\\{[^}]*\\b${escaped}(?:\\s+as\\s+${escaped})?\\b[^}]*\\}\\s+from\\s+["']@mui\\/(?:material|system)["']`,
	).test(source);
}

function isStaticProgram(program: StyleProgram): boolean {
	return (
		program.residuals.length === 0 &&
		StyleProgramAnalysis.declarations(program).every(
			(declaration) => declaration.value.kind !== StyleValueKindTag.Dynamic,
		)
	);
}

function hasScalarDynamicProgram(program: StyleProgram): boolean {
	return StyleProgramAnalysis.hasScalarDynamic(program);
}

function rewriteMuiIntrinsicHost(
	code: string,
	expression: string,
	host: HostUse,
): AdapterHostRewriteResult {
	const opening = host.opening;
	const selfClosing = /\/\s*>$/.test(opening);
	const attributes = opening
		.slice(1 + host.tag.length, -1)
		.replace(/\/\s*$/, "")
		.replace(host.attribute, "")
		.trim();
	const suffix = attributes === "" ? "" : ` ${attributes}`;
	const replacement = `<Box component=${JSON.stringify(host.tag)}${suffix} sx={${expression}}${selfClosing ? " /" : ""}>`;
	let rewritten = `${code.slice(0, host.start)}${replacement}${code.slice(host.end)}`;
	if (!selfClosing) {
		const closing = new RegExp(`<\\/\\s*${host.tag}\\s*>`).exec(
			rewritten.slice(host.start + replacement.length),
		);
		if (closing !== null) {
			const closingStart = host.start + replacement.length + closing.index;
			rewritten = `${rewritten.slice(0, closingStart)}</Box>${rewritten.slice(closingStart + closing[0].length)}`;
		}
	}
	return {
		code: rewritten,
		imports: ['import { Box } from "@mui/material";'],
		residuals: [],
	};
}

export function createMuiAdapter(
	options: { readonly moduleLoader?: ProjectModuleLoader | null } = {},
) {
	const moduleLoader = options.moduleLoader === null ? undefined : options.moduleLoader;
	return defineCodemodAdapter({
		id: CodemodAdapterId.Mui,
		officialApi: {
			pluginSystems: ["theme.components", "styleOverrides", "variants", "sx"],
			ssrHooks: ["StyledEngineProvider", "ServerStyleSheets"],
		},
		patterns: [
			{
				name: "mui-sx",
				regex: /<[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\b/g,
				form: CodemodCallPatternFormTag.JsxStyle,
				styleProps,
			},
			{
				name: "mui-styled",
				kind: CodemodCallPatternKindTag.Styled,
				regex: /\bstyled\s*\(\s*[^)]+\s*\)\s*\(\s*\{/g,
			},
			{
				name: "mui-styled-theme-callback",
				regex: /\bstyled\s*\(\s*[^)]+\s*\)\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
				form: CodemodCallPatternFormTag.Residual,
				residual: {
					kind: StyleProgramResidualKindTag.RuntimeContext,
					hint: "MUI styled theme callbacks require target-aware theme lowering",
				},
			},
			{
				name: "runtime-context",
				regex:
					/(?:import[^;\n]*\b(?:ThemeProvider|StyledEngineProvider)\b[^;\n]*;|<(?:ThemeProvider|StyledEngineProvider)\b[^>]*>)/g,
				form: CodemodCallPatternFormTag.Residual,
				residual: {
					kind: StyleProgramResidualKindTag.RuntimeContext,
					hint: "MUI providers require target-aware theme and style-engine lowering",
				},
			},
		],
		packages: {
			packages: [
				CodemodAdapterKit.dependency("@mui/system", "peer").packages[0]!,
				CodemodAdapterKit.dependency("@mui/material", "peer").packages[0]!,
			],
		},
		capabilities: CodemodAdapterKit.allRuleCapabilities(CodemodAdapterId.Mui, "partial", {
			"function-values": "exact",
			"theme-context": "partial",
			"runtime-context": "partial",
			components: "exact",
		}),
		namedRuleStrategy: StyleNamedRuleStrategy.ClassMap,
		detectPatterns: [/@mui\/(?:system|material)/, /\bsx\s*=/, /\bstyled\s*\(/],
		sourceModules: [],
		configFiles: ["package.json", "src/theme.ts", "src/theme.js"],
		...(moduleLoader === undefined
			? {}
			: {
					loadConfigAsync: (context: AdapterConfigContext) =>
						officialMuiConfig(context, moduleLoader),
				}),
		tokenPolicy: MUI_TOKEN_POLICY,
		sourceObjectOptions: (source, context) => ({
			propertyAliases,
			valueTransforms: muiTransforms(
				source,
				context.config.values.muiTheme as MuiThemeLike | undefined,
			),
		}),
		emit(program, { programObject }, context) {
			const subject = program.source?.subject;
			if (subject !== undefined) {
				if (
					context?.host?.framework !== undefined &&
					context.host.framework !== BuiltinHostFramework.React
				)
					return {
						text: programObject(program),
						residuals: [
							{
								kind: "host-framework",
								text: subject,
								hint: `MUI styled projection requires ${BuiltinHostFramework.React}`,
							},
						],
					};
				const tag = intrinsicTagForSubject(subject);
				const base = componentExpressionForSubject(subject);
				const targetSubject = tag === undefined ? (base ?? subject) : JSON.stringify(tag);
				return {
					text: `styled(${targetSubject})(${programObject(program)})`,
					imports: ['import { styled } from "@mui/system";'],
				};
			}
			if (context?.host?.representation === StyleHostRepresentationKind.StyleProp) {
				const styleObject = programObject(program);
				if (program.source?.hostOpenTag !== undefined)
					return {
						text: renderMuiSxHost(
							program.source.hostOpenTag,
							program.source.hostStyleAttributes ?? [],
							styleObject,
						),
					};
				return { text: styleObject };
			}
			if (
				context?.host?.representation === StyleHostRepresentationKind.Class &&
				context.host.representationKind === StyleRepresentationKind.PortableArtifact
			)
				return {
					text: `css.class(${programObject(program)})`,
					imports: ['import { createCss } from "pandwind/css";', "const css = createCss();"],
					semantic: program,
				};
			if (program.source?.hostOpenTag !== undefined) return { text: programObject(program) };
			return {
				text: programObject(program),
				residuals: [
					{
						kind: "host-framework",
						text: programObject(program),
						hint: "MUI sx styles require a host component prop; no standalone sx() API exists",
					},
				],
			};
		},
		migration: {
			targetPolicy: {
				handlesHostRewrites: true,
				requiresHostContext: true,
				hostContextRequiredHint:
					"MUI sx styles require a host component prop; no standalone sx() API exists",
				hostRepresentation: StyleHostRepresentationKind.Component,
				resolveHostRepresentation: ({ program, hasHostContext, framework, source, binding }) =>
					program.source?.subject === undefined && !hasHostContext
						? StyleHostRepresentationKind.Class
						: (framework === undefined || framework === BuiltinHostFramework.React) &&
							  program.source?.subject === undefined
							? (() => {
									const host = findHostUse(source ?? "", binding);
									const tag = host?.tag ?? tagForOpening(program.source?.hostOpenTag);
									if (tag === undefined) return undefined;
									return tag[0] === tag[0]?.toLowerCase() || isKnownMuiComponent(source ?? "", tag)
										? StyleHostRepresentationKind.StyleProp
										: isStaticProgram(program)
											? StyleHostRepresentationKind.Class
											: undefined;
								})()
							: framework === undefined || framework === BuiltinHostFramework.React
								? StyleHostRepresentationKind.Component
								: undefined,
				standaloneHostRepresentation: StyleHostRepresentationKind.Component,
				resolveRepresentation: ({ program, hostRepresentation }) =>
					hostRepresentation === StyleHostRepresentationKind.Class &&
					program.source?.subject === undefined &&
					program.residuals.length === 0
						? StyleRepresentationKind.PortableArtifact
						: program.source?.subject !== undefined && hasScalarDynamicProgram(program)
							? StyleRepresentationKind.TargetNative
							: undefined,
				capabilitiesForRepresentation: ({ program, representation }) => {
					if (representation === StyleRepresentationKind.PortableArtifact) return ["theme-context"];
					if (
						representation === StyleRepresentationKind.TargetNative &&
						hasScalarDynamicProgram(program)
					)
						return ["dynamic-values", "theme-context"];
					return [];
				},
				preservesResidualKindsForRepresentation: ({ program, representation }) =>
					representation === StyleRepresentationKind.TargetNative &&
					hasScalarDynamicProgram(program)
						? ["dynamic"]
						: [],
				handlesFrameworkSemantics: true,
				hostFrameworks: [BuiltinHostFramework.React],
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
									hint: `MUI sx host projection requires ${BuiltinHostFramework.React}`,
								},
							],
						};
					const expression = binding === undefined ? emittedExpression : binding;
					const host = findHostUse(code, binding);
					if (host === undefined)
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: expression,
									hint: "MUI sx host projection could not find the converted class binding",
								},
							],
						};
					if (host.tag[0] === host.tag[0]?.toLowerCase())
						return rewriteMuiIntrinsicHost(code, expression, host);
					if (!isKnownMuiComponent(code, host.tag))
						return {
							code,
							residuals: [
								{
									kind: "host-framework",
									text: host.tag,
									hint: "MUI sx projection requires an intrinsic Box wrapper or a known MUI component",
								},
							],
						};
					const escaped = expression.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
					const pattern = new RegExp(`(\\b)(?:className|class)\\s*=\\s*\\{\\s*${escaped}\\s*\\}`);
					return {
						code: code.replace(pattern, `$1sx={${expression}}`),
						residuals: [],
					};
				},
			},
		},
	});
}
