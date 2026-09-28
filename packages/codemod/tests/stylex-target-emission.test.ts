import { expect, test } from "vitest";
import { CodemodAdapterId } from "../src/swap/index.ts";
import { createAdapterRouteSpec, routeEvidence } from "./route-spec-support.ts";

const route = createAdapterRouteSpec(CodemodAdapterId.Pandwind, CodemodAdapterId.StyleX);

test("emits Pandwind groups as StyleX named rules", () => {
	const result = route.run({
		source: `import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
export const styles = css.group({ card: { color: "red" }, muted: { opacity: 0.5 } });`,
		file: "styles.ts",
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain("stylex.create({ card:");
	expect(result.code).toContain("muted:");
	expect(result.code).not.toContain("pandwind:migrate-skip");
	expect(routeEvidence(result)).toMatchInlineSnapshot(`
		{
		  "changed": true,
		  "code": "import * as stylex from "@stylexjs/stylex";

		export const styles = stylex.create({ card: { color: "red" }, muted: { opacity: 0.5 } });",
		  "converted": 1,
		  "generatedFiles": [],
		  "loweringPlans": [
		    {
		      "applied": [
		        "dynamic-and-theme",
		        "stylex-numeric-normalization",
		      ],
		      "availableRepresentations": [
		        "static",
		        "named-map",
		        "residual",
		      ],
		      "representation": "named-map",
		      "residuals": [],
		    },
		  ],
		  "outcomes": [
		    {
		      "outcome": "target-native",
		      "representation": "named-map",
		    },
		  ],
		  "residuals": [],
		  "skipped": 0,
		  "validations": [
		    {
		      "differences": [],
		      "lossiness": "lossless",
		      "valid": true,
		    },
		  ],
		}
	`);
});

test("emits conditional Pandwind declarations as StyleX property-value conditions", () => {
	const result = route.run({
		source: `import { createUnsafeCss } from "pandwind/unsafe/css";
const css = createUnsafeCss();
export const card = css.class({ color: "red", _hover: { color: "blue" }, _focusVisible: { opacity: 0.8 }, _highlighted: { opacity: 0.4 } });`,
		file: "styles.ts",
	});

	expect(result.converted).toBe(1);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('default: "red"');
	expect(result.code).toContain('":is(:hover, [data-hover])": "blue"');
	expect(result.code).toContain('":is(:focus-visible, [data-focus-visible])": 0.8');
	expect(result.code).toContain('"[data-highlighted]": 0.4');
	expect(result.code).not.toContain('"&:is');
	expect(routeEvidence(result)).toMatchInlineSnapshot(`
		{
		  "changed": true,
		  "code": "import * as stylex from "@stylexjs/stylex";

		export const card = stylex.create({
			style: {
				color: {
					default: "red",
					":is(:hover, [data-hover])": "blue",
				},
				opacity: {
					default: null,
					":is(:focus-visible, [data-focus-visible])": 0.8,
					"[data-highlighted]": 0.4,
				},
			},
		}).style;",
		  "converted": 1,
		  "generatedFiles": [],
		  "loweringPlans": [
		    {
		      "applied": [
		        "dynamic-and-theme",
		        "stylex-numeric-normalization",
		      ],
		      "availableRepresentations": [
		        "static",
		        "named-map",
		        "residual",
		      ],
		      "representation": "static",
		      "residuals": [],
		    },
		  ],
		  "outcomes": [
		    {
		      "outcome": "static",
		      "representation": "static",
		    },
		  ],
		  "residuals": [],
		  "skipped": 0,
		  "validations": [
		    {
		      "differences": [],
		      "lossiness": "lossless",
		      "valid": true,
		    },
		  ],
		}
	`);
});
