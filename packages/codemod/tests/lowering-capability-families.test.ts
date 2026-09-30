import { describe, expect, test } from "vitest";
import {
	AdapterCapabilityLevelTag,
	AdapterCapabilityTag,
	StyleDynamicExpressionKind,
	StyleProgramBuilder,
	StyleProgramCompositionKind,
	StyleRepresentationKind,
	STYLE_LOWERING_REGISTRY,
} from "../src/swap/index.ts";

const target = (
	adapter: string,
	capabilities: Partial<Record<AdapterCapabilityTag, AdapterCapabilityLevelTag>>,
) => ({
	schema: "pandwind.adapter-capabilities/1" as const,
	adapter,
	capabilities,
});

describe("static-first lowering capability families", () => {
	test("lowers nested themed composition and plugin output before target emission", () => {
		const plan = STYLE_LOWERING_REGISTRY.plan({
			program: StyleProgramBuilder.create()
				.withTheme({
					path: "colors.brand",
					authored: "theme.colors.brand",
					resolved: "#2563eb",
				})
				.withComposition({
					kind: StyleProgramCompositionKind.Mixin,
					reference: "surface",
					program: StyleProgramBuilder.create().style({ backgroundColor: "white" }).build(),
				})
				.style(
					{
						color: StyleProgramBuilder.dynamic("theme.colors.brand", {
							expressionKind: StyleDynamicExpressionKind.Member,
						}),
					},
					{ selector: "&:hover" },
				)
				.build(),
			target: target("flat-target", {
				[AdapterCapabilityTag.Declarations]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.ThemeContext]: AdapterCapabilityLevelTag.Unsupported,
				[AdapterCapabilityTag.DynamicValues]: AdapterCapabilityLevelTag.Unsupported,
				[AdapterCapabilityTag.Composition]: AdapterCapabilityLevelTag.Unsupported,
				[AdapterCapabilityTag.PluginTransforms]: AdapterCapabilityLevelTag.Unsupported,
				[AdapterCapabilityTag.CustomProperties]: AdapterCapabilityLevelTag.Exact,
			}),
			mode: "safe",
		});

		expect({
			applied: plan.applied,
			representation: plan.representation,
			properties: plan.program.rules.flatMap((rule) =>
				rule.declarations.map(({ property, value }) => ({ property, value })),
			),
			residuals: plan.residuals.map(({ kind, text }) => ({ kind, text })),
		}).toMatchInlineSnapshot(`
			{
			  "applied": [
			    "dynamic-and-theme",
			    "composition-flatten",
			  ],
			  "properties": [
			    {
			      "property": "backgroundColor",
			      "value": {
			        "kind": "literal",
			        "value": "white",
			      },
			    },
			    {
			      "property": "color",
			      "value": {
			        "kind": "literal",
			        "value": "#2563eb",
			      },
			    },
			  ],
			  "representation": "static",
			  "residuals": [],
			}
		`);
		expect(plan.representation).toBe(StyleRepresentationKind.Static);
		expect(plan.residuals).toEqual([]);
		expect(plan.program.compositions).toBeUndefined();
	});

	test("keeps a function value target-native when the target explicitly supports it", () => {
		const plan = STYLE_LOWERING_REGISTRY.plan({
			program: StyleProgramBuilder.create()
				.style({
					color: StyleProgramBuilder.dynamic("props.color", {
						expressionKind: StyleDynamicExpressionKind.Function,
					}),
				})
				.build(),
			target: target("function-target", {
				[AdapterCapabilityTag.Declarations]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.FunctionValues]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.DynamicValues]: AdapterCapabilityLevelTag.Exact,
			}),
			mode: "safe",
		});

		expect(plan.program.declarations[0]?.value).toMatchInlineSnapshot(`
			{
			  "expression": "props.color",
			  "expressionKind": "function",
			  "kind": "dynamic",
			  "staticEvaluation": {
			    "attempted": true,
			    "reason": "expression depends on runtime or unresolved source bindings",
			    "status": "unresolved",
			  },
			}
		`);
		expect(plan.representation).toBe(StyleRepresentationKind.TargetNative);
		expect(plan.residuals).toEqual([]);
		expect(plan.resolvedCapabilities).toContain(AdapterCapabilityTag.FunctionValues);
	});

	test("uses a custom property for scalar dynamics and reports its runtime binding", () => {
		const plan = STYLE_LOWERING_REGISTRY.plan({
			program: StyleProgramBuilder.create()
				.withRuntime({ phase: "render", framework: "react", dependencies: ["props"] })
				.style({ padding: StyleProgramBuilder.dynamic("props.padding") })
				.build(),
			target: target("static-target", {
				[AdapterCapabilityTag.Declarations]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.DynamicValues]: AdapterCapabilityLevelTag.Unsupported,
				[AdapterCapabilityTag.CustomProperties]: AdapterCapabilityLevelTag.Exact,
				[AdapterCapabilityTag.RuntimeContext]: AdapterCapabilityLevelTag.Unsupported,
			}),
			mode: "safe",
		});

		expect(plan.program.declarations[0]?.value).toMatchInlineSnapshot(`
			{
			  "kind": "literal",
			  "value": "var(--pandwind-dynamic-1jykje6)",
			}
		`);
		expect(plan.residuals).toEqual([
			expect.objectContaining({ kind: "dynamic-custom-property", text: "props.padding" }),
			expect.objectContaining({ kind: "runtime-context", text: "render" }),
		]);
		expect(plan.representation).toBe(StyleRepresentationKind.CustomProperty);
	});
});
