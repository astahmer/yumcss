import type { AnySelector } from "../types/selectors.d.ts";
import type {
	AnyCssConfig,
	AnyTokens,
	CssConfigReturn,
	DefinePresetOptions,
	StyleObject,
} from "../types/typings.ts";

/* ---------------------------------------------------------------------------
 * Designer vocabulary — the box, its children and its type.
 *
 * Borrowed from the inspector panels of Figma, Framer and Sketch: ~30 props
 * instead of ~500 CSS properties. Every value is a token or a constrained
 * option, so an off-system color or a typo does not compile. The `$raw`
 * escape hatch exists for everything else — styling reads top-to-bottom as
 * intent, and the compiler is the contract.
 * -------------------------------------------------------------------------*/

type TokenNames<TTokens, TGroup extends string> =
	TTokens extends Record<string, Record<string, unknown>>
		? TGroup extends keyof TTokens
			? StringValuedKeys<TTokens[TGroup]>
			: never
		: never;

/**
 * Keys whose token value is a plain string. Condition-bound tokens
 * (`{ base, _dark }`) are consumed through their generated `@theme`
 * utilities instead — they are not direct design-fill spellings.
 */
type StringValuedKeys<T> = { [K in keyof T]: T[K] extends string ? K : never }[keyof T];

/**
 * Token names of a group, falling back to a raw `string` when the preset has
 * no tokens for that group (the group is simply unconstrained then).
 */
type TokensOr<TTokens, TGroup extends string, TFallback> = [TokenNames<TTokens, TGroup>] extends [
	never,
]
	? TFallback
	: TokenNames<TTokens, TGroup>;

/** Strict: a token name or nothing. Off-system colors do not compile. */
type ColorValue<TTokens> = TokensOr<TTokens, "colors", string>;

/**
 * Token names, a px number, or any open length (`"50%"`, `"calc(...)"`).
 * Numeric tokens (spacing steps like `20`) are usable as numbers.
 */
type SpaceValue<TTokens> = TokensOr<TTokens, "spacing", string> | number | (string & {});

/** Token names or a px number (Figma-style corner radius). */
type RadiusValue<TTokens> = TokensOr<TTokens, "radii", string> | number;

/** Font-family names are an open set: token names or any string. */
type FontValue<TTokens> = TokensOr<TTokens, "fonts", string> | (string & {});

type FontSizeValue<TTokens> = TokensOr<TTokens, "fontSizes", string> | number | (string & {});

type FontWeightValue<TTokens> =
	| TokensOr<TTokens, "fontWeights", never>
	| 100
	| 200
	| 300
	| 400
	| 500
	| 600
	| 700
	| 800
	| 900
	| "thin"
	| "light"
	| "normal"
	| "medium"
	| "semibold"
	| "bold"
	| "black";

type LineHeightValue<TTokens> = TokensOr<TTokens, "lineHeights", string> | number | (string & {});

type LetterSpacingValue<TTokens> =
	| TokensOr<TTokens, "letterSpacings", string>
	| number
	| (string & {});

type AxisValue<T> = T | [T, T] | [T, T, T] | [T, T, T, T];

/** One value, or 2/3/4 in CSS order (tl-tr-br-bl for corners). */
type CornerValue<TTokens> = AxisValue<RadiusValue<TTokens>>;

/** One value, or 2 (y/x), 3 (top/x/bottom) or 4 (t-r-b-l). */
type PadValue<TTokens> = AxisValue<SpaceValue<TTokens>>;

type FillValue<TTokens> =
	| ColorValue<TTokens>
	| [ColorValue<TTokens>, ColorValue<TTokens>, ...Array<ColorValue<TTokens>>];

type BorderValue<TTokens> =
	| ColorValue<TTokens>
	| {
			color: ColorValue<TTokens>;
			width?: number | string;
			style?: "solid" | "dashed" | "dotted" | "double" | "none";
	  };

type OverflowValue = "show" | "clip" | "scroll" | "scroll-hidden";

/** The box — how the element itself looks. */
interface FrameProps<TTokens extends AnyTokens> {
	/** Width. Spacing token, px number, or any length. */
	w?: SpaceValue<TTokens>;
	/** Height. Spacing token, px number, or any length. */
	h?: SpaceValue<TTokens>;
	/** Corner radius. One value or Figma order: top-left, top-right, bottom-right, bottom-left. */
	corners?: CornerValue<TTokens>;
	/** Background: a color token, or a color list for a 135deg gradient. */
	fill?: FillValue<TTokens>;
	/** Border: a color token (1px solid), or { color, width, style }. */
	border?: BorderValue<TTokens>;
	/** Backdrop blur in px (Figma "background blur"). */
	blurBg?: number;
	/** Padding. One value or [top, right, bottom, left]. */
	pad?: PadValue<TTokens>;
	/** Horizontal padding (padding-inline). */
	padX?: SpaceValue<TTokens>;
	/** Vertical padding (padding-block). */
	padY?: SpaceValue<TTokens>;
	/** Overflow. One value for both axes, or [x, y]. */
	overflow?: OverflowValue | [OverflowValue, OverflowValue];
	/** z-index. */
	z?: number;
	/** Opacity, 0-100 like the Figma slider (50 -> opacity: 0.5). */
	opacity?: number;
}

type FlowValue = "stackX" | "stackY" | "grid";
type AlignValue = "center" | `${"top" | "center" | "bottom"}-${"left" | "center" | "right"}`;

/** The children — how the element lays out its content. */
interface LayoutProps<TTokens extends AnyTokens> {
	/** stackX: row, stackY: column, grid: auto-flow grid. */
	flow?: FlowValue;
	/** Wrap children onto the next line (stack flows). */
	wrap?: boolean;
	/** Grid: number of columns. */
	cols?: number;
	/** Grid: number of rows. */
	rows?: number;
	/** Content alignment, Figma-style ("top-left", "center", "bottom-right", ...). */
	align?: AlignValue;
	/** Gap between children. */
	gap?: SpaceValue<TTokens>;
	/** Horizontal gap (column-gap). */
	gapX?: SpaceValue<TTokens> | "auto";
	/** Vertical gap (row-gap). */
	gapY?: SpaceValue<TTokens> | "auto";
}

type DecorationValue<TTokens> =
	| "none"
	| "underline"
	| "strikethrough"
	| {
			type: "underline" | "strikethrough";
			style?: "solid" | "double" | "dotted" | "dashed" | "wavy";
			color?: ColorValue<TTokens>;
			thickness?: number | "auto";
			offset?: number | "auto";
	  };

type SpacingValue<TTokens> =
	| LineHeightValue<TTokens>
	| {
			/** Line height. A unitless number is a multiplier, like CSS. */
			line?: LineHeightValue<TTokens>;
			/** Letter spacing (px number or token). */
			letter?: LetterSpacingValue<TTokens>;
	  };

type HighlightValue<TTokens> =
	| ColorValue<TTokens>
	| { text?: ColorValue<TTokens>; bg?: ColorValue<TTokens> };

/** The type — how text looks. */
interface TextProps<TTokens extends AnyTokens> {
	/** Text color token. */
	color?: ColorValue<TTokens>;
	/** Font family (token or name). */
	font?: FontValue<TTokens>;
	/** Font weight (token, 100-900, or named). */
	weight?: FontWeightValue<TTokens>;
	/** Font size (token, px number, or any length). */
	size?: FontSizeValue<TTokens>;
	/** Text alignment. */
	align?: "left" | "center" | "right" | "justify";
	/** Text transform: asTyped, upper, lower or title case. */
	case?: "asTyped" | "upper" | "lower" | "title";
	/** Single-line ellipsis truncation. */
	truncate?: boolean;
	/** Line height, or { line, letter } for both. */
	spacing?: SpacingValue<TTokens>;
	/** Underline / strikethrough, plain or with style/color/thickness. */
	decoration?: DecorationValue<TTokens>;
	/** Text highlight: a color token, or { text, bg }. */
	highlight?: HighlightValue<TTokens>;
}

/**
 * Preset contract required by {@link createDesignCss}.
 *
 * @category design system
 * @since 0.1.0
 */
export type DesignPreset = CssConfigReturn<DefinePresetOptions<AnyCssConfig, AnyTokens>>;

/**
 * Design style object with `$frame`, `$layout`, `$text`, and `$raw` modules.
 *
 * @example
 * ```ts
 * import type { DesignStyleObject } from "pandwind/design";
 * import { examplePreset } from "@pandwind/example-preset";
 *
 * const style: DesignStyleObject<typeof examplePreset> = {
 *   $frame: { fill: "$blue-500", pad: [8, 16] },
 *   $text: { color: "$gray-50", weight: "semibold" },
 *   _hover: { $frame: { fill: "$blue-600" } },
 * };
 * ```
 *
 * @typeParam TPreset - Preset supplying tokens and condition keys.
 * @category design system
 * @since 0.1.0
 */
export type DesignStyleObject<TPreset extends DesignPreset> = {
	/** The box: w, h, corners, fill, border, pad, overflow, z, opacity ... */
	$frame?: FrameProps<TPreset["tokens"]>;
	/** Its children: flow, gap, align, wrap, cols, rows ... */
	$layout?: LayoutProps<TPreset["tokens"]>;
	/** The type: font, size, weight, color, case, decoration, truncate ... */
	$text?: TextProps<TPreset["tokens"]>;
	/** Raw CSS escape hatch — passed through verbatim. */
	$raw?: StyleObject;
} & {
	[K in keyof TPreset["conditions"]]?: DesignStyleObject<TPreset>;
} & {
	[K in AnySelector]?: DesignStyleObject<TPreset>;
};
