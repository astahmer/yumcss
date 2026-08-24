export interface ExampleDef {
	/** Route path for this example. */
	path: string;
	/** Nav + heading label. */
	title: string;
	/** One-liner shown under the title. */
	blurb: string;
	/** Initial editor code. */
	code: string;
}

/**
 * Per-route examples. Each is a self-contained snippet exercising one
 * pandwind surface; the playground evaluates them with the real bindings.
 */
export const EXAMPLES: Array<ExampleDef> = [
	{
		path: "/",
		title: "Basics",
		blurb: "typed tw() objects — wrong values are type errors",
		code: `tw({
	bgColor: "red-500",
	textSize: "lg",
	rounded: "lg",
	p: "4",
})`,
	},
	{
		path: "/conflicts",
		title: "Conflicts",
		blurb: "last-wins merging across tw(), css() and raw strings",
		code: `cx(
	tw({ p: "4", bgColor: "red-500" }),
	"px-8 bg-blue-600",
)
// px-8 refines p-4 (axis merge), blue wins red entirely`,
	},
	{
		path: "/semantic-tokens",
		title: "Semantic tokens",
		blurb: "$tokens flip under [data-theme] scopes",
		code: `tw({
	bgColor: "$surface",
	textColor: "$muted",
	border: "$hairline",
})
// semantic tokens re-bind per theme scope at runtime CSS level`,
	},
	{
		path: "/responsive",
		title: "Responsive",
		blurb: "nested variant stacks, compiled statically",
		code: `tw({
	display: "flex",
	gap: "2",
	md: {
		flexDirection: "col",
		gap: "6",
	},
})`,
	},
	{
		path: "/atoms",
		title: "css() atoms",
		blurb: "design-layer properties via css.class, merged by cx",
		code: `cx(
	css.class({ color: "$green-500", weight: "semibold" }),
	tw({ textSize: "lg" }),
)`,
	},
];
