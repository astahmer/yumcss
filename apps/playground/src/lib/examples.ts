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

export const PlaygroundPreviewKind = {
	Button: "button",
	Card: "card",
	Alert: "alert",
	Text: "text",
	Badge: "badge",
} as const;

export type PlaygroundPreviewKind =
	(typeof PlaygroundPreviewKind)[keyof typeof PlaygroundPreviewKind];

export interface ExamplePreview {
	kind: PlaygroundPreviewKind;
	label: string;
	description: string;
}

export interface ExampleVariant {
	/** The Pandwind API demonstrated by this variant. */
	api: PlaygroundApi;
	/** Label shown in the API selector. */
	label: string;
	/** One or more files; the first exports the rendered preview by default. */
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
	/** The semantic specimen used to show the evaluated result in the preview. */
	preview: ExamplePreview;
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

const makePreview = (
	kind: PlaygroundPreviewKind,
	label: string,
	description: string,
): ExamplePreview => ({ kind, label, description });

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
		preview: makePreview(
			"button",
			"Primary action",
			"The selected API output is applied to this button specimen.",
		),
		variants: [
			{
				api: PlaygroundApi.Tw,
				label: "tw()",
				files: oneFile(
					"Example.tsx",
					TW_IMPORT +
						`

type ButtonProps = { tone: "primary" | "danger"; size: "sm" | "lg" };

const Button = (props: ButtonProps) => (
	<button
		className={tw({
			bgColor: props.tone === "danger" ? "red-500" : "blue-500",
			textColor: "white",
			rounded: "lg",
			p: props.size === "lg" ? "4" : "2",
			textSize: props.size === "lg" ? "lg" : "base",
		})}
	>
		{props.tone === "danger" ? "Delete" : "Continue"}
	</button>
);

export default <Button tone="primary" size="lg" />`,
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

type ButtonProps = { tone: "primary" | "danger"; size: "sm" | "lg" };

const Button = (props: ButtonProps) => (
	<button
		className={cx(
			css.class({
				backgroundColor: props.tone === "danger" ? "$red-500" : "$blue-500",
				color: "$gray-50",
				borderRadius: "lg",
				padding: props.size === "lg" ? 16 : 8,
			}),
			"px-4",
		)}
	>
		{props.tone === "danger" ? "Delete" : "Continue"}
	</button>
);

export default <Button tone="primary" size="lg" />`,
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

type ButtonProps = { tone: "primary" | "danger"; size: "sm" | "lg" };

const Button = (props: ButtonProps) => (
	<button
		className={dcss.class({
			$frame: {
				fill: props.tone === "danger" ? "$red-500" : "$blue-500",
				corners: "lg",
				pad: props.size === "lg" ? [4, 4] : [2, 2],
			},
			$text: { color: "$gray-50", size: props.size === "lg" ? "lg" : "base" },
		})}
	>
		{props.tone === "danger" ? "Delete" : "Continue"}
	</button>
);

export default <Button tone="primary" size="lg" />`,
				),
			},
		],
	},
	{
		path: "/dynamic",
		title: "Dynamic styling",
		blurb: "runtime values: partial folds, css.vars, and css.props",
		group: "core",
		note: "The ternary branches are static strings, so the build folds the static halves and keeps only the runtime choice (partial). The css.vars() / css.props(css.vars()) calls carry dynamic values as inline custom properties instead of inventing classes.",
		preview: makePreview(
			"alert",
			"Dynamic alert",
			"The runtime color is carried through the host style instead of a generated class.",
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			TW_IMPORT +
				`

import { createCss } from "pandwind/css";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);

type AlertProps = { tone: "danger" | "info"; color: string };

const Alert = (props: AlertProps) => {
	const dynamicProps = css.props(css.vars({ color: props.color }));
	return (
		<div
			{...dynamicProps}
			className={cx(
				tw({
					bgColor: props.tone === "danger" ? "red-500" : "blue-500",
					p: "4",
				}),
				dynamicProps.className,
			)}
			role="alert"
		>
			<strong>{props.tone === "danger" ? "Dynamic alert" : "Informational alert"}</strong>
			<span>The runtime color is carried through the host style.</span>
		</div>
	);
};

export default <Alert tone="danger" color="red-600" />`,
		),
	},
	{
		path: "/responsive",
		title: "Responsive",
		blurb: "breakpoint and media variants as plain object nesting",
		group: "core",
		note: "Breakpoint keys come from your preset conditions (sm, md, lg, smDown, ...); they join with the generated variant metadata — no variant string concatenation in user code.",
		preview: makePreview(
			"card",
			"Responsive surface",
			"Resize the browser to see the generated breakpoint rules change this surface.",
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			TW_IMPORT +
				`

type CardProps = { title: string };

const Card = (props: CardProps) => (
	<article
		className={tw({
			p: "4",
			sm: { p: "6" },
			lg: { p: "8" },
			lgDown: { display: "flex" },
		})}
	>
		<strong>{props.title}</strong>
	</article>
);

export default <Card title="Responsive surface" />`,
		),
	},
	{
		path: "/conflicts",
		title: "Conflicts",
		blurb: "cx() keeps the last declaration and reports what died",
		group: "core",
		note: "cx() merges through the generated conflict map: the second background-color kills the first. The panel shows exactly which input tokens were removed instead of silently shipping dead classes.",
		preview: makePreview(
			"button",
			"Merged action",
			"The final background is the declaration that survived cx() conflict resolution.",
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			TW_IMPORT +
				`

type ActionProps = { tone: "primary" | "muted" };

const Action = (props: ActionProps) => (
	<button
		className={cx(
			tw({
				bgColor: props.tone === "primary" ? "blue-500" : "gray-500",
				p: "4",
			}),
			tw({ bgColor: "blue-600" }),
		)}
	>
		{props.tone === "primary" ? "Merged action" : "Muted action"}
	</button>
);

export default <Action tone="primary" />`,
		),
	},
	{
		path: "/tokens",
		title: "Token layers: raw → semantic → component",
		blurb: "raw values become semantic roles and component contracts",
		group: "core",
		note: "Open tokens.ts to see the complete chain: defineTokens() owns raw values, defineSemanticTokens() owns theme-aware roles, and the button contract owns component-sized tokens. Example.tsx consumes only semantic and component names, never raw hex values.",
		preview: makePreview(
			"card",
			"Token contract",
			"The component consumes semantic roles and button-scoped tokens; hover and dark mode keep the same classes.",
		),
		variants: [
			{
				api: PlaygroundApi.Css,
				label: "css()",
				files: [
					{
						name: "Example.tsx",
						code: `import { createCss } from "pandwind/css";
import { buttonTokens, tokenPreset } from "./tokens.ts";

const css = createCss(tokenPreset);

type CardProps = { tone: "brand" | "quiet" };

const TokenCard = (props: CardProps) => (
	<article
		className={css.class({
			backgroundColor: props.tone === "brand" ? "brand" : "surface",
			color: props.tone === "brand" ? "onBrand" : "content",
			padding: buttonTokens.padding,
			borderRadius: buttonTokens.radius,
			_hover: {
				backgroundColor: props.tone === "brand" ? "surface" : "brand",
				color: props.tone === "brand" ? "content" : "onBrand",
			},
		})}
	>
		<strong>{props.tone === "brand" ? "Semantic brand card" : "Quiet card"}</strong>
		<span>Raw hex values stay in tokens.ts; this component uses roles and button tokens.</span>
	</article>
);

export default <TokenCard tone="brand" />`,
					},
					{
						name: "tokens.ts",
						code: `import { definePreset, defineSemanticTokens, defineTheme, defineTokens } from "pandwind/preset";

const rawTokens = defineTokens({
	colors: {
		"$gray-50": "#f9fafb",
		"$gray-900": "#111827",
		"$blue-600": "#2b6cb0",
		"$blue-700": "#2c5282",
		"$white": "#ffffff",
	},
	spacing: { "20": "20px" },
	radii: { md: "0.375rem" },
});

const semanticTokens = defineSemanticTokens(
	{ _dark: '[data-theme="dark"] &' },
	{
		colors: {
			surface: { base: rawTokens.colors["$gray-50"], _dark: rawTokens.colors["$gray-900"] },
			content: { base: rawTokens.colors["$gray-900"], _dark: rawTokens.colors["$gray-50"] },
			brand: { base: rawTokens.colors["$blue-600"], _dark: rawTokens.colors["$blue-700"] },
			onBrand: { base: rawTokens.colors["$white"], _dark: rawTokens.colors["$white"] },
		},
	},
);

const componentTokens = defineTokens({
	spacing: { "button.padding": rawTokens.spacing["20"] },
	radii: { "button.radius": rawTokens.radii.md },
});

const tokens = {
	colors: rawTokens.colors,
	semantic: semanticTokens.colors,
	spacing: rawTokens.spacing,
	radii: { ...rawTokens.radii, ...componentTokens.radii },
};

export const buttonTokens = {
	padding: "button.padding",
	radius: "button.radius",
} as const;

// Codegen consumes this scope as .pwc-button and rebinds semantic variables.
export const designSystem = {
	tokens,
	components: { button: { primary: "$color-brand", "text.muted": "$color-content" } },
} as const;

export const tokenPreset = definePreset(
	defineTheme({ config: {} as Record<string, unknown>, tokens: designSystem.tokens }),
	{
		strict: true,
		conditions: { _hover: "&:hover", _dark: '[data-theme="dark"] &' },
		properties: {
			backgroundColor: { $tokens: "semantic" },
			color: { $tokens: "semantic" },
			padding: componentTokens.spacing,
			borderRadius: componentTokens.radii,
		},
	},
);`,
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
		preview: makePreview(
			"button",
			"Brand action",
			"This button uses the custom brand preset and its generated condition.",
		),
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

type ButtonProps = { active: boolean };

const Button = (props: ButtonProps) => (
	<button
		className={dcss.class({
			$frame: { fill: "$brand-500", corners: "lg", pad: [4, 4] },
			_hover: { $frame: { fill: "$brand-500" } },
		})}
		aria-pressed={props.active}
	>
		{props.active ? "Active brand action" : "Brand action"}
	</button>
);

export default <Button active />`,
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
		preview: makePreview(
			"button",
			"Variant button",
			"The selected size and tone are composed from separately generated classes.",
		),
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

type ButtonProps = {
	size: keyof typeof variants.size;
	tone: keyof typeof variants.tone;
};

const Button = (props: ButtonProps) => (
	<button className={cx(variants.base, variants.size[props.size], variants.tone[props.tone])}>
		{props.tone === "danger" ? "Danger button" : "Brand button"}
	</button>
);

export default <Button size="lg" tone="brand" />`,
		),
	},
	{
		path: "/groups",
		title: "Groups & vars",
		blurb: "css.group maps, dynamic groups, and host props",
		group: "core",
		note: "Static group entries compile once; entries with $input return a function that carries runtime values as inline custom properties. css.props() projects everything onto React-ready host props.",
		preview: makePreview(
			"card",
			"Grouped card",
			"The group result supplies both the static card styles and its runtime input.",
		),
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

type CardProps = { tone: "blue" | "red" };

const Card = (props: CardProps) => {
	const hostProps = css.props(styles.card, styles.muted, styles.banner({ tone: props.tone }));
	return (
		<article {...hostProps}>
			<strong>Grouped card</strong>
			<span>{props.tone} runtime input</span>
		</article>
	);
};

export default <Card tone="blue" />`,
		),
	},
	{
		path: "/folding",
		title: "Static folding",
		blurb: "what the vite pass eliminates before your app ships",
		group: "core",
		note: "Module constants, template literals, and static ternary branches all fold at build time; values only known at runtime survive as runtime folds. The panel reports which of the three happened.",
		preview: makePreview(
			"text",
			"Folded label",
			"This text is styled by the class string that the build-time fold can precompute.",
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			"Example.tsx",
			TW_IMPORT +
				`

const SIZE = "4" as const;

type LabelProps = { size: "2" | "4" };

const Label = (props: LabelProps) => (
	<span className={cx(tw({ p: props.size }), tw({ textSize: "lg" }))}>
		Folded label
	</span>
);

export default <Label size={SIZE} />`,
		),
	},
	{
		path: "/tw-compat",
		title: "tw() compat",
		blurb: "Tailwind-style nested variants: sm: and group-hover:",
		group: "core",
		note: "tw() understands Tailwind's compositional prefixes — responsive sm: and group-hover: join through the generated variant metadata and remain visible in the preview stylesheet.",
		preview: makePreview(
			"button",
			"Compatibility action",
			"Responsive and group variants stay attached to the same live specimen.",
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			"Example.tsx",
			TW_IMPORT +
				`

type ButtonProps = { label: string };

const Button = (props: ButtonProps) => (
	<div className="group">
		<button
			className={tw({
				bgColor: "blue-500",
				sm: { p: "4" },
				group: { hover: { textColor: "red-500" } },
			})}
		>
			{props.label}
		</button>
	</div>
);

export default <Button label="Compatibility action" />`,
		),
	},
	{
		path: "/limits-strings",
		title: "Limits · class strings",
		blurb: "tw() is not a string concatenation API — this is the honest failure",
		group: "limits",
		note: "tw() compiles typed style objects, not class-name strings. Passing a string treats every character as a utility name and emits per-character metadata tokens. Keep static class strings out of tw(); use cx() with plain strings when you already have classes.",
		preview: makePreview(
			"badge",
			"Rejected class string",
			"This limit example intentionally has no useful generated style.",
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			"Example.tsx",
			TW_IMPORT +
				`

const InvalidButton = () => {
	// @ts-expect-error tw() accepts typed style objects, not class-name strings.
	const className = tw("bg-red-500 text-lg");
	return <button className={className}>Rejected class string</button>;
};

export default <InvalidButton />`,
		),
	},
	{
		path: "/limits-variant-strings",
		title: "Limits · variant strings",
		blurb: "variant keys must nest objects, not strings",
		group: "limits",
		note: 'sm: "p-4" hands the variant machinery a string where a style object belongs, so it emits sm-p-4— a token with no generated CSS. The valid form is sm: { p: "4" } (see Responsive).',
		preview: makePreview(
			"badge",
			"Invalid variant shape",
			"The emitted token is visible, but it has no matching rule to apply.",
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			"Example.tsx",
			TW_IMPORT +
				`

const InvalidVariant = () => {
	const className = tw({ sm: "p-4" });
	return <span className={className}>Invalid variant shape</span>;
};

export default <InvalidVariant />`,
		),
	},
	{
		path: "/limits-unknown-props",
		title: "Limits · unknown props",
		blurb: "declarations outside the preset survive as metadata, not CSS",
		group: "limits",
		note: "animation is not in this preset's property allowlist, so the engine emits a metadata token instead of guessing CSS that would never be generated. Widen the preset's properties config (or add the value to the bridge) to make it a real utility.",
		preview: makePreview(
			"card",
			"Residual declaration",
			"The supported display style applies; animation remains intentionally residual.",
		),
		variants: oneVariant(
			PlaygroundApi.Css,
			"Example.tsx",
			`import { createCss } from "pandwind/css";
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);

const ResidualCard = () => {
	const className = css.class({
		display: "flex",
		// @ts-expect-error animation is outside examplePreset.properties.
		animation: "pulse 2s infinite",
	});
	return <div className={className}>Residual declaration</div>;
};

export default <ResidualCard />`,
		),
	},
];
