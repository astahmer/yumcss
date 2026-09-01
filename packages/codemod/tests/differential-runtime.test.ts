import { StyleRuleKindTag, StyleValueKindTag } from "../src/swap/semantic-ir.ts";
import { describe, expect, test } from "vitest";
import { createRuntimeSheet } from "pandwind/css/runtime";
import { runDifferentialFixture } from "../src/swap/differential.ts";
import type { DifferentialRender } from "../src/swap/differential.ts";
import type { StyleProgram } from "../src/swap/semantic-ir.ts";

function realRuntimeRender(program: StyleProgram): DifferentialRender {
	const sheet = createRuntimeSheet({ id: "differential-runtime", autoMount: false });
	sheet.registerSemanticRules(
		program.rules.flatMap((rule) =>
			rule.kind === StyleRuleKindTag.Style
				? [
						{
							id: "card",
							kind: "style" as const,
							selector: ".card",
							declarations: rule.declarations.map((declaration) => ({
								property: declaration.property,
								value:
									declaration.value.kind === StyleValueKindTag.Literal
										? declaration.value.value
										: declaration.value.kind === StyleValueKindTag.Token
											? declaration.value.authored
											: declaration.value.expression,
							})),
						},
					]
				: [],
		),
	);
	return { html: '<div class="card">card</div>', css: sheet.css() };
}

function hydrate(server: DifferentialRender, _program: StyleProgram): DifferentialRender {
	const sheet = createRuntimeSheet({ id: "differential-runtime", autoMount: false });
	sheet.hydrate({
		tokens: "",
		rules: [
			{
				id: "card",
				priority: 0,
				css: server.css,
			},
		],
	});
	return { html: server.html, css: sheet.css() };
}

describe("real runtime differential validation", () => {
	test("exercises canonical CSS, runtime SSR, hydration, and stream chunks", () => {
		const result = runDifferentialFixture({
			name: "emotion-to-pandwind-runtime",
			sourceAdapter: "emotion",
			targetAdapter: "pandwind",
			file: "Card.tsx",
			source: 'import { css } from "@emotion/css"; const card = css({ color: "red" });',
			browserStates: [
				{
					name: "initial",
					source: (program) => realRuntimeRender(program).css,
					target: (program) => realRuntimeRender(program).css,
				},
			],
			ssr: {
				source: { render: realRuntimeRender, hydrate },
				target: { render: realRuntimeRender, hydrate },
			},
			streaming: {
				source: {
					render: (program) => [realRuntimeRender(program).html, realRuntimeRender(program).css],
				},
				target: {
					render: (program) => [realRuntimeRender(program).html, realRuntimeRender(program).css],
				},
			},
		});
		expect(result.valid).toBe(true);
		expect(result.ssr?.source.hydrated.css).toContain("color:red");
		expect(result.streaming?.source).toHaveLength(2);
	});
});
