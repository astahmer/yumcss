export interface ExampleFile {
	/** Tab label; mirrors the filename the example would live in. */
	name: string;
	/** Valid TypeScript/TSX module content; the entry file's default export is rendered. */
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

interface ExamplePreviewInteractionBase {
	label: string;
	initialValue: string;
	description: string;
}

export type ExamplePreviewInteraction =
	| (ExamplePreviewInteractionBase & { type: "color"; cssVariable: string })
	| (ExamplePreviewInteractionBase & {
			type: "select";
			cssVariable: string;
			options: readonly { label: string; value: string }[];
	  })
	| (ExamplePreviewInteractionBase & {
			type: "range";
			property: "width";
			min: number;
			max: number;
			step: number;
			unit: "px";
	  });

export interface ExamplePreviewControlOption {
	label: string;
	value: string;
	/** Optional source literal for non-string props, such as `true`. */
	sourceValue?: string;
}

export interface ExamplePreviewControl {
	type: "select";
	id: string;
	/** JSX prop on the element exported by default from the entry file. */
	prop: string;
	label: string;
	initialValue: string;
	options: readonly ExamplePreviewControlOption[];
	description: string;
}

export interface ExamplePreview {
	kind: PlaygroundPreviewKind;
	label: string;
	description: string;
	interaction?: ExamplePreviewInteraction;
	controls?: readonly ExamplePreviewControl[];
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
	interaction?: ExamplePreviewInteraction,
	controls?: readonly ExamplePreviewControl[],
): ExamplePreview => ({
	kind,
	label,
	description,
	...(interaction === undefined ? {} : { interaction }),
	...(controls === undefined ? {} : { controls }),
});

const makeSelectControl = (
	id: string,
	prop: string,
	label: string,
	initialValue: string,
	values: readonly string[],
	description: string,
): ExamplePreviewControl => ({
	type: "select",
	id,
	prop,
	label,
	initialValue,
	options: values.map((value) => ({ label: value, value })),
	description,
});

const TW_IMPORT = 'import { tw } from "pandwind";';

const TW_CX_IMPORT = [
	TW_IMPORT,
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
			"Compare the generated output for the same primary action in each API lane.",
			undefined,
			[
				makeSelectControl(
					"tone",
					"tone",
					"Tone",
					"primary",
					["primary", "danger"],
					"Passes the selected tone into the same Button component in every API lane.",
				),
				makeSelectControl(
					"size",
					"size",
					"Size",
					"lg",
					["sm", "lg"],
					"Changes the padding and text-size branch selected by the component prop.",
				),
			],
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
import { examplePreset } from "@pandwind/example-preset";

const css = createCss(examplePreset);

type ButtonProps = { tone: "primary" | "danger"; size: "sm" | "lg" };

const Button = (props: ButtonProps) => (
	<button
							className={css.class({
								backgroundColor: props.tone === "danger" ? "$red-500" : "$blue-500",
								color: "$white",
								borderRadius: "lg",
								padding: props.size === "lg" ? 16 : 8,
								fontSize: props.size === "lg" ? "1.125rem" : "1rem",
		})}
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

const dss = createDesignCss(examplePreset);

type ButtonProps = { tone: "primary" | "danger"; size: "sm" | "lg" };

const Button = (props: ButtonProps) => (
	<button
		className={dss.class({
			$frame: {
								fill: props.tone === "danger" ? "$red-500" : "$blue-500",
								corners: "lg",
								pad: props.size === "lg" ? "16" : "8",
							},
							$text: { color: "$white", size: props.size === "lg" ? "lg" : "base" },
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
		note: "The tone ternary is partially foldable because both branches are known, while the color prop remains runtime. css.vars() / css.props(css.vars()) carry that value as an inline custom property instead of inventing a class.",
		preview: makePreview(
			"alert",
			"Dynamic alert",
			"The runtime color is carried through the host style instead of a generated class.",
			{
				type: "color",
				label: "Runtime text color",
				cssVariable: "--pw-c-color",
				initialValue: "#fef08a",
				description: "Change this value to update css.props() without creating a class.",
			},
			[
				makeSelectControl(
					"tone",
					"tone",
					"Tone",
					"danger",
					["danger", "info"],
					"Changes the static background branch while the text color still travels through css.props().",
				),
			],
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			TW_CX_IMPORT +
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
			<div>The runtime color is carried through the host style.</div>
		</div>
	);
};

export default <Alert tone="danger" color="#fef08a" />`,
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
			"Resize the viewport to watch the surface switch from red to amber, blue, then violet.",
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			TW_IMPORT +
				`

type CardProps = { title: string };

const Card = (props: CardProps) => (
	<article
		className={tw({
			display: "grid",
			gap: "2",
			p: "4",
			border: "2",
			borderColor: "red-300",
			borderRadius: "lg",
			bgColor: "red-500",
			textColor: "white",
			sm: { bgColor: "amber-500", borderColor: "amber-300" },
			md: { bgColor: "blue-500", borderColor: "blue-300" },
			lg: { bgColor: "violet-500", borderColor: "violet-300" },
		})}
	>
		<strong>{props.title}</strong>
		<div>Viewport width selects the active background token.</div>
	</article>
);

export default <Card title="Responsive surface" />`,
		),
	},
	{
		path: "/container-queries",
		title: "Container queries",
		blurb: "component styles respond to their own container, not the viewport",
		group: "core",
		note: "The outer panel is marked with @container. Use the width control to cross the @md and @lg thresholds without resizing the browser window.",
		preview: makePreview(
			"card",
			"Container-aware card",
			"The inner panel changes color when its own container crosses @md and @lg.",
			{
				type: "range",
				label: "Container width",
				property: "width",
				initialValue: "360",
				min: 240,
				max: 560,
				step: 8,
				unit: "px",
				description: "@md starts at 448px; @lg starts at 512px.",
			},
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			TW_IMPORT +
				`

type CardProps = { title: string };

const Card = (props: CardProps) => (
	<section
		className={tw({
			"@container": true,
			p: "2",
			border: "2",
			borderColor: "gray-500",
			borderRadius: "lg",
			bgColor: "gray-800",
		})}
	>
		<article
			className={tw({
				display: "grid",
				gap: "2",
				p: "4",
				borderRadius: "lg",
				bgColor: "red-500",
				textColor: "white",
				"@md": { bgColor: "blue-500" },
				"@lg": { bgColor: "emerald-500" },
			})}
		>
			<strong>{props.title}</strong>
			<div>Resize the container, not the viewport.</div>
		</article>
	</section>
);

export default <Card title="Container-aware card" />`,
		),
	},
	{
		path: "/runtime-at-rules",
		title: "Runtime at-rules",
		blurb: "register global CSS rules beside runtime custom-property values",
		group: "core",
		note: "@property is global CSS, so register it once on the runtime sheet. The typed css.group() keeps the progress class stable while css.input() carries the changing value.",
		preview: makePreview(
			"card",
			"Registered progress meter",
			"The bar reads --progress; choose a percentage to update the runtime custom property without generating a new class.",
			undefined,
			[
				{
					type: "select",
					id: "value",
					prop: "value",
					label: "Progress",
					initialValue: "72%",
					options: [
						{ label: "24%", value: "24%", sourceValue: '"24%"' },
						{ label: "72%", value: "72%", sourceValue: '"72%"' },
						{ label: "100%", value: "100%", sourceValue: '"100%"' },
					],
					description:
						'Changes the css.input("progress") value; @property declares --progress as a non-inherited percentage with a zero initial value.',
				},
			],
		),
		variants: oneVariant(
			PlaygroundApi.Css,
			`import { createRuntimeCss } from "pandwind/css/runtime";
import { examplePreset } from "@pandwind/example-preset";

const css = createRuntimeCss(examplePreset);

const meterStyles = css.group({
	progress: {
		$input: {} as { progress: string },
		width: css.input("progress"),
		height: "100%",
		backgroundColor: "$blue-500",
		transition: "width 180ms ease",
	},
});

css.sheet.registerSemanticRules([
	{
		kind: "property",
		name: "--progress",
		declarations: [
			{ property: "syntax", value: "<percentage>" },
			{ property: "inherits", value: false },
			{ property: "initial-value", value: "0%" },
		],
	},
]);

	type MeterProps = { value: string };

const Meter = (props: MeterProps) => {
	const progress = css.props(meterStyles.progress({ progress: props.value }));

	return (
		<article
			className={css.class({
				display: "grid",
				gap: "8px",
				padding: "16px",
				borderRadius: "lg",
				backgroundColor: "$gray-900",
				color: "$white",
			})}
		>
			<strong>Progress is {props.value}</strong>
			<div
				className={css.class({
					height: "12px",
					borderRadius: "lg",
					backgroundColor: "$gray-700",
					overflow: "hidden",
				})}
			>
				<div
					{...progress}
					role="progressbar"
					aria-valuenow={Number.parseFloat(props.value)}
					aria-valuemin={0}
					aria-valuemax={100}
				/>
			</div>
			<span>--progress is registered globally with @property and supplied through a typed runtime input.</span>
		</article>
	);
};

export default <Meter value="72%" />`,
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
			undefined,
			[
				makeSelectControl(
					"tone",
					"tone",
					"Tone",
					"primary",
					["primary", "muted"],
					"The first declaration changes with this prop; the later blue-600 declaration still wins the conflict.",
				),
			],
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			TW_CX_IMPORT +
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
		path: "/token-bindings",
		title: "Named token bindings",
		blurb: "typed JavaScript refs over semantic tokens",
		group: "core",
		note: "This is the optional identifier pattern: componentTokens.card.* keeps a typed contract in JavaScript before css.class() consumes it. It is useful when a component needs JS composition; the Component token contracts example below keeps the refs as strings in the component instead.",
		preview: makePreview(
			"card",
			"Named token binding",
			"componentTokens.card.bg is a typed JavaScript binding; the active theme still supplies the semantic value.",
		),
		variants: [
			{
				api: PlaygroundApi.Css,
				label: "css()",
				files: [
					{
						name: "Example.tsx",
						code: `import { createCss } from "pandwind/css";
import { componentTokens, tokenPreset } from "./tokens.ts";

const css = createCss(tokenPreset);

const TokenCard = () => (
	<article
		className={css.class({
			backgroundColor: componentTokens.card.bg,
			color: componentTokens.card.fg,
			padding: componentTokens.card.padding,
			borderRadius: componentTokens.card.radius,
			_hover: {
				backgroundColor: componentTokens.card.hoverBg,
				color: componentTokens.card.hoverFg,
			},
		})}
	>
		<strong>Named token binding</strong>
		<div>
			componentTokens.card.bg and componentTokens.card.fg bind this component to theme-aware semantic roles.
		</div>
	</article>
);

export default <TokenCard />`,
					},
					{
						name: "tokens.ts",
						code: `import { definePreset, defineSemanticTokens, defineTokens } from "pandwind/preset";

const rawTokens = defineTokens({
	colors: {
		"$gray-50": "#f9fafb",
		"$gray-200": "#e5e7eb",
		"$gray-700": "#374151",
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
			"bg.primary": { base: rawTokens.colors["$blue-600"], _dark: rawTokens.colors["$blue-700"] },
			"bg.muted": { base: rawTokens.colors["$gray-200"], _dark: rawTokens.colors["$gray-700"] },
			"fg.on-primary": { base: rawTokens.colors["$white"], _dark: rawTokens.colors["$white"] },
			"fg.primary": { base: rawTokens.colors["$gray-900"], _dark: rawTokens.colors["$gray-50"] },
		},
	},
);

const componentValues = defineTokens({
	spacing: { "card.padding": rawTokens.spacing["20"] },
	radii: { "card.radius": rawTokens.radii.md },
});

const tokens = {
	colors: rawTokens.colors,
	semantic: semanticTokens.colors,
	spacing: rawTokens.spacing,
	radii: { ...rawTokens.radii, ...componentValues.radii },
};

export const componentTokens = {
	card: {
		bg: "bg.primary",
		fg: "fg.on-primary",
		hoverBg: "bg.muted",
		hoverFg: "fg.primary",
		padding: "card.padding",
		radius: "card.radius",
	},
} as const;

export const tokenPreset = definePreset(
	{ config: {} as Record<string, unknown>, tokens },
	{
		strict: true,
		conditions: { _hover: "&:hover", _dark: '[data-theme="dark"] &' },
		properties: {
			backgroundColor: { $tokens: "semantic" },
			color: { $tokens: "semantic" },
			padding: componentValues.spacing,
			borderRadius: componentValues.radii,
		},
	},
);`,
					},
				],
			},
		],
	},
	{
		path: "/component-tokens",
		title: "Component token contracts",
		blurb: "raw values → semantic roles → string component contracts",
		group: "core",
		note: "This is the design-system pattern: raw values feed semantic roles, then component.* refs form a third layer above them. Stable component roles point to one semantic token; state roles can select different semantic tokens per theme while the component keeps the same string ref.",
		preview: makePreview(
			"card",
			"Component contract",
			"Stable roles and theme-conditional roles both resolve through the component token layer.",
		),
		variants: [
			{
				api: PlaygroundApi.Css,
				label: "css()",
				files: [
					{
						name: "Example.tsx",
						code: `import { createCss } from "pandwind/css";
import { tokenPreset } from "./tokens.ts";

const css = createCss(tokenPreset);

const EmptyState = () => (
	<article
		className={css.class({
			borderStyle: "solid",
			borderWidth: "component.card.borderWidth",
			borderColor: "component.card.border",
			borderRadius: "component.card.radius",
			backgroundColor: "component.state.emptyBg",
			color: "component.state.errorText",
			boxShadow: "component.card.shadow",
			padding: "component.card.padding",
			_hover: {
				backgroundColor: "component.state.hoverBg",
				color: "component.state.hoverText",
			},
		})}
	>
		<strong>String-based component contract</strong>
		<div>
			Stable geometry aliases keep one semantic target; emptyBg uses semantic.bg.muted in light mode and semantic.bg.primary in dark mode. Toggle the theme or hover to rebind the contract.
		</div>
	</article>
);

export default <EmptyState />`,
					},
					{
						name: "tokens.ts",
						code: `import { definePreset, defineSemanticTokens, defineTokens } from "pandwind/preset";

const rawTokens = defineTokens({
	colors: {
		"$blue-600": "#2b6cb0",
		"$blue-700": "#2c5282",
		"$gray-50": "#f9fafb",
		"$gray-200": "#e5e7eb",
		"$gray-700": "#374151",
		"$gray-900": "#111827",
		"$red-300": "#fca5a5",
		"$red-500": "#e53e3e",
		"$white": "#ffffff",
	},
	spacing: { "16": "16px" },
	radii: { md: "0.375rem" },
	borders: { thin: "1px" },
	shadows: { card: "0 12px 24px rgb(17 24 39 / 0.16)" },
});

const themeConditions = { base: "", _dark: '[data-theme="dark"] &' };

const semanticTokens = defineSemanticTokens(
	themeConditions,
	{
		semantic: {
			"bg.primary": { base: rawTokens.colors["$blue-600"], _dark: rawTokens.colors["$blue-700"] },
			"bg.muted": { base: rawTokens.colors["$gray-200"], _dark: rawTokens.colors["$gray-700"] },
			"fg.error": { base: rawTokens.colors["$red-500"], _dark: rawTokens.colors["$red-300"] },
			"fg.on-primary": { base: rawTokens.colors["$white"], _dark: rawTokens.colors["$white"] },
			"border.default": { base: rawTokens.colors["$gray-200"], _dark: rawTokens.colors["$gray-700"] },
			"border.width.default": { base: rawTokens.borders.thin, _dark: rawTokens.borders.thin },
			"radius.card": { base: rawTokens.radii.md, _dark: rawTokens.radii.md },
			"shadow.card": {
				base: rawTokens.shadows.card,
				_dark: "0 12px 24px rgb(0 0 0 / 0.32)",
			},
			"space.card.padding": { base: rawTokens.spacing["16"], _dark: rawTokens.spacing["16"] },
		},
	},
);

const directComponentTokens = defineTokens({
	component: {
		"component.card.borderWidth": "semantic.border.width.default",
		"component.card.border": "semantic.border.default",
		"component.card.radius": "semantic.radius.card",
		"component.card.shadow": "semantic.shadow.card",
		"component.card.padding": "semantic.space.card.padding",
		"component.state.errorText": "semantic.fg.error",
	},
});

const conditionalComponentTokens = defineSemanticTokens(themeConditions, {
	component: {
		"component.state.emptyBg": {
			base: "semantic.bg.muted",
			_dark: "semantic.bg.primary",
		},
		"component.state.hoverBg": {
			base: "semantic.bg.primary",
			_dark: "semantic.bg.muted",
		},
		"component.state.hoverText": {
			base: "semantic.fg.on-primary",
			_dark: "semantic.fg.error",
		},
	},
});

const tokens = {
	colors: rawTokens.colors,
	semantic: semanticTokens.semantic,
	component: {
		...directComponentTokens.component,
		...conditionalComponentTokens.component,
	},
};

export const tokenPreset = definePreset(
	{ config: {} as Record<string, unknown>, tokens },
	{
		strict: true,
		conditions: { ...themeConditions, _hover: "&:hover" },
		properties: {
			borderStyle: true,
			borderWidth: { $tokens: "component" },
			borderColor: { $tokens: "component" },
			borderRadius: { $tokens: "component" },
			backgroundColor: { $tokens: "component" },
			color: { $tokens: "component" },
			boxShadow: { $tokens: "component" },
			padding: { $tokens: "component" },
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
		note: "The active prop chooses the base brand shade: active uses brand-600 and inactive uses brand-500. Hover reverses those shades through the preset's _hover condition, so both the prop and the condition have a visible effect.",
		preview: makePreview(
			"button",
			"Brand action",
			"Toggle State to switch the base shade; hover the button to see the preset's _hover condition reverse it.",
			undefined,
			[
				{
					type: "select",
					id: "active",
					prop: "active",
					label: "State",
					initialValue: "true",
					options: [
						{ label: "active", value: "true", sourceValue: "true" },
						{ label: "inactive", value: "false", sourceValue: "false" },
					],
					description:
						"Switches the base fill between brand-600 (active) and brand-500 (inactive); hover reverses the two shades.",
				},
			],
		),
		variants: [
			{
				api: PlaygroundApi.Dss,
				label: "dss",
				files: [
					{
						name: "Example.tsx",
						code: `import { createDesignCss } from "pandwind/design";
import { definePreset } from "pandwind/preset";
import { brandTokens } from "./brand.ts";

const brand = definePreset(
	{ config: {} as Record<string, never>, tokens: { colors: brandTokens.colors } },
	{ strict: true, conditions: { _hover: "&:hover" }, properties: { $all: true } },
);

const dss = createDesignCss(brand);

type ButtonProps = { active: boolean };

const Button = (props: ButtonProps) => (
					<button
						className={dss.class({
							$frame: {
								fill: props.active ? "$brand-600" : "$brand-500",
								corners: "lg",
								pad: [4, 4],
							},
							_hover: {
								$frame: { fill: props.active ? "$brand-500" : "$brand-600" },
							},
		})}
		aria-pressed={props.active}
	>
		{props.active ? "Active brand action" : "Brand action"}
	</button>
);

export default <Button active={true} />`,
					},
					{
						name: "brand.ts",
						code: `import { defineTokens } from "pandwind/preset";

export const brandTokens = defineTokens({
	colors: { "$brand-500": "#4c51bf", "$brand-600": "#3730a3" },
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
			"Choose a size and tone to see cx() compose the corresponding generated classes.",
			undefined,
			[
				makeSelectControl(
					"size",
					"size",
					"Size",
					"lg",
					["sm", "lg"],
					"Selects one statically generated padding class from the size map.",
				),
				makeSelectControl(
					"tone",
					"tone",
					"Tone",
					"brand",
					["brand", "danger"],
					"Selects one generated background class before cx() composes the final string.",
				),
			],
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
			'Select a tone to update css.input("tone") on the banner without changing its class.',
			undefined,
			[
				makeSelectControl(
					"tone",
					"tone",
					"Tone",
					"blue",
					["blue", "red"],
					'Passes the prop into styles.banner() so css.input("tone") changes the host variable.',
				),
			],
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
			<div>runtime input</div>
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
		note: "The className is assembled from module constants, a template literal, and a static ternary. The build can precompute those calls before the component ships; the fold panel shows the result.",
		preview: makePreview(
			"text",
			"Folded label",
			"This text is styled by the class string that the build-time fold can precompute.",
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			"Example.tsx",
			TW_CX_IMPORT +
				`

const SIZE = "4" as const;
const LABEL = \`Folded label (size \${SIZE})\`;
const className = cx(
	tw({
		bgColor: "blue-500",
		textColor: "white",
		border: "2",
		borderColor: "blue-300",
		rounded: "lg",
		p: SIZE === "4" ? "4" : "2",
		textSize: "lg",
	}),
);

const Label = () => <span className={className}>{LABEL}</span>;

export default <Label />`,
		),
	},
	{
		path: "/tw-compat",
		title: "tw() compat",
		blurb: "Tailwind-style nested variants: sm: and group-hover:",
		group: "core",
		note: "tw() keeps Tailwind-style prefixes in the generated class: resize the viewport to activate sm:p-4, then hover the button to activate group-hover:text-red-500.",
		preview: makePreview(
			"button",
			"Compatibility action",
			"Resize for larger padding; hover the group to turn the button text red.",
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
			"The red frame is valid; the nested label has no generated CSS because tw() received a class string.",
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			"Example.tsx",
			TW_IMPORT +
				`

const InvalidButton = () => {
	// @ts-expect-error tw() accepts typed style objects, not class-name strings.
	const className = tw("bg-red-500 text-lg");
	const frameClassName = tw({
		bgColor: "red-950",
		textColor: "red-100",
		border: "2",
		borderColor: "red-400",
		rounded: "lg",
		p: "4",
	});
	return (
		<div className={frameClassName}>
			<button className={className}>Rejected class string</button>
		</div>
	);
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
			"The red frame is valid; the nested token has no matching rule because the variant value is a string.",
		),
		variants: oneVariant(
			PlaygroundApi.Tw,
			"Example.tsx",
			TW_IMPORT +
				`

const InvalidVariant = () => {
	const className = tw({ sm: "p-4" });
	const frameClassName = tw({
		bgColor: "red-950",
		textColor: "red-100",
		border: "2",
		borderColor: "red-400",
		rounded: "lg",
		p: "4",
	});
	return (
		<div className={frameClassName}>
			<span className={className}>Invalid variant shape</span>
		</div>
	);
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
		backgroundColor: "$gray-800",
		color: "$red-100",
		borderRadius: "lg",
		padding: 16,
		// @ts-expect-error animation is outside examplePreset.properties.
		animation: "pulse 2s infinite",
	});
	return <div className={className}>Residual declaration</div>;
};

export default <ResidualCard />`,
		),
	},
];
