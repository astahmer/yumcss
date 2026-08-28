import { evalLiteral, type OxcNode, walk } from "../tw/literal.ts";
import { resolveDesignStyle } from "../design/resolve.ts";
import type {
	CssPatternAdapter,
	CssPreset,
	CssSourceProvenance,
	ExtractedCssStyle,
} from "./css-extraction-contracts.ts";

type JsxAttribute = { name?: { name?: string }; value?: OxcNode | null };
type JsxElement = {
	start: number;
	end: number;
	openingElement?: { name?: { type?: string; name?: string }; attributes?: JsxAttribute[] };
};

const BASES: Record<string, Record<string, unknown>> = {
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
const SPECIAL: Record<string, Record<string, string>> = {
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
const IGNORED = new Set(["as", "className", "css"]);
const DOM = new Set([
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
const ALIASES: Record<string, string> = {
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

const attributeValue = (value: OxcNode | null | undefined): unknown | null => {
	if (value === null || value === undefined) return true;
	if (value.type === "JSXExpressionContainer") {
		const expression = (value as { expression?: OxcNode }).expression;
		return expression?.type === "JSXEmptyExpression" || expression === undefined
			? null
			: evalLiteral(expression as never);
	}
	return evalLiteral(value as never);
};

export class PandwindPatternAdapter implements CssPatternAdapter {
	constructor(
		private readonly scanner: Pick<
			import("./css-extraction-contracts.ts").CssSourceScanner,
			"parse"
		>,
	) {}

	readonly id = "pandwind-jsx-patterns";
	canHandle(name: string): boolean {
		return name in BASES;
	}

	extract(code: string, id: string, preset: CssPreset): readonly ExtractedCssStyle[] {
		const parsed = this.scanner.parse(code, id);
		const imported = new Map<string, string>();
		walk(parsed, (node) => {
			if (node.type !== "ImportDeclaration") return;
			const declaration = node as {
				source?: { value?: string };
				specifiers?: Array<{
					type?: string;
					imported?: { name?: string };
					local?: { name?: string };
				}>;
			};
			if (!declaration.source?.value?.endsWith("/pandwind/jsx")) return;
			for (const specifier of declaration.specifiers ?? []) {
				const original = specifier.imported?.name;
				const local = specifier.local?.name;
				if (
					specifier.type === "ImportSpecifier" &&
					original !== undefined &&
					local !== undefined &&
					this.canHandle(original)
				)
					imported.set(local, original);
			}
		});
		const sources: ExtractedCssStyle[] = [];
		walk(parsed, (node) => {
			if (node.type !== "JSXElement") return;
			const element = node as unknown as JsxElement;
			const local = element.openingElement?.name?.name;
			const pattern = local === undefined ? undefined : imported.get(local);
			if (pattern === undefined) return;
			const style: Record<string, unknown> = { ...BASES[pattern] };
			for (const attribute of element.openingElement?.attributes ?? []) {
				const prop = attribute.name?.name;
				if (
					prop === undefined ||
					IGNORED.has(prop) ||
					DOM.has(prop) ||
					prop.startsWith("data-") ||
					prop.startsWith("aria-") ||
					prop.startsWith("on")
				)
					continue;
				const value = attributeValue(attribute.value);
				if (value === null) return;
				const special = SPECIAL[pattern]?.[prop];
				if (special !== undefined) style[special] = value;
				else if ((pattern === "Circle" || pattern === "Square") && prop === "size") {
					style.width = value;
					style.height = value;
				} else if (pattern === "Grid" && prop === "columns" && typeof value === "number")
					style.gridTemplateColumns = `repeat(${value}, minmax(0, 1fr))`;
				else if (pattern === "Grid" && prop === "rows" && typeof value === "number")
					style.gridTemplateRows = `repeat(${value}, minmax(0, 1fr))`;
				else if (!(pattern === "Grid" && (prop === "columns" || prop === "rows")))
					style[ALIASES[prop] ?? prop] = value;
			}
			const start = element.start;
			const before = code.slice(0, start);
			const provenance: CssSourceProvenance = {
				file: id,
				start,
				end: element.end,
				line: before.split("\n").length,
				column: start - (before.lastIndexOf("\n") + 1) + 1,
				callKind: "pattern",
			};
			sources.push({ style: resolveDesignStyle(style, preset.tokens), provenance });
		});
		return sources;
	}
}
