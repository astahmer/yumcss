export interface ExampleFile {
	/** Tab label; mirrors the filename the example would live in. */
	name: string;
	/** Full file content, imports included — pasteable into a real project. */
	code: string;
}

export const PlaygroundApi = {
	Tw: "tw",
	Css: "css",
	Dss: "dss",
} as const;

export type PlaygroundApi = (typeof PlaygroundApi)[keyof typeof PlaygroundApi];

export interface ExampleVariant {
	/** The Pandwind API demonstrated by this variant. */
	api: PlaygroundApi;
	/** Label shown in the API selector. */
	label: string;
	/** One or more files; the first is evaluated, the rest are tabs. */
	files: readonly ExampleFile[];
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
	/** One or more API-specific implementations of the same scenario. */
	variants: readonly ExampleVariant[];
}

/** Convenience constructor for the single-file majority. */
function oneFile(name: string, code: string): readonly ExampleFile[] {
	return [{ name, code }];
}

function oneVariant(
	api: PlaygroundApi,
	nameOrCode: string,
	code?: string,
): readonly ExampleVariant[] {
	return [
		{
			api,
			label: api === PlaygroundApi.Tw ? "tw()" : api,
			files: oneFile(code === undefined ? "Example.tsx" : nameOrCode, code ?? nameOrCode),
		},
	];
}

const TW_IMPORT = [
	'import { tw } from "pandwind";',
	'import { createCx } from "pandwind/cx";',
	"",
	"const cx = createCx();",
].join("\n");

export const EXAMPLES: readonly ExampleDef[] = [
	{
		path: "/basics",
		title: "Basics",
		blurb: "the same styling intent expressed through each Pandwind API",
		group: "core",
		note: `Select an API to see the same button styles expressed through typed tw(), declaration-first css(), or design-system dss(). The APIs share one preset, while each lane keeps its own class-name strategy.`,
		variants: [
			{
				api: PlaygroundApi.Tw,
				label: "tw()",
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
				api: PlaygroundApi.Css,
				label: "css()",
				files: oneFile(
					"Example.tsx",
					`import { createCss } from "pandwind/css";
import { createCx } from "pandwind/cx";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);
const cx = createCx({ css });

const buttons = {
	primary: css.class({ backgroundColor: "$blue-500", color: "$gray-50", borderRadius: "lg", padding: 16 }),
	danger: css.class({ backgroundColor: "$red-500", color: "$gray-50", borderRadius: "lg", padding: 16 }),
	large: css.class({ padding: 16, fontSize: "lg" }),
};

cx(buttons.primary, "px-4")`,
				),
			},
			{
				api: PlaygroundApi.Dss,
				label: "dss",
				files: oneFile(
					"Example.tsx",
					`import { createDesignCss } from "pandwind/design";
import { examplePreset } from "@pandwind/example-preset";

const dcss = createDesignCss(examplePreset);

const buttons = {
	primary: dcss.class({ $frame: { fill: "$blue-500", corners: "lg", pad: [4, 4] }, $text: { color: "$gray-50" } }),
	danger: dcss.class({ $frame: { fill: "$red-500", corners: "lg", pad: [4, 4] }, $text: { color: "$gray-50" } }),
	large: dcss.class({ $frame: { pad: [4, 4] }, $text: { size: "lg" } }),
};

buttons.primary`,
				),
			},
		],
	},
	{
		path: "/dynamic",
		title: "Dynamic styling",
		blurb: "runtime values: partial folds, css.vars, and css.props",
		group: "core",
		note: "The ternary branches are static strings, so the build folds the static halves and keeps only the runtime choice (partial). The css.vars() / css.props() calls carry dynamic values as inline custom properties instead of inventing classes.",
		variants: oneVariant(
			PlaygroundApi.Tw,
			TW_IMPORT +
				`

import { createCss } from "pandwind/css";

const css = createCss();

const alert = (tone = "danger" as string) => {
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
		variants: oneVariant(
			PlaygroundApi.Tw,
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
		variants: oneVariant(
			PlaygroundApi.Tw,
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
		note: "brandTone is a raw token imported from another file, success is a semantic alias, and the numeric padding uses a spacing value from the preset. Each resolves to a concrete value because this example binds createCss(examplePreset).",
		variants: [
			{
				api: PlaygroundApi.Css,
				label: "css()",
				files: [
					{
						name: "Example.tsx",
						code: `import { createCss } from "pandwind/css";
import { examplePreset } from "@pandwind/example-preset";
import { brandTone } from "./brand.ts";

const css = createCss(examplePreset);

css.class({
	backgroundColor: brandTone,
	color: "success",
	padding: 20,
	_dark: { color: "$gray-200" },
})`,
					},
					{
						name: "brand.ts",
						code: 'export const brandTone = "$blue-500";',
					},
				],
			},
		],
	},
	{
		path: "/design-preset",
		title: "Design presets",
		blurb: "define your own theme, tokens, and conditions",
		group: "core",
		note: "A brand preset is data: defineTokens + definePreset. The native css() lane emits hashed atoms from the preset; choose the Tailwind adapter to lower the same declarations through the generated bridge.",
		variants: [
			{
				api: PlaygroundApi.Dss,
				label: "dss",
				files: [
					{
						name: "Example.tsx",
						code: `import { createDesignCss } from "pandwind/design";
import { definePreset, defineTheme } from "pandwind/preset";
import { brandTokens } from "./brand.ts";

const brand = definePreset(
	defineTheme({ config: {} as Record<string, never>, tokens: { colors: brandTokens.colors } }),
	{ strict: true, conditions: { _hover: "&:hover" }, properties: { $all: true } },
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
		],
	},
	{
		path: "/variants",
		title: "Variants with cx()",
		blurb: "external variant maps over statically generated classes",
		group: "core",
		note: "Pandwind does not ship a recipe API: each css.class() call stays statically authored, while cx() composes the selected class strings at runtime. This is the extractable CVA-style pattern.",
		variants: oneVariant(
			PlaygroundApi.Css,
			"Example.tsx",
			`import { createCss } from "pandwind/css";
import { createCx } from "pandwind/cx";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);
const cx = createCx({ css });

const variants = {
	base: css.class({ borderRadius: "lg" }),
	size: {
		sm: css.class({ padding: 8 }),
		lg: css.class({ padding: 16 }),
	},
	tone: {
		brand: css.class({ backgroundColor: "$blue-500" }),
		danger: css.class({ backgroundColor: "$red-500" }),
	},
} as const;

const pick = (
	selection = {
		size: "lg",
		tone: "brand",
	} as {
		size: keyof typeof variants.size;
		tone: keyof typeof variants.tone;
	},
) =>
	cx(variants.base, variants.size[selection.size], variants.tone[selection.tone]);

pick({ size: "lg", tone: "brand" })`,
		),
	},
	{
		path: "/groups",
		title: "Groups & vars",
		blurb: "css.group maps, dynamic groups, and host props",
		group: "core",
		note: "Static group entries compile once; entries with $input return a function that carries runtime values as inline custom properties. css.props() projects everything onto React-ready host props.",
		variants: oneVariant(
			PlaygroundApi.Css,
			"Example.tsx",
			`import { createCss } from "pandwind/css";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);

const styles = css.group({
	card: { backgroundColor: "$blue-500", borderRadius: "lg" },
	muted: { color: "$gray-500" },
	banner: {
		$input: {} as { tone: "blue" | "red" },
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
		variants: oneVariant(
			PlaygroundApi.Tw,
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
		variants: oneVariant(
			PlaygroundApi.Tw,
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
		variants: oneVariant(
			PlaygroundApi.Tw,
			"Example.tsx",
			TW_IMPORT +
				`

// @ts-expect-error tw() accepts typed style objects, not class-name strings.
tw("bg-red-500 text-lg")`,
		),
	},
	{
		path: "/limits-variant-strings",
		title: "Limits · variant strings",
		blurb: "variant keys must nest objects, not strings",
		group: "limits",
		note: 'sm: "p-4" hands the variant machinery a string where a style object belongs, so it emits sm-p-4— a token with no generated CSS. The valid form is sm: { p: "4" } (see Responsive).',
		variants: oneVariant(
			PlaygroundApi.Tw,
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
		variants: oneVariant(
			PlaygroundApi.Css,
			"Example.tsx",
			`import { createCss } from "pandwind/css";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);

css.class({
	display: "flex",
	// @ts-expect-error animation is outside examplePreset.properties.
	animation: "pulse 2s infinite",
})`,
		),
	},
];
