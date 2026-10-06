import { StyleValueKindTag } from "../src/swap/semantic-ir.ts";
import { describe, expect, test } from "vitest";
import {
	runDifferentialFixture,
	runDifferentialSuite,
	STYLE_PROGRAM_CORE_VERSION,
	type DifferentialRender,
} from "../src/swap/index.ts";
import { SemanticConditionKindTag } from "../src/swap/semantic-ir.ts";
import type { StyleProgram } from "../src/swap/semantic-ir.ts";
import { createRuntimeSheet } from "yumcss/css/runtime";

type SemanticValue = StyleProgram["declarations"][number]["value"];
type SemanticCondition = StyleProgram["rules"][number]["conditions"][number];

const runtimeValue = (input: SemanticValue): string => {
	if (input.kind === StyleValueKindTag.Token) return input.authored;
	if (input.kind === StyleValueKindTag.Dynamic) return input.expression;
	return String(input.value);
};

const runtimeCondition = (input: SemanticCondition): string => {
	if (
		input.kind === SemanticConditionKindTag.Media ||
		input.kind === SemanticConditionKindTag.Container ||
		input.kind === SemanticConditionKindTag.Supports
	)
		return `@${input.kind} ${input.value ?? input.name}`;
	return input.value ?? input.raw ?? input.name;
};

function runtimeCss(program: StyleProgram): string {
	const runtimeRule = (
		rule: StyleProgram["rules"][number],
	): Parameters<ReturnType<typeof createRuntimeSheet>["registerSemanticRules"]>[0][number] => ({
		kind: rule.kind,
		name: rule.name,
		selector: rule.selector,
		layer: rule.layer,
		conditions: rule.conditions.map(runtimeCondition),
		declarations: rule.declarations.map((declaration) => ({
			property: declaration.property,
			value: runtimeValue(declaration.value),
		})),
		children: rule.children.map(runtimeRule),
	});
	const sheet = createRuntimeSheet({ autoMount: false });
	sheet.registerSemanticRules(program.rules.map(runtimeRule));
	return sheet.css();
}

describe("CSS-in-JS differential validation", () => {
	test("compares canonical CSS, browser states, SSR, and hydration", () => {
		for (const [name, sourceAdapter, targetAdapter, source] of [
			[
				"emotion-to-styled-components",
				"emotion",
				"styled-components",
				`import { css } from "@emotion/css";\nconst card = css({ color: "red", "&:hover": { color: "blue" } });`,
			],
			[
				"stitches-to-emotion",
				"stitches",
				"emotion",
				`import { css } from "@stitches/react";\nconst card = css({ color: "red", "&:hover": { color: "blue" } });`,
			],
		] as const) {
			const result = runDifferentialFixture({
				name,
				sourceAdapter,
				targetAdapter,
				file: "Card.tsx",
				source,
				browserStates: [{ name: "mounted-runtime-sheet", source: runtimeCss, target: runtimeCss }],
				ssr: {
					source: {
						render: (program) => ({
							html: `<div data-css="${runtimeCss(program)}"></div>`,
							css: runtimeCss(program),
						}),
						hydrate: (server) => server,
					},
					target: {
						render: (program) => ({
							html: `<div data-css="${runtimeCss(program)}"></div>`,
							css: runtimeCss(program),
						}),
						hydrate: (server) => server,
					},
				},
			});

			expect(result.valid).toBe(true);
			expect(result.canonicalSource).toBe(result.canonicalTarget);
			expect(result.browser[0]?.valid).toBe(true);
			expect(result.ssr?.valid).toBe(true);
			expect(result.residuals).toEqual([]);
			expect(result.coreVersion).toBe(STYLE_PROGRAM_CORE_VERSION);
			expect(result.coreFingerprint).toMatch(/^sp-[a-z0-9]+$/u);
		}
	});

	test("returns actionable residuals when a target cannot represent dynamics", () => {
		const result = runDifferentialFixture({
			name: "emotion-to-vanilla-extract-dynamic",
			sourceAdapter: "emotion",
			targetAdapter: "vanilla-extract",
			file: "Card.tsx",
			source: `import { css } from "@emotion/css";\nconst card = css({ color: theme.foreground });`,
		});

		expect(result.valid).toBe(false);
		expect(result.differences.length).toBeGreaterThan(0);
		expect(result.residuals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: expect.stringMatching(/capability|dynamic-custom-property/),
				}),
			]),
		);
		expect(result.differences.join(" ")).not.toContain("adapter capability mismatch");
	});

	test("validates keyframes by retaining the authored binding name", () => {
		const result = runDifferentialFixture({
			name: "emotion-keyframes-to-stitches",
			sourceAdapter: "emotion",
			targetAdapter: "stitches",
			file: "animation.ts",
			source: `import { keyframes } from "@emotion/css";\nconst fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });`,
		});

		expect(result.valid).toBe(true);
		expect(result.validation?.valid).toBe(true);
	});

	test("runs a suite while preserving per-fixture diagnostics", () => {
		const results = runDifferentialSuite([
			{
				name: "stitches-to-emotion",
				sourceAdapter: "stitches",
				targetAdapter: "emotion",
				file: "Card.tsx",
				source: `import { css } from "@stitches/react";\nconst card = css({ padding: 2 });`,
			},
		]);
		expect(results).toHaveLength(1);
		expect(results[0]?.fixture).toBe("stitches-to-emotion");
	});

	test("validates deterministic RSC streaming chunks", () => {
		const render = (program: StyleProgram): readonly string[] => [
			"<style data-yumcss>",
			runtimeCss(program),
			"</style>",
		];
		const result = runDifferentialFixture({
			name: "emotion-rsc-stream",
			sourceAdapter: "emotion",
			targetAdapter: "styled-components",
			file: "Card.tsx",
			source: `import { css } from "@emotion/css";\nconst card = css({ color: "red" });`,
			streaming: { source: { render }, target: { render } },
		});
		expect(result.streaming?.valid).toBe(true);
		expect(result.validation?.valid).toBe(true);
	});

	test("fails when an independent browser, hydration, or stream observation diverges", () => {
		const render = (program: StyleProgram): DifferentialRender => ({
			html: `<div data-style="${runtimeCss(program)}"></div>`,
			css: runtimeCss(program),
		});
		const result = runDifferentialFixture({
			name: "emotion-independent-observation-mismatch",
			sourceAdapter: "emotion",
			targetAdapter: "styled-components",
			file: "Card.tsx",
			source: `import { css } from "@emotion/css";\nconst card = css({ color: "red" });`,
			browserStates: [
				{
					name: "computed-color",
					source: () => "red",
					target: () => "blue",
				},
			],
			ssr: {
				source: { render, hydrate: (server) => server },
				target: {
					render: (program) => ({ ...render(program), css: `${render(program).css} altered` }),
					hydrate: (server) => server,
				},
			},
			streaming: {
				source: { render: () => ["source"] },
				target: { render: () => ["target"] },
			},
		});

		expect(result.valid).toBe(false);
		expect(result.differences).toEqual(
			expect.arrayContaining([
				"browser state differs: computed-color",
				"SSR or hydration output differs",
				"RSC streaming output differs",
			]),
		);
	});
});
