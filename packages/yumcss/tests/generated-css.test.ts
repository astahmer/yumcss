import { describe, expect, test } from "vitest";
import { examplePreset } from "@yumcss/example-preset";
import { createCss, firstThatWorks } from "../src/css/index.ts";
import { createGeneratedCss } from "../src/css/generated.ts";
import { css as generatedCss } from "./fixtures/generated-css.ts";

const baseCss = createCss(examplePreset);
const directGeneratedCss = createGeneratedCss(examplePreset);

const varsSnapshot = (value: { class: string; style: Record<string, string> }) => ({
	class: value.class,
	style: value.style,
});

const inputSnapshot = (value: {
	compiled: Record<string, string>;
	style: Record<string, string>;
}) => ({
	compiled: value.compiled,
	style: value.style,
});

describe("generated CSS facade", () => {
	test("matches createCss for callable, class, raw, and props projections", () => {
		const style = {
			display: firstThatWorks("flex", "block"),
			color: "$blue-500",
			backgroundColor: "colorPalette.solid",
			colorPalette: "brand",
			padding: 4,
			_hover: { color: "$blue-700" },
		} as const;

		expect(generatedCss(style)).toEqual(baseCss(style));
		expect(directGeneratedCss(style)).toEqual(baseCss(style));
		expect(generatedCss.class(style)).toBe(baseCss.class(style));
		expect(generatedCss.raw(style)).toEqual(baseCss.raw(style));
		expect(generatedCss.props(generatedCss(style))).toEqual(baseCss.props(baseCss(style)));
	});

	test("matches createCss for dynamic vars and runtime inputs", () => {
		const vars = {
			color: "var(--runtime-color)",
			padding: "var(--runtime-padding)",
			_dark: { color: "tomato" },
		};
		expect(varsSnapshot(generatedCss.vars(vars))).toEqual(varsSnapshot(baseCss.vars(vars)));
		expect(generatedCss.props(generatedCss.vars(vars))).toEqual(baseCss.props(baseCss.vars(vars)));

		const generatedGroups = generatedCss.group({
			card: { borderRadius: "lg", padding: 4 },
			gap: (value: 4 | 8) => ({ padding: value }),
			banner: {
				$input: {} as { color: string },
				color: generatedCss.input("color"),
			},
		});
		const baseGroups = baseCss.group({
			card: { borderRadius: "lg", padding: 4 },
			gap: (value: 4 | 8) => ({ padding: value }),
			banner: {
				$input: {} as { color: string },
				color: baseCss.input("color"),
			},
		});

		expect(generatedGroups.card).toEqual(baseGroups.card);
		expect(varsSnapshot(generatedGroups.gap(8))).toEqual(varsSnapshot(baseGroups.gap(8)));
		expect(inputSnapshot(generatedGroups.banner({ color: "tomato" }))).toEqual(
			inputSnapshot(baseGroups.banner({ color: "tomato" })),
		);
		expect(
			generatedCss.props(
				generatedGroups.card,
				generatedGroups.gap(8),
				generatedGroups.banner({ color: "tomato" }),
			),
		).toEqual(
			baseCss.props(baseGroups.card, baseGroups.gap(8), baseGroups.banner({ color: "tomato" })),
		);
	});

	test("matches createCss for keyframes", () => {
		const body = {
			from: { opacity: 0 },
			to: { opacity: 1 },
		} as const;

		expect(generatedCss.keyframes(body)).toBe(baseCss.keyframes(body));
	});
});
