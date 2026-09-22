import {
	AdapterCapabilityTag,
	CodemodAdapterId,
	SemanticConditionKindTag,
	StyleDynamicExpressionKind,
	StyleProgramBuilder,
	StyleProgramCompositionKind,
	StyleValueKindTag,
	StyleProgramEmissionHint,
	type AdapterCapability,
	type StyleDeclaration,
	type SemanticContractFixture,
} from "pandwind-codemod/swap";

export interface SemanticProofFixture extends SemanticContractFixture {
	readonly covers: readonly AdapterCapability[];
}

export const SEMANTIC_PROOF_FAMILIES = [
	AdapterCapabilityTag.Declarations,
	AdapterCapabilityTag.TokenValues,
	AdapterCapabilityTag.CustomProperties,
	AdapterCapabilityTag.DynamicValues,
	AdapterCapabilityTag.FunctionValues,
	AdapterCapabilityTag.NamedConditions,
	AdapterCapabilityTag.NamedRules,
	AdapterCapabilityTag.PseudoConditions,
	AdapterCapabilityTag.SelectorConditions,
	AdapterCapabilityTag.MediaConditions,
	AdapterCapabilityTag.ContainerConditions,
	AdapterCapabilityTag.SupportsConditions,
	AdapterCapabilityTag.RuleLevel,
	AdapterCapabilityTag.GlobalRules,
	AdapterCapabilityTag.Keyframes,
	AdapterCapabilityTag.FontFace,
	AdapterCapabilityTag.Layers,
	AdapterCapabilityTag.SupportsRules,
	AdapterCapabilityTag.PropertyRules,
	AdapterCapabilityTag.Selectors,
	AdapterCapabilityTag.Nesting,
	AdapterCapabilityTag.Ordering,
	AdapterCapabilityTag.Components,
	AdapterCapabilityTag.ThemeContext,
	AdapterCapabilityTag.Composition,
	AdapterCapabilityTag.RuntimeContext,
	AdapterCapabilityTag.PluginTransforms,
	AdapterCapabilityTag.FrameworkSemantics,
] as const;

const literal = (property: string, value: string | number | boolean): StyleDeclaration => ({
	conditions: [],
	property,
	value: { kind: StyleValueKindTag.Literal, value },
});

const token = (property: string, ref: string, resolved: string): StyleDeclaration => ({
	conditions: [],
	property,
	value: StyleProgramBuilder.token(ref, { authored: `$${ref}`, resolved }),
});

const dynamic = (property: string, expression: string): StyleDeclaration => ({
	conditions: [],
	property,
	value: StyleProgramBuilder.dynamic(expression, {
		expressionKind: StyleDynamicExpressionKind.Member,
		dependencies: [expression],
	}),
});

const functionDynamic = (property: string, expression: string): StyleDeclaration => ({
	conditions: [],
	property,
	value: StyleProgramBuilder.dynamic(expression, {
		expressionKind: StyleDynamicExpressionKind.Function,
		dependencies: ["props"],
	}),
});

const conditions = [
	{ kind: SemanticConditionKindTag.Named, name: "dark" },
	{ kind: SemanticConditionKindTag.Pseudo, name: "hover" },
	{ kind: SemanticConditionKindTag.Selector, name: ".parent &" },
	{ kind: SemanticConditionKindTag.Media, name: "@media (min-width: 40rem)" },
	{ kind: SemanticConditionKindTag.Container, name: "@container (min-width: 40rem)" },
	{ kind: SemanticConditionKindTag.Supports, name: "@supports (display: grid)" },
] as const;

const valueAndContextProgram = StyleProgramBuilder.create({
	source: {
		file: "Card.tsx",
		adapter: CodemodAdapterId.StyledComponents,
		framework: "react",
		subject: "styled.button",
		subjectKind: "member",
		hostOpenTag: "<Card />",
	},
})
	.style([
		literal("display", "flex"),
		token("color", "colors.brand", "#2563eb"),
		literal("--card-gap", "1rem"),
		dynamic("backgroundColor", "props.tone"),
		functionDynamic("borderColor", "(props) => props.borderColor"),
	])
	.withTheme({ path: "colors.brand", authored: "theme.colors.brand", resolved: "#2563eb" })
	.withComposition({ kind: StyleProgramCompositionKind.Mixin, reference: "surface" })
	.withRuntime({ phase: "render", framework: "react", dependencies: ["props", "theme"] })
	.withPlugin({ id: "resolve-theme", input: "theme.colors.brand", output: "colors.brand" })
	.withEmissionHint(StyleProgramEmissionHint.RuntimeClass)
	.build();

const conditionProgram = StyleProgramBuilder.create()
	.style(
		[
			{
				...literal("color", "red"),
				conditions: [conditions[0]!],
			},
			{
				...literal("color", "blue"),
				conditions: [conditions[1]!],
			},
			{
				...literal("padding", "1rem"),
				conditions: [conditions[2]!],
			},
			{
				...literal("margin", "0"),
				conditions: [conditions[3]!],
			},
			{
				...literal("gap", "1rem"),
				conditions: [conditions[4]!],
			},
			{
				...literal("display", "grid"),
				conditions: [conditions[5]!],
			},
		],
		{ name: "card", selector: ".card" },
	)
	.build();

const ruleProgram = StyleProgramBuilder.create()
	.global(":root", { "--brand": "#2563eb" })
	.keyframes("fade", [
		{ selector: "from", declarations: { opacity: 0 } },
		{ selector: "to", declarations: { opacity: 1 } },
	])
	.fontFace({ fontFamily: "Inter", src: 'url("/inter.woff2")' })
	.layer("components", { color: "red" })
	.supports("(display: grid)", { display: "grid" })
	.property("--progress", {
		syntax: '"<number>"',
		inherits: false,
		initialValue: 0,
	})
	.build();

/**
 * One finite semantic contract corpus. It is intentionally independent of
 * adapter source fixtures: source adapters prove parsing, while this corpus
 * proves that the shared IR has a safe target outcome for every registered
 * target.
 */
export const semanticContractFixtures: readonly SemanticProofFixture[] = [
	{
		name: "style values and project context",
		file: "Card.tsx",
		program: valueAndContextProgram,
		covers: [
			AdapterCapabilityTag.Declarations,
			AdapterCapabilityTag.TokenValues,
			AdapterCapabilityTag.CustomProperties,
			AdapterCapabilityTag.DynamicValues,
			AdapterCapabilityTag.FunctionValues,
			AdapterCapabilityTag.Components,
			AdapterCapabilityTag.ThemeContext,
			AdapterCapabilityTag.Composition,
			AdapterCapabilityTag.RuntimeContext,
			AdapterCapabilityTag.PluginTransforms,
			AdapterCapabilityTag.FrameworkSemantics,
		],
	},
	{
		name: "conditions and named style map",
		file: "conditions.ts",
		program: conditionProgram,
		covers: [
			AdapterCapabilityTag.Declarations,
			AdapterCapabilityTag.NamedConditions,
			AdapterCapabilityTag.NamedRules,
			AdapterCapabilityTag.PseudoConditions,
			AdapterCapabilityTag.SelectorConditions,
			AdapterCapabilityTag.MediaConditions,
			AdapterCapabilityTag.ContainerConditions,
			AdapterCapabilityTag.SupportsConditions,
			AdapterCapabilityTag.RuleLevel,
			AdapterCapabilityTag.Selectors,
			AdapterCapabilityTag.Ordering,
		],
	},
	{
		name: "rule-level stylesheet constructs",
		file: "rules.css",
		program: ruleProgram,
		covers: [
			AdapterCapabilityTag.Declarations,
			AdapterCapabilityTag.RuleLevel,
			AdapterCapabilityTag.GlobalRules,
			AdapterCapabilityTag.Keyframes,
			AdapterCapabilityTag.FontFace,
			AdapterCapabilityTag.Layers,
			AdapterCapabilityTag.SupportsRules,
			AdapterCapabilityTag.PropertyRules,
			AdapterCapabilityTag.Nesting,
		],
	},
];
