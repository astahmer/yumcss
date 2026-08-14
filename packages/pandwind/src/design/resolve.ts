import type { AnyTokens, StyleObject } from "../types/typings.d.ts";

/* ---------------------------------------------------------------------------
 * Design-style resolution — designer vocabulary -> concrete CSS properties.
 *
 * Values are resolved against the preset's token groups here, so the design
 * layer is self-contained: the emitted CSS needs no per-property token
 * configuration (unlike raw `css()`, where the preset's `properties` config
 * resolves tokens). The class hash still encodes the resolved value, so the
 * vite extractor and the runtime produce byte-identical stylesheets.
 * -------------------------------------------------------------------------*/

type ModuleKey = "$frame" | "$layout" | "$text";

const MODULE_KEYS = new Set(["$frame", "$layout", "$text"]);

const isModuleKey = (key: string): key is ModuleKey => MODULE_KEYS.has(key);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const resolveDesignStyle = (
	style: Record<string, unknown>,
	tokens: AnyTokens | undefined,
): StyleObject => {
	const out: StyleObject = {};

	for (const [key, value] of Object.entries(style)) {
		if (value === undefined || value === null || value === false) continue;

		// Raw CSS: passed through verbatim, the engine resolves its tokens.
		if (key === "$raw") {
			Object.assign(out, value as StyleObject);
			continue;
		}

		// Dynamic input: the engine's transform owns this key.
		if (key === "$input") {
			out[key] = value as string;
			continue;
		}

		if (isModuleKey(key)) {
			Object.assign(out, resolveModule(key, value as Record<string, unknown>, tokens));
			continue;
		}

		// Conditions, selectors and raw value-objects (`color: { _hover: "red" }`)
		// all recurse; plain values pass through untouched.
		out[key] = isPlainObject(value) ? resolveDesignStyle(value, tokens) : (value as string);
	}

	return out;
};

/* ---------------------------------------------------------------------------
 * token helpers
 * -------------------------------------------------------------------------*/

type TokenLookup = (group: string, value: string | number) => string;

const makeTokenLookup = (tokens: AnyTokens | undefined): TokenLookup => {
	return (group, value) => {
		if (typeof value === "number") return String(value);
		const groupTokens = tokens?.[group];
		if (groupTokens && typeof groupTokens[value] === "string") {
			return groupTokens[value] as string;
		}
		return value;
	};
};

/**
 * A length that becomes `px` when numeric, otherwise a token name or raw
 * length ("50%", "calc(...)"). Numeric strings that aren't tokens are
 * treated as px too — designers write "6", not `6`.
 */
const toLength =
	(token: TokenLookup, group: string) =>
	(value: string | number): string => {
		if (typeof value === "number") return `${value}px`;
		const resolved = token(group, value);
		if (resolved !== value) return resolved;
		return /^\d+(\.\d+)?$/.test(value) ? `${value}px` : value;
	};

/* ---------------------------------------------------------------------------
 * $frame — the box
 * -------------------------------------------------------------------------*/

const OVERFLOW: Record<string, string> = {
	show: "visible",
	clip: "hidden",
	scroll: "scroll",
	"scroll-hidden": "auto",
};

const toOverflow = (value: unknown): string => {
	if (Array.isArray(value)) {
		return `${OVERFLOW[value[0] as string] ?? value[0]} ${
			OVERFLOW[value[1] as string] ?? value[1]
		}`;
	}
	return OVERFLOW[value as string] ?? String(value);
};

const toSpacingList = (
	value: string | number | Array<string | number>,
	toSize: (item: string | number) => string,
): string => (Array.isArray(value) ? value.map(toSize).join(" ") : toSize(value));

const toBorder = (
	value: unknown,
	token: TokenLookup,
	toSize: (item: string | number) => string,
): string => {
	if (typeof value === "string") {
		return `1px solid ${token("colors", value)}`;
	}
	const border = value as {
		color: string;
		width?: number | string;
		style?: string;
	};
	return `${toSize(border.width ?? 1)} ${border.style ?? "solid"} ${token("colors", border.color)}`;
};

const resolveFrame = (props: Record<string, unknown>, token: TokenLookup): StyleObject => {
	const out: StyleObject = {};
	const toSize = toLength(token, "spacing");
	const toRadius = toLength(token, "radii");

	if (props.w !== undefined) out.width = toSize(props.w as string | number);
	if (props.h !== undefined) out.height = toSize(props.h as string | number);
	if (props.corners !== undefined) {
		out.borderRadius = toSpacingList(props.corners as never, toRadius);
	}
	if (props.fill !== undefined) {
		if (Array.isArray(props.fill)) {
			out.background = `linear-gradient(135deg, ${(props.fill as string[])
				.map((color) => token("colors", color))
				.join(", ")})`;
		} else {
			out.backgroundColor = token("colors", props.fill as string);
		}
	}
	if (props.border !== undefined) out.border = toBorder(props.border, token, toSize);
	if (props.blurBg !== undefined) out.backdropFilter = `blur(${props.blurBg}px)`;
	if (props.pad !== undefined) {
		out.padding = toSpacingList(props.pad as never, toSize);
	}
	if (props.padX !== undefined) {
		out.paddingInline = toSize(props.padX as string | number);
	}
	if (props.padY !== undefined) {
		out.paddingBlock = toSize(props.padY as string | number);
	}
	if (props.overflow !== undefined) out.overflow = toOverflow(props.overflow);
	if (props.z !== undefined) out.zIndex = String(props.z);
	if (props.opacity !== undefined) {
		out.opacity = String((props.opacity as number) / 100);
	}

	return out;
};

/* ---------------------------------------------------------------------------
 * $layout — the children
 * -------------------------------------------------------------------------*/

const Y: Record<string, string> = {
	top: "flex-start",
	center: "center",
	bottom: "flex-end",
};

const X: Record<string, string> = {
	left: "flex-start",
	center: "center",
	right: "flex-end",
};

const resolveLayout = (props: Record<string, unknown>, token: TokenLookup): StyleObject => {
	const out: StyleObject = {};
	const flow = props.flow as string | undefined;
	const toSize = toLength(token, "spacing");

	if (flow === "grid") {
		out.display = "grid";
		out.gridAutoFlow = "row";
		if (props.cols !== undefined) {
			out.gridTemplateColumns = `repeat(${props.cols}, minmax(0, 1fr))`;
		}
		if (props.rows !== undefined) {
			out.gridTemplateRows = `repeat(${props.rows}, minmax(0, 1fr))`;
		}
	} else if (flow === "stackX" || flow === "stackY") {
		out.display = "flex";
		out.flexDirection = flow === "stackX" ? "row" : "column";
		if (props.wrap !== undefined) {
			out.flexWrap = props.wrap ? "wrap" : "nowrap";
		}
	}

	if (props.align !== undefined && flow !== "grid") {
		const isCenter = props.align === "center";
		const [yPart, xPart] = isCenter
			? (["center", "center"] as const)
			: ((props.align as string).split("-") as [string, string]);
		const isHorizontal = flow === "stackX";
		out.justifyContent = (isHorizontal ? X : Y)[isHorizontal ? xPart : yPart] ?? "center";
		out.alignItems = (isHorizontal ? Y : X)[isHorizontal ? yPart : xPart] ?? "center";
	}

	if (props.gap !== undefined) out.gap = toSize(props.gap as string | number);
	if (props.gapX !== undefined) {
		out.columnGap = toSize(props.gapX as string | number);
	}
	if (props.gapY !== undefined) {
		out.rowGap = toSize(props.gapY as string | number);
	}

	return out;
};

/* ---------------------------------------------------------------------------
 * $text — the type
 * -------------------------------------------------------------------------*/

const TEXT_CASE: Record<string, string> = {
	asTyped: "none",
	upper: "uppercase",
	lower: "lowercase",
	title: "capitalize",
};

const resolveText = (props: Record<string, unknown>, token: TokenLookup): StyleObject => {
	const out: StyleObject = {};
	const toSize = toLength(token, "fontSizes");
	const toLetter = toLength(token, "letterSpacings");

	if (props.color !== undefined) out.color = token("colors", props.color as string);
	if (props.font !== undefined) out.fontFamily = token("fonts", props.font as string);
	if (props.weight !== undefined) {
		out.fontWeight = String(token("fontWeights", props.weight as string | number));
	}
	if (props.size !== undefined) {
		out.fontSize = toSize(props.size as string | number);
	}
	if (props.align !== undefined) out.textAlign = props.align as string;
	if (props.case !== undefined) out.textTransform = TEXT_CASE[props.case as string];
	if (props.truncate === true) {
		out.overflow = "hidden";
		out.textOverflow = "ellipsis";
		out.whiteSpace = "nowrap";
	}
	if (props.spacing !== undefined) {
		const spacing = props.spacing as
			| string
			| number
			| { line?: string | number; letter?: string | number };
		if (typeof spacing === "object") {
			if (spacing.line !== undefined) out.lineHeight = token("lineHeights", spacing.line);
			if (spacing.letter !== undefined) {
				out.letterSpacing = toLetter(spacing.letter);
			}
		} else {
			out.lineHeight = token("lineHeights", spacing);
		}
	}
	if (props.decoration !== undefined) {
		const decoration = props.decoration as
			| string
			| {
					type: string;
					style?: string;
					color?: string;
					thickness?: number | "auto";
					offset?: number | "auto";
			  };
		if (typeof decoration === "string") {
			out.textDecorationLine = decoration === "strikethrough" ? "line-through" : decoration;
		} else {
			out.textDecorationLine = decoration.type === "strikethrough" ? "line-through" : "underline";
			if (decoration.style !== undefined) out.textDecorationStyle = decoration.style;
			if (decoration.color !== undefined) {
				out.textDecorationColor = token("colors", decoration.color);
			}
			if (decoration.thickness !== undefined) {
				out.textDecorationThickness =
					decoration.thickness === "auto" ? "auto" : `${decoration.thickness}px`;
			}
			if (decoration.offset !== undefined) {
				out.textUnderlineOffset = decoration.offset === "auto" ? "auto" : `${decoration.offset}px`;
			}
		}
	}
	if (props.highlight !== undefined) {
		const highlight = props.highlight as string | { text?: string; bg?: string };
		if (typeof highlight === "string") {
			out.backgroundColor = token("colors", highlight);
		} else {
			if (highlight.text !== undefined) out.color = token("colors", highlight.text);
			if (highlight.bg !== undefined) {
				out.backgroundColor = token("colors", highlight.bg);
			}
		}
	}

	return out;
};

const resolveModule = (
	key: ModuleKey,
	props: Record<string, unknown>,
	tokens: AnyTokens | undefined,
): StyleObject => {
	const token = makeTokenLookup(tokens);
	switch (key) {
		case "$frame":
			return resolveFrame(props, token);
		case "$layout":
			return resolveLayout(props, token);
		case "$text":
			return resolveText(props, token);
	}
};
