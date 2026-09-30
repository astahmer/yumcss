import { expect, test } from "tstyche";
import { typeValue } from "./type-fixtures.ts";
import { createCss } from "pandwind/css";
import type { PandwindPropertyValue } from "../src/types/css-values.ts";
import { define, type PandwindProperties } from "pandwind/preset";
import type { CssWideValue } from "pandwind/preset";

type IntrinsicCases = {
	color: "transparent" | "currentColor";
	background: "transparent" | "currentColor";
	backgroundColor: "transparent" | "currentColor";
	borderColor: "transparent" | "currentColor";
	borderTopColor: "transparent" | "currentColor";
	borderRightColor: "transparent" | "currentColor";
	borderBottomColor: "transparent" | "currentColor";
	borderLeftColor: "transparent" | "currentColor";
	borderInlineEndColor: "transparent" | "currentColor";
	outlineColor: "transparent" | "currentColor";
	textDecorationColor: "transparent" | "currentColor";
	textEmphasisColor: "transparent" | "currentColor";
	fill: "transparent" | "currentColor";
	stroke: "transparent" | "currentColor";
	display: "block" | "flex" | "grid" | "inline-flex" | "none";
	alignContent: "center" | "space-between" | "stretch";
	alignItems: "center" | "flex-start" | "stretch";
	alignSelf: "auto" | "center";
	appearance: "auto" | "none";
	aspectRatio: "auto";
	backgroundAttachment: "fixed" | "scroll";
	backgroundClip: "border-box" | "text";
	backgroundImage: "none";
	backgroundRepeat: "no-repeat" | "repeat";
	backgroundSize: "auto" | "cover";
	borderStyle: "none" | "solid" | "dashed";
	borderTopStyle: "solid";
	borderRightStyle: "solid";
	borderBottomStyle: "solid";
	borderLeftStyle: "solid";
	borderCollapse: "collapse" | "separate";
	boxSizing: "border-box" | "content-box";
	boxShadow: "none";
	textShadow: "none";
	flexDirection: "column" | "row";
	flexWrap: "nowrap" | "wrap";
	fontStyle: "italic" | "normal";
	fontWeight: "bold" | "normal" | "bolder" | "lighter";
	gridAutoFlow: "row" | "column dense";
	justifyContent: "center" | "space-between" | "stretch";
	justifyItems: "center" | "legacy";
	justifySelf: "auto" | "center";
	lineHeight: "normal";
	margin: "auto";
	marginTop: "auto";
	marginRight: "auto";
	marginBottom: "auto";
	marginLeft: "auto";
	marginInline: "auto";
	marginInlineStart: "auto";
	marginInlineEnd: "auto";
	marginBlock: "auto";
	marginBlockStart: "auto";
	marginBlockEnd: "auto";
	width: "auto" | "fit-content";
	minWidth: "min-content";
	maxWidth: "max-content";
	height: "auto";
	minHeight: "fit-content";
	maxHeight: "max-content";
	top: "auto";
	right: "auto";
	bottom: "auto";
	left: "auto";
	inset: "auto";
	insetInline: "auto";
	insetInlineStart: "auto";
	insetInlineEnd: "auto";
	insetBlock: "auto";
	insetBlockStart: "auto";
	insetBlockEnd: "auto";
	objectFit: "cover" | "contain";
	outlineStyle: "auto" | "solid";
	overflow: "auto" | "hidden" | "scroll";
	overflowX: "clip" | "visible";
	overflowY: "hidden" | "visible";
	overflowWrap: "anywhere" | "normal";
	overscrollBehavior: "contain" | "none";
	placeContent: "center" | "space-between";
	placeItems: "baseline" | "center";
	placeSelf: "auto" | "center";
	pointerEvents: "auto" | "none";
	position: "relative" | "sticky";
	resize: "both" | "none";
	scrollbarWidth: "auto" | "thin";
	textAlign: "center" | "start";
	textDecoration: "none" | "underline";
	textOverflow: "clip" | "ellipsis";
	textTransform: "none" | "uppercase";
	textUnderlineOffset: "auto";
	userSelect: "auto" | "none" | "text";
	verticalAlign: "middle" | "baseline";
	visibility: "hidden" | "visible";
	whiteSpace: "normal" | "nowrap";
	wordBreak: "break-all" | "normal";
	zIndex: "auto";
};

type AcceptedIntrinsicCases = {
	[PropertyName in keyof IntrinsicCases]: {
		[Value in Extract<IntrinsicCases[PropertyName], string>]: Value extends PandwindPropertyValue<
			Extract<PropertyName, string>
		>
			? true
			: false;
	}[Extract<IntrinsicCases[PropertyName], string>];
}[keyof IntrinsicCases];

type InvalidCases = {
	backgroundColor: "auto";
	color: "flex";
	display: "auto";
	fontWeight: "semibold";
	marginLeft: "flex";
	boxShadow: "solid";
	overflow: "between";
};

type RejectedInvalidCases = {
	[PropertyName in keyof InvalidCases]: InvalidCases[PropertyName] extends PandwindPropertyValue<
		Extract<PropertyName, string>
	>
		? false
		: true;
}[keyof InvalidCases];

type CssWideCases = CssWideValue extends PandwindPropertyValue<"display"> ? true : false;

const intrinsicPreset = define.preset(
	{
		config: {} as PandwindProperties,
		tokens: {},
	},
	{
		strict: true,
		conditions: { _hover: "&:hover" },
		properties: {
			display: true,
			color: true,
			backgroundColor: true,
			marginLeft: true,
			inset: true,
			width: true,
			boxShadow: true,
			textShadow: true,
			fontWeight: true,
			overflow: true,
			position: true,
			borderStyle: true,
			padding: true,
		},
	},
);
const css = createCss(intrinsicPreset);

test("intrinsic CSS values remain available across every curated property group", () => {
	expect(typeValue<AcceptedIntrinsicCases>()).type.toBe<true>();
	expect(typeValue<RejectedInvalidCases>()).type.toBe<true>();
	expect(typeValue<CssWideCases>()).type.toBe<true>();
});

test("strict CSS accepts the intrinsic and CSS-wide values at call sites", () => {
	expect(
		css.class({
			display: "block",
			color: "currentColor",
			backgroundColor: "transparent",
			marginLeft: "auto",
			inset: "auto",
			width: "fit-content",
			boxShadow: "none",
			textShadow: "none",
			fontWeight: "bold",
			overflow: "hidden",
			position: "sticky",
			borderStyle: "solid",
			_hover: {
				display: "grid",
				color: "inherit",
			},
		}),
	).type.toBe<string>();

	expect(
		css.class({
			display: "initial",
			color: "unset",
			marginLeft: "revert",
			padding: "revert-layer",
			fontWeight: "normal",
		}),
	).type.toBe<string>();
});

test("semantic font-weight values remain tokens rather than intrinsic keywords", () => {
	const preset = define.preset(
		{
			config: {} as PandwindProperties,
			tokens: { fontWeights: { semibold: "600" } },
		},
		{
			strict: true,
			conditions: {},
			properties: { fontWeight: { $tokens: "fontWeights" } },
		},
	);
	const strictCss = createCss(preset);

	expect(strictCss.class({ fontWeight: "semibold" })).type.toBe<string>();
	expect(strictCss.class({ fontWeight: "bold" })).type.toBe<string>();
	// @ts-expect-error not assignable
	strictCss.class({ fontWeight: "auto" });
});

test("the shared property contract keeps every curated property non-widened", () => {
	type NonNullish<Value> = Exclude<Value, null | undefined>;
	type WidenedPropertyNames = {
		[PropertyName in keyof PandwindProperties]-?: string extends NonNullish<
			PandwindProperties[PropertyName]
		>
			? PropertyName
			: never;
	}[keyof PandwindProperties];

	expect(typeValue<WidenedPropertyNames>()).type.toBe<never>();
});
