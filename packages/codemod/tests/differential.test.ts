import { describe, expect, test } from "vitest";
import {
	runDifferentialFixture,
	runDifferentialSuite,
	styleProgramToCanonicalCss,
	type DifferentialRender,
} from "../src/swap/index.ts";

const render = (program: Parameters<typeof styleProgramToCanonicalCss>[0]): DifferentialRender => ({
	html: `<div data-style="${styleProgramToCanonicalCss(program)}"></div>`,
	css: styleProgramToCanonicalCss(program),
});

describe("CSS-in-JS differential validation", () => {
	test("compares canonical CSS, browser states, SSR, and hydration", () => {
		const result = runDifferentialFixture({
			name: "emotion-to-styled-components",
			sourceAdapter: "emotion",
			targetAdapter: "styled-components",
			file: "Card.tsx",
			source: `import { css } from "@emotion/css";\nconst card = css({ color: "red", "&:hover": { color: "blue" } });`,
			browserStates: [
				{
					name: "default",
					source: styleProgramToCanonicalCss,
					target: styleProgramToCanonicalCss,
				},
			],
			ssr: {
				source: { render, hydrate: (server) => server },
				target: { render, hydrate: (server) => server },
			},
		});

		expect(result.valid).toBe(true);
		expect(result.canonicalSource).toBe(result.canonicalTarget);
		expect(result.browser[0]?.valid).toBe(true);
		expect(result.ssr?.valid).toBe(true);
		expect(result.residuals).toEqual([]);
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
