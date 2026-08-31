import { describe, expect, test } from "vitest";
import { parseAdapterTemplate } from "../src/swap/adapter-template-parser.ts";

describe("adapter template parser", () => {
	test("keeps multiple interpolations in one declaration as a valid template expression", () => {
		const program = parseAdapterTemplate(
			"margin: ${theme.space[10]} 0 ${theme.space[2]};",
			{
				file: "Category.tsx",
				source: "styled.h2`margin: ${theme.space[10]} 0 ${theme.space[2]};`",
				config: { adapter: "styled-components", files: [], values: {} },
			},
			"styled-components",
			0,
		);

		expect(program.declarations[0]?.value).toMatchObject({
			kind: "dynamic",
			expression: "`${theme.space[10]} 0 ${theme.space[2]}`",
		});
		expect(program.residuals[0]?.hint).toContain("runtime-aware lowering");
	});
});
