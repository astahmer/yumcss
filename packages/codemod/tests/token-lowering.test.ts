import { describe, expect, test } from "vitest";
import { AdapterCapabilityLevelTag } from "../src/swap/capabilities.ts";
import { StyleLoweringId, StyleRepresentationKind } from "../src/swap/identifiers.ts";
import { STYLE_LOWERING_REGISTRY } from "../src/swap/lowering.ts";
import { StyleProgramBuilder } from "../src/swap/style-program-builder.ts";

const target = {
	schema: "pandwind.adapter-capabilities/1" as const,
	adapter: "fixture-target",
	capabilities: {
		declarations: AdapterCapabilityLevelTag.Exact,
		"token-values": AdapterCapabilityLevelTag.Unsupported,
	},
};

describe("token lowering", () => {
	test("inlines verified token values when the target has no token contract", () => {
		const program = StyleProgramBuilder.create()
			.withStyle({
				color: StyleProgramBuilder.token("colors.brand", { resolved: "#123456" }),
			})
			.build();
		const plan = STYLE_LOWERING_REGISTRY.plan({ program, target, mode: "safe" });

		expect(plan.applied).toContain(StyleLoweringId.TokenFallback);
		expect(plan.residuals).toEqual([]);
		expect(plan.resolvedCapabilities).toContain("token-values");
		expect(plan.program.declarations[0]?.value).toEqual({
			kind: "literal",
			value: "#123456",
		});
		expect(plan.representation).toBe(StyleRepresentationKind.Static);
	});

	test("keeps unresolved tokens visible as a lowering residual", () => {
		const program = StyleProgramBuilder.create()
			.withStyle({ color: StyleProgramBuilder.token("colors.missing") })
			.build();
		const plan = STYLE_LOWERING_REGISTRY.plan({ program, target, mode: "safe" });

		expect(plan.residuals).toEqual([
			expect.objectContaining({ kind: "token-values", text: "$colors.missing" }),
		]);
		expect(plan.representation).toBe(StyleRepresentationKind.Residual);
	});
});
