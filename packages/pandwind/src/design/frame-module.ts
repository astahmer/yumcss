import type { StyleObject } from "../types/typings.ts";
import type { DesignModuleAdapter, TokenLookup } from "./contracts.ts";
import { toLength } from "./module-values.ts";

/**
 * A length that becomes `px` when numeric, otherwise a token name or raw
 * length ("50%", "calc(...)"). Numeric strings that aren't tokens are
 * treated as px too — designers write "6", not `6`.
 */
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

export const frameModule: DesignModuleAdapter = {
	key: "$frame",
	resolve(props, { token }) {
		return resolveFrame(props, token);
	},
};
