import { describe, expect, test } from "vitest";
import {
	AdapterCapabilityLevelTag,
	AdapterCapabilityTag,
	StyleDynamicExpressionKind,
	StyleLoweringId,
	StyleProgramBuilder,
	StyleProgramCompositionKind,
	StyleProgramResidualKindTag,
	StyleRepresentationKind,
	STYLE_LOWERING_REGISTRY,
} from "../src/swap/index.ts";

const target = (
	adapter: string,
	capabilities: Partial<Record<AdapterCapabilityTag, AdapterCapabilityLevelTag>>,
) => ({
	schema: "yumcss.adapter-capabilities/1" as const,
	adapter,
	capabilities,
});

describe("StyleProgram lowering plans", () => {
	test("turns a verified theme expression into a static target value", () => {
		const plan = STYLE_LOWERING_REGISTRY.plan({
			program: StyleProgramBuilder.create()
				.withTheme({
					path: "colors.brand",
					authored: "theme.colors.brand",
					resolved: "#2563eb",
				})
				.style({
					color: StyleProgramBuilder.dynamic("theme.colors.brand", {
						expressionKind: StyleDynamicExpressionKind.Member,
					}),
				})
				.build(),
			target: target("static-target", {
				[AdapterCapabilityTag.Declarations]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.ThemeContext]: AdapterCapabilityLevelTag.Unsupported,
				[AdapterCapabilityTag.DynamicValues]: AdapterCapabilityLevelTag.Unsupported,
			}),
			mode: "safe",
		});

		expect(plan).toMatchInlineSnapshot(`
			{
			  "applied": [
			    "dynamic-and-theme",
			  ],
			  "availableRepresentations": [
			    "static",
			    "residual",
			  ],
			  "program": {
			    "canonicalization": undefined,
			    "compositions": [],
			    "declarations": [
			      {
			        "conditions": [],
			        "property": "color",
			        "value": {
			          "kind": "literal",
			          "value": "#2563eb",
			        },
			      },
			    ],
			    "emissionHints": [],
			    "plugins": [],
			    "residuals": [],
			    "rules": [
			      {
			        "children": [],
			        "conditions": [],
			        "declarations": [
			          {
			            "conditions": [],
			            "property": "color",
			            "value": {
			              "kind": "literal",
			              "value": "#2563eb",
			            },
			          },
			        ],
			        "kind": "style",
			        "order": 0,
			      },
			    ],
			    "runtime": undefined,
			    "schema": "yumcss.style-program/1",
			    "source": undefined,
			    "sourceMap": [],
			    "themes": undefined,
			  },
			  "representation": "static",
			  "residuals": [],
			}
		`);
		expect(plan.program.declarations[0]?.value).toEqual({ kind: "literal", value: "#2563eb" });
		expect(plan.residuals).toEqual([]);
		expect(plan.representation).toBe(StyleRepresentationKind.Static);
	});

	test("uses a deterministic custom property for an unknown scalar dynamic", () => {
		const expression = "props.color";
		const plan = STYLE_LOWERING_REGISTRY.plan({
			program: StyleProgramBuilder.create()
				.style({ color: StyleProgramBuilder.dynamic(expression) })
				.build(),
			target: target("custom-property-target", {
				[AdapterCapabilityTag.Declarations]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.DynamicValues]: AdapterCapabilityLevelTag.Unsupported,
				[AdapterCapabilityTag.CustomProperties]: AdapterCapabilityLevelTag.Exact,
			}),
			mode: "safe",
		});

		expect(plan.program.declarations[0]?.value).toMatchInlineSnapshot(`
			{
			  "kind": "literal",
			  "value": "var(--yumcss-dynamic-lod0xs)",
			}
		`);
		expect(plan.residuals).toMatchInlineSnapshot(`
			[
			  {
			    "hint": "bind --yumcss-dynamic-lod0xs at runtime for target custom-property-target",
			    "kind": "dynamic-custom-property",
			    "text": "props.color",
			  },
			]
		`);
		expect(plan.representation).toBe(StyleRepresentationKind.CustomProperty);
		expect(plan.applied).toContain(StyleLoweringId.DynamicAndTheme);
		expect(plan.residuals[0]?.kind).toBe(StyleProgramResidualKindTag.DynamicCustomProperty);
	});

	test("does not stringify function-valued styles without a host or native carrier", () => {
		const expression = "(props) => props.color";
		const plan = STYLE_LOWERING_REGISTRY.plan({
			program: StyleProgramBuilder.create()
				.style({
					color: StyleProgramBuilder.dynamic(expression, {
						expressionKind: StyleDynamicExpressionKind.Function,
					}),
				})
				.build(),
			target: target("static-target", {
				[AdapterCapabilityTag.Declarations]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.CustomProperties]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.DynamicValues]: AdapterCapabilityLevelTag.Unsupported,
				[AdapterCapabilityTag.FunctionValues]: AdapterCapabilityLevelTag.Unsupported,
			}),
			mode: "safe",
		});

		expect(plan.program.declarations[0]?.value).toMatchInlineSnapshot(`
			{
			  "expression": "(props) => props.color",
			  "expressionKind": "function",
			  "kind": "dynamic",
			  "staticEvaluation": {
			    "attempted": true,
			    "reason": "expression depends on runtime or unresolved source bindings",
			    "status": "unresolved",
			  },
			}
		`);
		expect(plan.residuals).toMatchInlineSnapshot(`
			[
			  {
			    "hint": "function-valued styles require a target-native or host prop wrapper",
			    "kind": "function-dynamic",
			    "text": "(props) => props.color",
			  },
			]
		`);
		expect(plan.representation).toBe(StyleRepresentationKind.Residual);
		expect(plan.residuals[0]?.kind).toBe(StyleProgramResidualKindTag.FunctionDynamic);
	});

	test("flattens embedded composition when the target has no composition contract", () => {
		const embedded = StyleProgramBuilder.create().style({ backgroundColor: "white" }).build();
		const plan = STYLE_LOWERING_REGISTRY.plan({
			program: StyleProgramBuilder.create()
				.style({ color: "black" })
				.withComposition({
					kind: StyleProgramCompositionKind.Mixin,
					reference: "surface",
					program: embedded,
				})
				.build(),
			target: target("flat-target", {
				[AdapterCapabilityTag.Declarations]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.Composition]: AdapterCapabilityLevelTag.Unsupported,
			}),
			mode: "safe",
		});

		expect(plan.program.rules.map((rule) => rule.declarations[0]?.property)).toMatchInlineSnapshot(
			`
			[
			  "backgroundColor",
			  "color",
			]
		`,
		);
		expect(plan.program.compositions).toBeUndefined();
		expect(plan.residuals).toEqual([]);
		expect(plan.applied).toContain(StyleLoweringId.CompositionFlatten);
	});

	test("applies a registered plugin transform before a native dynamic target consumes it", () => {
		const plan = STYLE_LOWERING_REGISTRY.plan({
			program: StyleProgramBuilder.create()
				.style({ color: StyleProgramBuilder.dynamic("tokens.brand") })
				.withPlugin({ id: "token-alias", input: "tokens.", output: "theme." })
				.build(),
			target: target("native-target", {
				[AdapterCapabilityTag.Declarations]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.DynamicValues]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.ThemeContext]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.PluginTransforms]: AdapterCapabilityLevelTag.Unsupported,
			}),
			mode: "safe",
		});

		expect(plan.program.declarations[0]?.value).toMatchInlineSnapshot(`
			{
			  "expression": "theme.brand",
			  "expressionKind": "member",
			  "kind": "dynamic",
			  "staticEvaluation": {
			    "attempted": true,
			    "reason": "expression depends on runtime or unresolved source bindings",
			    "status": "unresolved",
			  },
			}
		`);
		expect(plan.residuals).toEqual([]);
		expect(plan.program.plugins).toBeUndefined();
		expect(plan.resolvedCapabilities).toContain(AdapterCapabilityTag.PluginTransforms);
		expect(plan.representation).toBe(StyleRepresentationKind.TargetNative);
	});
});
