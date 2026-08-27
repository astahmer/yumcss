import { describe, expect, test } from "vitest";
import { runDifferentialFixture, runDifferentialSuite } from "../src/swap/index.ts";
import type { StyleProgram } from "../src/swap/semantic-ir.ts";
import { createRuntimeSheet } from "pandwind/css/runtime";

type SemanticValue = StyleProgram["declarations"][number]["value"];
type SemanticCondition = StyleProgram["rules"][number]["conditions"][number];

const runtimeValue = (input: SemanticValue): string => {
	if (input.kind === "token") return input.authored;
	if (input.kind === "dynamic") return input.expression;
	return String(input.value);
};

const runtimeCondition = (input: SemanticCondition): string => {
	if (input.kind === "media" || input.kind === "container" || input.kind === "supports")
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
		expect(result.differences).toContain("target capability contract rejected the program");
		expect(result.residuals[0]?.kind).toBe("capability");
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
});
