/**
 * Pure helpers for the css() static extractor — shared, unit-testable and
 * free of vite/rollup types.
 *
 * The extractor scans source files for `css(...)`, `css.class(...)` and
 * `css.raw(...)` calls with literal arguments, resolves them through the
 * design layer (`resolveDesignStyle`) and feeds the result to a shared
 * `createStylesheet` instance. The generated CSS is served as a virtual
 * module, so no runtime stylesheet accumulation is needed for static calls.
 */
import { type Expression, parseSync } from "oxc-parser";
import { createCss } from "../css/create-css.ts";
import type { AnyClassNameStrategy } from "../css/class-name-strategy.ts";
import { resolveDesignStyle } from "../design/resolve.ts";
import { evalLiteral, type OxcNode, walk } from "../tw/literal.ts";
import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	StyleObject,
} from "../types/typings.ts";

export type CssPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;

interface ImportNode extends OxcNode {
	source?: { value?: string };
	specifiers?: OxcSpecifier[];
}

interface OxcSpecifier {
	type: string;
	imported?: { name?: string };
	local?: { name?: string };
}

interface CallNode extends OxcNode {
	start: number;
	end: number;
	callee: OxcNode | null;
	arguments: unknown[];
}

export interface CssSourceProvenance {
	file: string;
	start: number;
	end: number;
	line: number;
	column: number;
	callKind: "css" | "css.class" | "css.raw" | "pattern";
}

export interface CssCallSite extends CssSourceProvenance {
	/** Number of arguments whose object shape can be extracted at build time. */
	staticArguments: number;
	/** Number of arguments left to the runtime because they are dynamic. */
	dynamicArguments: number;
}

export type CssDiagnosticKind = "unsupported-construct" | "missing-extraction";

export interface CssDiagnostic {
	kind: CssDiagnosticKind;
	file: string;
	line: number;
	column: number;
	start: number;
	end: number;
	message: string;
	suggestion: string;
}

export interface ExtractedCssStyle {
	style: StyleObject;
	provenance: CssSourceProvenance;
}

const PATTERN_BASES: Record<string, Record<string, unknown>> = {
	Box: {},
	Container: {},
	VStack: { display: "flex", flexDirection: "column" },
	Stack: { display: "flex", flexDirection: "column" },
	HStack: { display: "flex", flexDirection: "row" },
	Center: { display: "flex", alignItems: "center", justifyContent: "center" },
	Flex: { display: "flex" },
	Grid: { display: "grid" },
	Wrap: { display: "flex", flexWrap: "wrap", alignItems: "center" },
	Circle: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: "9999px",
	},
	Square: { display: "flex", alignItems: "center", justifyContent: "center" },
};

const PATTERN_SPECIAL_PROPS: Record<string, Record<string, string>> = {
	Stack: { direction: "flexDirection", align: "alignItems", justify: "justifyContent" },
	VStack: { align: "alignItems", justify: "justifyContent" },
	HStack: { align: "alignItems", justify: "justifyContent" },
	Center: {},
	Flex: {
		direction: "flexDirection",
		align: "alignItems",
		justify: "justifyContent",
		wrap: "flexWrap",
		basis: "flexBasis",
		grow: "flexGrow",
		shrink: "flexShrink",
	},
	Grid: {},
	Wrap: {},
	Circle: {},
	Square: {},
};

const PATTERN_IGNORED_PROPS = new Set(["as", "className", "css"]);
const PATTERN_ALIASES: Record<string, string> = {
	p: "padding",
	px: "paddingInline",
	py: "paddingBlock",
	pt: "paddingTop",
	pb: "paddingBottom",
	pl: "paddingLeft",
	pr: "paddingRight",
	ps: "paddingInlineStart",
	pe: "paddingInlineEnd",
	m: "margin",
	mx: "marginInline",
	my: "marginBlock",
	mt: "marginTop",
	mb: "marginBottom",
	ml: "marginLeft",
	mr: "marginRight",
	ms: "marginInlineStart",
	me: "marginInlineEnd",
	bg: "backgroundColor",
	rounded: "borderRadius",
	w: "width",
	h: "height",
	minW: "minWidth",
	minH: "minHeight",
	maxW: "maxWidth",
	maxH: "maxHeight",
	pos: "position",
	shadow: "boxShadow",
	insetStart: "insetInlineStart",
	insetEnd: "insetInlineEnd",
};
const DOM_PROP_NAMES = new Set([
	"id",
	"role",
	"href",
	"src",
	"alt",
	"title",
	"target",
	"rel",
	"type",
	"name",
	"value",
	"disabled",
	"checked",
	"tabIndex",
	"hidden",
]);

type JsxAttributeNode = {
	type?: string;
	name?: { name?: string };
	value?: OxcNode | null;
};

type JsxElementNode = {
	start: number;
	end: number;
	openingElement?: {
		name?: { type?: string; name?: string };
		attributes?: JsxAttributeNode[];
	};
};

const evalJsxAttribute = (value: OxcNode | null | undefined): unknown | null => {
	if (value === null || value === undefined) return true;
	if (value.type === "JSXExpressionContainer") {
		const expression = (value as { expression?: OxcNode }).expression;
		if (expression?.type === "JSXEmptyExpression") return null;
		return expression === undefined ? null : evalLiteral(expression as unknown as Expression);
	}
	return evalLiteral(value as unknown as Expression);
};

function findPatternImports(program: OxcNode): Map<string, string> {
	const names = new Map<string, string>();
	walk(program, (node) => {
		if (node.type !== "ImportDeclaration") return;
		const source = (node as ImportNode).source?.value;
		if (typeof source !== "string" || !source.endsWith("/pandwind/jsx")) return;
		for (const specifier of (node as ImportNode).specifiers ?? []) {
			if (specifier.type !== "ImportSpecifier") continue;
			const imported = specifier.imported?.name;
			const local = specifier.local?.name;
			if (typeof imported === "string" && typeof local === "string" && PATTERN_BASES[imported]) {
				names.set(local, imported);
			}
		}
	});
	return names;
}

function extractPatternSources(
	code: string,
	id: string,
	preset: CssPreset,
): Array<ExtractedCssStyle> {
	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const importedPatterns = findPatternImports(result.program as unknown as OxcNode);
	if (importedPatterns.size === 0) return [];
	const sources: Array<ExtractedCssStyle> = [];
	walk(result.program, (node) => {
		if (node.type !== "JSXElement") return;
		const element = node as unknown as JsxElementNode;
		const name = element.openingElement?.name;
		const pattern =
			name?.type === "JSXIdentifier" ? importedPatterns.get(name.name ?? "") : undefined;
		if (pattern === undefined) return;
		const style: Record<string, unknown> = { ...PATTERN_BASES[pattern] };
		for (const attribute of element.openingElement?.attributes ?? []) {
			const prop = attribute.name?.name;
			if (prop === undefined || PATTERN_IGNORED_PROPS.has(prop) || DOM_PROP_NAMES.has(prop))
				continue;
			if (prop.startsWith("data-") || prop.startsWith("aria-") || prop.startsWith("on")) continue;
			const value = evalJsxAttribute(attribute.value);
			if (value === null) return;
			const special = PATTERN_SPECIAL_PROPS[pattern]?.[prop];
			if (special !== undefined) style[special] = value;
			else if ((pattern === "Circle" || pattern === "Square") && prop === "size") {
				style.width = value;
				style.height = value;
			} else if (pattern === "Grid" && prop === "columns" && typeof value === "number") {
				style.gridTemplateColumns = `repeat(${value}, minmax(0, 1fr))`;
			} else if (pattern === "Grid" && prop === "rows" && typeof value === "number") {
				style.gridTemplateRows = `repeat(${value}, minmax(0, 1fr))`;
			} else if (!(pattern === "Grid" && (prop === "columns" || prop === "rows"))) {
				style[prop] = value;
			}
		}
		const canonicalStyle = Object.fromEntries(
			Object.entries(style).map(([prop, value]) => [PATTERN_ALIASES[prop] ?? prop, value]),
		);
		const before = code.slice(0, element.start);
		sources.push({
			style: resolveDesignStyle(canonicalStyle, preset.tokens),
			provenance: {
				file: id,
				start: element.start,
				end: element.end,
				line: before.split("\n").length,
				column: element.start - (before.lastIndexOf("\n") + 1) + 1,
				callKind: "pattern",
			},
		});
	});
	return sources;
}

/** True when the module `id` should be scanned for css() calls. */
export const isCssSource = (source: string, matchers: Array<string | RegExp>): boolean => {
	const basename =
		source
			.split("/")
			.pop()
			?.replace(/\.[jt]sx?$/, "") ?? source;
	return matchers.some((matcher) =>
		typeof matcher === "string" ? basename === matcher || source === matcher : matcher.test(source),
	);
};

/**
 * Collect local bindings imported from css modules. A binding is considered
 * a css function when it's imported (named or default) as `css` from a
 * matching source — e.g. `import { css } from "./design"` or
 * `import css from "./css"`. The design-lane naming convention (`dcss`,
 * distinct from engine css() instances) is accepted identically:
 * `import { dcss } from "./design"`.
 */
export function findCssImports(
	code: string,
	id: string,
	matchers: Array<string | RegExp>,
): Set<string> {
	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const names = new Set<string>();

	walk(result.program, (node) => {
		if (node.type !== "ImportDeclaration") return;
		const source = (node as ImportNode).source?.value;
		if (typeof source !== "string" || !isCssSource(source, matchers)) return;
		for (const specifier of (node as ImportNode).specifiers ?? []) {
			if (specifier.type === "ImportSpecifier") {
				const imported = specifier.imported?.name;
				const local = specifier.local?.name;
				if ((imported === "css" || imported === "dcss") && typeof local === "string") {
					names.add(local);
				}
			} else if (specifier.type === "ImportDefaultSpecifier") {
				const local = specifier.local?.name;
				if (typeof local === "string") names.add(local);
			}
		}
	});

	return names;
}

const isMemberCall = (callee: OxcNode | null, cssNames: ReadonlySet<string>): boolean => {
	if (callee?.type !== "MemberExpression") return false;
	const object = (callee as { object?: OxcNode | null }).object;
	if (object?.type !== "Identifier") return false;
	const property = (callee as { property?: OxcNode | null }).property;
	const member = (property as { name?: string } | null)?.name;
	return (
		cssNames.has((object as { name?: string }).name ?? "") &&
		(member === "class" || member === "raw")
	);
};

const callLocation = (code: string, call: CallNode): Pick<CssSourceProvenance, "line" | "column"> => {
	const before = code.slice(0, call.start);
	return {
		line: before.split("\n").length,
		column: call.start - (before.lastIndexOf("\n") + 1) + 1,
	};
};

const memberName = (callee: OxcNode | null): string | undefined => {
	if (callee?.type !== "MemberExpression") return undefined;
	return (callee as { property?: { name?: string } | null }).property?.name;
};

const callKindFor = (
	callee: OxcNode | null,
	cssNames: ReadonlySet<string>,
): CssSourceProvenance["callKind"] | undefined => {
	if (callee?.type === "Identifier" && cssNames.has(callee.name as string)) return "css";
	if (callee?.type !== "MemberExpression" || !isMemberCall(callee, cssNames)) return undefined;
	const member = memberName(callee);
	return member === "class" || member === "raw" ? `css.${member}` : undefined;
};

const isObjectLiteral = (argument: unknown): boolean => {
	const literal = evalLiteral(argument as Expression);
	return typeof literal === "object" && literal !== null;
};

/** Find supported css() call sites, including calls partially left dynamic. */
export function findCssCallSites(
	code: string,
	id: string,
	cssNames: ReadonlySet<string>,
): Array<CssCallSite> {
	if (cssNames.size === 0) return [];
	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const sites: Array<CssCallSite> = [];

	walk(result.program, (node) => {
		if (node.type !== "CallExpression") return;
		const call = node as CallNode;
		const callKind = callKindFor(call.callee, cssNames);
		if (callKind === undefined) return;
		const location = callLocation(code, call);
		let staticArguments = 0;
		for (const argument of call.arguments) {
			if (isObjectLiteral(argument)) staticArguments++;
		}
		sites.push({
			file: id,
			start: call.start,
			end: call.end,
			...location,
			callKind,
			staticArguments,
			dynamicArguments: call.arguments.length - staticArguments,
		});
	});

	return sites;
}

/**
 * Report constructs the extractor cannot currently represent. The diagnostic
 * is intentionally source-local and actionable so editors/CI can point at the
 * call and explain the supported escape hatch.
 */
export function diagnoseCssSources(
	code: string,
	id: string,
	cssNames: ReadonlySet<string>,
): Array<CssDiagnostic> {
	if (cssNames.size === 0) return [];
	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const diagnostics: Array<CssDiagnostic> = [];
	const unsupported = new Map<string, string>([
		["global", "Authored global rules are not extracted yet."],
		["keyframes", "Authored keyframes are not extracted yet."],
		["fontFace", "Authored @font-face rules are not extracted yet."],
		["layer", "Authored layers are not extracted yet."],
		["supports", "Authored @supports rules are not extracted yet."],
		["property", "Authored @property rules are not extracted yet."],
	]);

	walk(result.program, (node) => {
		if (node.type !== "CallExpression") return;
		const call = node as CallNode;
		if (call.callee?.type !== "MemberExpression") return;
		const object = (call.callee as { object?: OxcNode | null }).object;
		if (object?.type !== "Identifier" || !cssNames.has(object.name as string)) return;
		const member = memberName(call.callee);
		const location = callLocation(code, call);
		if (member !== undefined && unsupported.has(member)) {
			diagnostics.push({
				kind: "unsupported-construct",
				file: id,
				start: call.start,
				end: call.end,
				...location,
				message: unsupported.get(member)!,
				suggestion:
					"Use css.class/css.raw for declarations, or keep this rule in authored CSS until build-time support is added.",
			});
			return;
		}

		const callKind = callKindFor(call.callee, cssNames);
		if (callKind === undefined) return;
		const staticArguments = call.arguments.filter(isObjectLiteral).length;
		if (call.arguments.length === 0 || staticArguments !== call.arguments.length) {
			diagnostics.push({
				kind: "missing-extraction",
				file: id,
				start: call.start,
				end: call.end,
				...location,
				message:
					call.arguments.length === 0
						? `${callKind} has no style object to extract.`
						: `${callKind} has dynamic argument(s); only literal style objects enter the generated stylesheet.`,
				suggestion:
					"Keep the style shape literal for build-time extraction, or use css.vars for dynamic values and verify the runtime path.",
			});
		}
	});

	return diagnostics;
}

/**
 * Resolve every literal css() call in `code` to its final style object.
 * Non-literal arguments (variables, spreads, `$input` blocks with dynamic
 * values) are skipped — they need runtime styles, exactly like dynamic class
 * names in plain Tailwind.
 */
export function extractCssSources(
	code: string,
	id: string,
	cssNames: ReadonlySet<string>,
	preset: CssPreset,
): Array<ExtractedCssStyle> {
	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const sources: Array<ExtractedCssStyle> = [];

	walk(result.program, (node) => {
		if (node.type !== "CallExpression") return;
		const call = node as CallNode;
		const callee = call.callee;
		if (callee?.type !== "Identifier" && callee?.type !== "MemberExpression") {
			return;
		}

		const isDirect = callee.type === "Identifier" && cssNames.has(callee.name as string);
		const isMember = callee.type === "MemberExpression" && isMemberCall(callee, cssNames);
		if (!isDirect && !isMember) return;
		if (call.arguments.length === 0) return;
		const member = isMember
			? (callee.property as { name?: string } | null | undefined)?.name
			: undefined;
		const callKind = isDirect ? "css" : (`css.${member}` as "css.class" | "css.raw");
		const { line, column } = callLocation(code, call);

		for (const argument of call.arguments) {
			const literal = evalLiteral(argument as Expression);
			if (typeof literal !== "object" || literal === null) continue;
			sources.push({
				style: resolveDesignStyle(literal as Record<string, unknown>, preset.tokens),
				provenance: { file: id, start: call.start, end: call.end, line, column, callKind },
			});
		}
	});
	sources.push(...extractPatternSources(code, id, preset));

	return sources;
}

/** Backwards-compatible style-only view for callers that do not need provenance. */
export function extractCssStyles(
	code: string,
	id: string,
	cssNames: ReadonlySet<string>,
	preset: CssPreset,
): Array<StyleObject> {
	return extractCssSources(code, id, cssNames, preset).map(({ style }) => style);
}

/**
 * Collect flattened style keys from `css.vars({ ... })` calls so the build
 * can emit their toggle rules into the sheet. Only the KEY STRUCTURE must
 * be static — VALUES may be arbitrary expressions (they ride inline styles).
 * Spreads make a subtree unknowable and are skipped.
 */
type OxcProp = {
	type?: string;
	key?: { name?: string; value?: string };
	value?: OxcNode;
	argument?: OxcNode;
};

const collectKeysFromObject = (
	node: OxcNode | null | undefined,
	prefix: string,
	out: Set<string>,
): void => {
	if (node?.type !== "ObjectExpression") return;
	for (const prop of (node as { properties?: OxcProp[] }).properties ?? []) {
		if (prop.type === "SpreadElement") continue;
		const rawKey = prop.key?.name ?? prop.key?.value;
		if (typeof rawKey !== "string") continue;
		const fullKey = prefix === "" ? rawKey : `${prefix}__${rawKey}`;
		if (prop.value?.type === "ObjectExpression") {
			collectKeysFromObject(prop.value, fullKey, out);
		} else {
			out.add(fullKey);
		}
	}
};

export function extractVarKeys(
	code: string,
	id: string,
	cssNames: ReadonlySet<string>,
): Array<string> {
	if (cssNames.size === 0) return [];

	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const keys = new Set<string>();

	walk(result.program, (node) => {
		if (node.type !== "CallExpression") return;
		const call = node as CallNode;
		const callee = call.callee;
		if (callee?.type !== "MemberExpression") return;
		const object = (callee as { object?: OxcNode | null }).object;
		if (object?.type !== "Identifier" || !cssNames.has((object as { name?: string }).name ?? "")) {
			return;
		}
		const property = (callee as { property?: { name?: string } | null }).property;
		if ((property?.name ?? "") !== "vars") return;

		for (const argument of call.arguments) {
			collectKeysFromObject(argument as OxcNode, "", keys);
		}
	});

	return [...keys];
}

export interface InlineCssResult {
	code: string;
	inlined: number;
}

/**
 * Tailwind-mode inlining: replace literal `css(...)` / `css.class(...)`
 * calls by their compiled class output (map literal / class string), so
 * Tailwind's own scanner generates the CSS and nothing is paid at runtime.
 * `css.raw(...)`, `css.props(...)`, `css.group(...)` and dynamic calls are
 * left untouched. The emitted classes come from the same `className`
 * strategy the runtime binds, so build-time and runtime output match.
 */
export function inlineCssCalls(
	code: string,
	id: string,
	cssNames: ReadonlySet<string>,
	preset: CssPreset,
	className: AnyClassNameStrategy,
): InlineCssResult {
	if (cssNames.size === 0) return { code, inlined: 0 };

	const engine = createCss({ className });
	const result = parseSync(id, code, {
		sourceType: "module",
		lang: id.endsWith(".tsx") ? "tsx" : "ts",
	});
	const edits: Array<{ start: number; end: number; text: string }> = [];
	let inlined = 0;

	walk(result.program, (node) => {
		if (node.type !== "CallExpression") return;
		const call = node as CallNode;
		const callee = call.callee;

		let kind: "map" | "class" | null = null;
		if (callee?.type === "Identifier" && cssNames.has((callee as { name?: string }).name ?? "")) {
			kind = "map";
		} else if (callee?.type === "MemberExpression" && isMemberCall(callee, cssNames)) {
			const member = (callee as { property?: { name?: string } | null }).property?.name;
			if (member === "class") kind = "class";
		}
		if (kind === null) return;
		if (call.arguments.length === 0) return;

		const styles: Array<Record<string, unknown>> = [];
		for (const argument of call.arguments) {
			const literal = evalLiteral(argument as Expression);
			if (typeof literal !== "object" || literal === null) continue;
			styles.push(resolveDesignStyle(literal as Record<string, unknown>, preset.tokens));
		}
		if (styles.length === 0) return;

		try {
			const compiled =
				kind === "class"
					? engine.class(...(styles as Array<StyleObject>))
					: engine(...(styles as Array<StyleObject>));
			edits.push({ start: call.start, end: call.end, text: JSON.stringify(compiled) });
			inlined++;
		} catch {
			// Leave unrepresentable calls for the runtime (never crash builds).
		}
	});

	if (inlined === 0) return { code, inlined };
	let out = code;
	for (const edit of edits.toReversed()) {
		out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
	}
	return { code: out, inlined };
}
