export interface ExampleFile {
	/** Tab label; mirrors the filename the example would live in. */
	name: string;
	/** Full file content, imports included — pasteable into a real project. */
	code: string;
}

export interface ExampleDef {
	/** Route path for this example. */
	path: string;
	/** Nav + heading label. */
	title: string;
	/** One-liner shown under the title. */
	blurb: string;
	/**
	 * Scenario group shown in the nav. "core" examples are the happy paths;
	 * "limits" examples document what pandwind genuinely cannot handle.
	 */
	group: "core" | "limits";
	/**
	 * Optional note about what the example demonstrates or where it hits a
	 * documented limit — rendered above the editor.
	 */
	note?: string;
	/** One or more files; the first is evaluated, the rest are tabs. */
	files: readonly ExampleFile[];
}

/** Convenience constructor for the single-file majority. */
function oneFile(name: string, code: string): readonly ExampleFile[] {
	return [{ name, code }];
}

const TW_IMPORT = [
	'import { tw } from "pandwind";',
	'import { createCx } from "pandwind/cx";',
	"",
	"const cx = createCx();",
].join("\n");

export const EXAMPLES: readonly ExampleDef[] = [
	{
		path: "/basics-tw",
		title: "Basics · tw()",
		blurb: "typed tw() objects — wrong values are type errors",
		group: "core",
		note: `The generated WindUtilities type is derived from your theme config: try changing "blue-500" to a color that does not exist and the editor will flag it. cx() merges with a conflict map, so the last background wins.`,
		files: oneFile(
			"Example.tsx",
			TW_IMPORT +
				`

const buttons = {
	primary: tw({ bgColor: "blue-500", textColor: "white", rounded: "lg" }),
	danger: tw({ bgColor: "red-500", textColor: "white" }),
	large: tw({ p: "4", textSize: "lg" }),
};

buttons.primary`,
		),
	},
	{
		path: "/basics-css",
		title: "Basics · css()",
		blurb: "declaration-first objects compiled through the generated bridge",
		group: "core",
		note: "css() speaks CSS properties and preset tokens; the generated (property, value) bridge maps each declaration to the same Tailwind utility tw() would emit. Arbitrary values and conditions never block the output.",
		files: oneFile(
			"Example.tsx",
			`import { createCss } from "pandwind/css";
import { createCx } from "pandwind/cx";

const css = createCss();
const cx = createCx({ css });

const card = css.class({
	backgroundColor: "$blue-500",
	color: "$gray-50",
	padding: "16px",
	borderRadius: "8px",
});

cx(card, css.class({ _hover: { backgroundColor: "$blue-600" } }))`,
		),
	},
	{
		path: "/basics-dss",
		title: "Basics · dss",
		blurb: "design-system vocabulary ($frame/$text) resolved to the same classes",
		group: "core",
		note: "createDesignCss accepts designer module vocabulary — $frame, $text, $layout — and resolves it against the preset tokens before lowering. The output classes are identical to what css() would emit for the resolved declarations.",
		files: oneFile(
			"Example.tsx",
			`import { createDesignCss } from "pandwind/design";
import { examplePreset } from "pandwind/preset";

const dcss = createDesignCss(examplePreset);

dcss.class({
	$frame: { fill: "$blue-500", corners: "lg", pad: [4, 8] },
	$text: { weight: "600", color: "$gray-900" },
	_hover: { $text: { color: "$blue-100" } },
})`,
		),
	},
	{
		path: "/dynamic",
		title: "Dynamic styling",
		blurb: "runtime values: partial folds, css.vars, and css.props",
		group: "core",
		note: "The ternary branches are static strings, so the build folds the static halves and keeps only the runtime choice (partial). The css.vars() / css.props() calls carry dynamic values as inline custom properties instead of inventing classes.",
		files: oneFile(
			"Example.tsx",
			TW_IMPORT +
				`
import { createCss } from "pandwind/css";

const css = createCss();

function alert(tone) {
	return tw({
		bgColor: tone === "danger" ? "red-500" : "blue-500",
		p: "4",
	});
}

cx(
	alert("danger"),
	css.vars({ backgroundColor: "props.tone" }).class,
	css.props({ color: "props.tone", padding: "16px" }).className,
)`,
		),
	},
	{
		path: "/responsive",
		title: "Responsive",
		blurb: "breakpoint and media variants as plain object nesting",
		group: "core",
		note: "Breakpoint keys come from your preset conditions (sm, md, lg, smDown, ...); they join with the generated variant metadata — no variant string concatenation in user code.",
		files: oneFile(
			"Example.tsx",
			TW_IMPORT +
				`

tw({
	p: "4",
	sm: { p: "6" },
	lg: { p: "8" },
	lgDown: { display: "flex" },
})`,
		),
	},
	{
		path: "/conflicts",
		title: "Conflicts",
		blurb: "cx() keeps the last declaration and reports what died",
		group: "core",
		note: "cx() merges through the generated conflict map: the second background-color kills the first. The panel shows exactly which input tokens were removed instead of silently shipping dead classes.",
		files: oneFile(
			"Example.tsx",
			TW_IMPORT +
				`

cx(
	tw({ bgColor: "blue-500", p: "4" }),
	tw({ bgColor: "blue-600" }),
)`,
		),
	},
	{
		path: "/tokens",
		title: "Token layers",
		blurb: "raw, semantic, and component tokens in one call",
		group: "core",
		note: "brandTone is a raw token imported from another file, success is a semantic alias, button.padding is a component token. Each resolves to a concrete value; anything the generated bridge cannot map falls back to an arbitrary property instead of being dropped.",
		files: [
			{
				name: "Example.tsx",
				code: `import { createCss } from "pandwind/css";
import { brandTone } from "./brand.ts";

const css = createCss();

css.class({
	backgroundColor: brandTone,
	color: "success",
	padding: "button.padding",
	_dark: { color: "$gray-200" },
})`,
			},
			{
				name: "brand.ts",
				code: 'export const brandTone = "$brand-500";',
			},
		],
	},
	{
		path: "/design-preset",
		title: "Design presets",
		blurb: "define your own theme, tokens, and conditions",
		group: "core",
		note: "A brand preset is data: defineTokens + definePreset. Without a generated bridge the engine falls back to arbitrary properties ([background-color:#4c51bf]) — run pandwind-tw generate to produce the bridge and these become bg-brand-500 utilities.",
		files: [
			{
				name: "Example.tsx",
				code: `import { createDesignCss } from "pandwind/design";
import { definePreset, defineTheme } from "pandwind/preset";
import { brandTokens } from "./brand.ts";

const brand = definePreset(
	defineTheme({ config: {} as Record<string, never>, tokens: { colors: brandTokens.colors } }),
	{ strict: true, conditions: { _hover: "&:hover" } },
);

const dcss = createDesignCss(brand);

dcss.class({ $frame: { fill: "$brand-500" }, _hover: { $frame: { fill: "$brand-500" } } })`,
			},
			{
				name: "brand.ts",
				code: `import { defineTokens } from "pandwind/preset";

export const brandTokens = defineTokens({
	colors: { "$brand-500": "#4c51bf" },
});`,
			},
		],
	},
	{
		path: "/variants",
		title: "Variants & recipes",
		blurb: "cva-style variant maps and computed accessors",
		group: "core",
		note: "Variant selection is plain object composition — pick a branch, hand the merged style to css.class()/tw(). Computed keys ([accessor]) work too because the value is what gets compiled, not the key spelling.",
		files: oneFile(
			"Example.tsx",
			`import { createCss } from "pandwind/css";

const css = createCss();

const variants = {
	size: { sm: { padding: "8px" }, lg: { padding: "16px" } },
	tone: { brand: { backgroundColor: "$blue-500" }, danger: { backgroundColor: "$red-500" } },
};

const pick = (selection) =>
	css.class({
		...variants.size[selection.size],
		...variants.tone[selection.tone],
	});

pick({ size: "lg", tone: "brand" })`,
		),
	},
	{
		path: "/groups",
		title: "Groups & vars",
		blurb: "css.group maps, dynamic groups, and host props",
		group: "core",
		note: "Static group entries compile once; entries with $input return a function that carries runtime values as inline custom properties. css.props() projects everything onto React-ready host props.",
		files: oneFile(
			"Example.tsx",
			`import { createCss } from "pandwind/css";

const css = createCss();

const styles = css.group({
	card: { backgroundColor: "$blue-500", borderRadius: "8px" },
	muted: { color: "$gray-500" },
	banner: {
		$input: { tone: {} as "blue" | "red" },
		backgroundColor: css.input("tone"),
	},
});

css.props(styles.card, styles.muted, styles.banner({ tone: "blue" }))`,
		),
	},
	{
		path: "/folding",
		title: "Static folding",
		blurb: "what the vite pass eliminates before your app ships",
		group: "core",
		note: "Module constants, template literals, and static ternary branches all fold at build time; values only known at runtime survive as runtime folds. The panel reports which of the three happened.",
		files: oneFile(
			"Example.tsx",
			TW_IMPORT +
				`

const SIZE = "4";

cx(
	tw({ p: SIZE }),
	tw({ textSize: "lg" }),
)`,
		),
	},
	{
		path: "/tw-compat",
		title: "tw() compat",
		blurb: "Tailwind-style nested variants: sm:, group-hover:, dark:",
		group: "core",
		note: "tw() understands Tailwind's compositional prefixes — responsive sm:, group-hover:, and nested _hover/_dark pairs join through the generated variant metadata.",
		files: oneFile(
			"Example.tsx",
			TW_IMPORT +
				`

tw({
	bgColor: "blue-500",
	sm: { p: "4" },
	group: { hover: { textColor: "red-500" } },
})`,
		),
	},
	{
		path: "/limits-strings",
		title: "Limits · class strings",
		blurb: "tw() is not a string concatenation API — this is the honest failure",
		group: "limits",
		note: "tw() compiles typed style objects, not class-name strings. Passing a string treats every character as a utility name and emits per-character metadata tokens. Keep static class strings out of tw(); use cx() with plain strings when you already have classes.",
		files: oneFile(
			"Example.tsx",
			TW_IMPORT +
				`

tw("bg-red-500 text-lg")`,
		),
	},
	{
		path: "/limits-variant-strings",
		title: "Limits · variant strings",
		blurb: "variant keys must nest objects, not strings",
		group: "limits",
		note: 'sm: "p-4" hands the variant machinery a string where a style object belongs, so it emits sm-p-4— a token with no generated CSS. The valid form is sm: { p: "4" } (see Responsive).',
		files: oneFile(
			"Example.tsx",
			TW_IMPORT +
				`

tw({ sm: "p-4" })`,
		),
	},
	{
		path: "/limits-unknown-props",
		title: "Limits · unknown props",
		blurb: "declarations outside the preset survive as metadata, not CSS",
		group: "limits",
		note: "animation is not in this preset's property allowlist, so the engine emits a metadata token instead of guessing CSS that would never be generated. Widen the preset's properties config (or add the value to the bridge) to make it a real utility.",
		files: oneFile(
			"Example.tsx",
			`import { createCss } from "pandwind/css";

const css = createCss();

css.class({
	display: "flex",
	animation: "pulse 2s infinite",
})`,
		),
	},
];
