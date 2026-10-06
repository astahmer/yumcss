import { describe, expect, test } from "vitest";
import {
	BUILTIN_CODEMOD_ADAPTER_IDS,
	BUILTIN_STYLE_VALIDATOR_IDS,
	CodemodAdapterId,
	SemanticConditionKindTag,
	StyleProgramResidualKindTag,
	StyleRuleKindTag,
	StyleValidatorId,
	StyleValueKindTag,
} from "../src/swap/index.ts";

describe("const-enum control tags", () => {
	test("retain the serialized discriminant values", () => {
		expect({
			condition: SemanticConditionKindTag.Media,
			value: StyleValueKindTag.Dynamic,
			rule: StyleRuleKindTag.Keyframes,
			residual: StyleProgramResidualKindTag.DynamicCustomProperty,
			hostFramework: StyleProgramResidualKindTag.HostFramework,
		}).toMatchInlineSnapshot(`
			{
			  "condition": "media",
			  "hostFramework": "host-framework",
			  "residual": "dynamic-custom-property",
			  "rule": "keyframes",
			  "value": "dynamic",
			}
		`);
	});

	test("use explicit arrays for runtime registry iteration", () => {
		expect(BUILTIN_CODEMOD_ADAPTER_IDS[0]).toBe(CodemodAdapterId.YumCSS);
		expect(BUILTIN_CODEMOD_ADAPTER_IDS).toContain(CodemodAdapterId.StyleX);
		expect(BUILTIN_STYLE_VALIDATOR_IDS).toContain(StyleValidatorId.CanonicalCss);
	});
});
