import type { Root } from "postcss";

export interface ShapeCategory {
	category: string;
	rules: number;
	bytes: number;
	topValues: Array<{ value: string; count: number }>;
}

export interface SpecificityBucket {
	label: string;
	rules: number;
}

export interface SheetShape {
	totalRules: number;
	totalBytes: number;
	categories: Array<ShapeCategory>;
	specificity: Array<SpecificityBucket>;
}

export interface CssArtifactAnalyzer {
	shape(root: Root): SheetShape;
}

const PROPERTY_CATEGORY: Record<string, string> = {
	color: "colors",
	"background-color": "colors",
	fill: "colors",
	stroke: "colors",
	"caret-color": "colors",
	"border-color": "borders",
	margin: "spacing",
	"margin-top": "spacing",
	"margin-right": "spacing",
	"margin-bottom": "spacing",
	"margin-left": "spacing",
	padding: "spacing",
	"padding-top": "spacing",
	"padding-right": "spacing",
	"padding-bottom": "spacing",
	"padding-left": "spacing",
	gap: "spacing",
	"row-gap": "spacing",
	"column-gap": "spacing",
	"font-family": "typography",
	"font-size": "typography",
	"font-weight": "typography",
	"font-style": "typography",
	"line-height": "typography",
	"letter-spacing": "typography",
	"text-align": "typography",
	"text-transform": "typography",
	display: "layout",
	position: "layout",
	flex: "layout",
	"flex-direction": "layout",
	"flex-wrap": "layout",
	"align-items": "layout",
	"justify-content": "layout",
	grid: "layout",
	"grid-template-columns": "layout",
	width: "layout",
	height: "layout",
	"min-width": "layout",
	"min-height": "layout",
	"max-width": "layout",
	"max-height": "layout",
	top: "layout",
	right: "layout",
	bottom: "layout",
	left: "layout",
	inset: "layout",
	"z-index": "layout",
	overflow: "layout",
	"box-shadow": "effects",
	opacity: "effects",
	filter: "effects",
	"backdrop-filter": "effects",
	transform: "effects",
	transition: "effects",
	animation: "effects",
};

const categoryOf = (prop: string): string => {
	if (PROPERTY_CATEGORY[prop] !== undefined) return PROPERTY_CATEGORY[prop]!;
	const prefixes: Array<[RegExp, string]> = [
		[/^border-(top|right|bottom|left)-(color|width|style)$/, "borders"],
		[/^border-.+-radius$/, "borders"],
		[/^border/, "borders"],
		[/^outline-?(color|width|style|offset)?$/, "borders"],
		[/^(text-decoration|text-emphasis)/, "typography"],
		[/^(margin|padding)-?(block|inline)?/, "spacing"],
		[/^(grid|place|align|justify)/, "layout"],
	];
	for (const [pattern, category] of prefixes) {
		if (pattern.test(prop)) return category;
	}
	return "other";
};

export class PostCssArtifactAnalyzer implements CssArtifactAnalyzer {
	shape(root: Root): SheetShape {
		type Category = { rules: number; bytes: number; values: Map<string, number> };
		const categories = new Map<string, Category>();
		const specificity = new Map<string, number>();
		let totalRules = 0;
		let totalBytes = 0;

		root.walkRules((rule) => {
			totalRules++;
			const bytes = rule.toString().length;
			totalBytes += bytes;
			const ids = (rule.selector.match(/#[\w-]+/g) ?? []).length;
			const classesAttrs =
				(rule.selector.match(/\.[\w-]+/g) ?? []).length +
				(rule.selector.match(/\[[^\]]+\]/g) ?? []).length;
			const pseudos = (rule.selector.match(/:[a-zA-Z-]+/g) ?? []).length;
			const label = `${ids}-${classesAttrs}-${pseudos}`;
			specificity.set(label, (specificity.get(label) ?? 0) + 1);

			const declarationCategories = new Set<string>();
			rule.walkDecls((declaration) => {
				const category = categoryOf(declaration.prop.toLowerCase());
				let bucket = categories.get(category);
				if (bucket === undefined) {
					bucket = { rules: 0, bytes: 0, values: new Map<string, number>() };
					categories.set(category, bucket);
				}
				declarationCategories.add(category);
				bucket.values.set(declaration.value, (bucket.values.get(declaration.value) ?? 0) + 1);
			});
			for (const category of declarationCategories) {
				const bucket = categories.get(category)!;
				bucket.rules++;
				bucket.bytes += bytes;
			}
		});

		return {
			totalRules,
			totalBytes,
			categories: [...categories.entries()]
				.map(([category, value]) => ({
					category,
					rules: value.rules,
					bytes: value.bytes,
					topValues: [...value.values.entries()]
						.toSorted((a, b) => b[1] - a[1])
						.slice(0, 4)
						.map(([value, count]) => ({ value, count })),
				}))
				.toSorted((a, b) => b.bytes - a.bytes),
			specificity: [...specificity.entries()]
				.map(([label, rules]) => ({ label, rules }))
				.toSorted((a, b) => b.rules - a.rules)
				.slice(0, 8),
		};
	}
}
