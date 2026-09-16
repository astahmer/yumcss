import { expect, test } from "tstyche";
import { createGeneratedCss, firstThatWorks } from "../src/css/index.ts";
import { createCx } from "../src/cx/index.ts";
import { examplePreset } from "@pandwind/example-preset";
import {
	css,
	type GeneratedCss,
	type GeneratedDynamicStyle,
	type GeneratedStyle,
} from "./fixtures/generated-css.ts";
import type { StyleObject } from "../src/types/typings.ts";

type Compiled = Record<string, string>;
type PropsResult = {
	style: Record<string, string> | undefined;
	className: string | undefined;
	[key: string]: unknown;
};

const directCss = createGeneratedCss<GeneratedStyle, GeneratedDynamicStyle>(examplePreset);
const generatedCx = createCx({ css });

const compiled = css({
	color: "$blue-500",
	backgroundColor: "colorPalette.solid",
	colorPalette: "brand",
	padding: 4,
	_hover: { color: "$blue-700" },
	md: { padding: 8 },
	"&[data-state=open]": { backgroundColor: "$blue-600" },
});
const dynamicColor: string = "var(--runtime-color)";
const dynamic = css.vars({
	color: dynamicColor,
	padding: dynamicColor,
	"--runtime-size": 12,
});

test("generated css has the complete callable and projection surface", () => {
	expect(css).type.toBe<GeneratedCss>();
	expect(directCss).type.toBe<GeneratedCss>();
	expect(compiled).type.toBe<Compiled>();
	expect(css.class({ color: "$blue-500" })).type.toBe<string>();
	expect(css.raw({ color: "$blue-500" })).type.toBeAssignableTo<StyleObject>();
	expect(dynamic).type.toBeAssignableTo<{ class: string; style: Record<string, string> }>();
	expect(
		css.props(compiled, dynamic, "external-class", [false, null, undefined]),
	).type.toBe<PropsResult>();
	expect(generatedCx(css.class({ color: "$blue-500" }))).type.toBe<string>();
});

test("generated css preserves dynamic and reusable group typing", () => {
	expect(
		css.vars({
			_dark: { color: dynamicColor },
			"@container (min-width: 28rem)": { padding: 12 },
		}),
	).type.toBeAssignableTo<{ class: string; style: Record<string, string> }>();

	const styles = css.group({
		card: { borderRadius: "lg", padding: 4 },
		gap: (value: 4 | 8) => ({ padding: value }),
		label: "label-class",
		banner: {
			$input: {} as { color: string },
			color: css.input("color"),
		},
	});

	expect(styles.card).type.toBe<Compiled>();
	expect(styles.gap).type.toBeCallableWith(8);
	expect(styles.gap(8)).type.toBeAssignableTo<{
		class: string;
		style: Record<string, string>;
	}>();
	expect(styles.label).type.toBe<string>();
	expect(styles.banner).type.toBeCallableWith({ color: "tomato" });
	// @ts-expect-error Type 'number' is not assignable to type 'string'.
	styles.banner({ color: 12 });
});

test("generated css rejects values outside the generated preset contract", () => {
	css.class({
		// @ts-expect-error not assignable
		backgroundColor: "not-a-color",
	});
	css.class({
		// @ts-expect-error not assignable
		padding: 999,
	});
	css.class({
		// @ts-expect-error not assignable
		colorPalette: "unknown",
	});
	css.class({
		// @ts-expect-error not assignable
		backgroundColor: "colorPalette.unknown",
	});
	css.class({
		// @ts-expect-error Object literal may only specify known properties
		_missing: { color: "$blue-500" },
	});
});

test("generated aliases support firstThatWorks and exported style contracts", () => {
	expect(css.class({ display: firstThatWorks("flex", "block") })).type.toBe<string>();
	expect({} as GeneratedStyle).type.toBe<GeneratedStyle>();
	expect({} as GeneratedDynamicStyle).type.toBe<GeneratedDynamicStyle>();
});
