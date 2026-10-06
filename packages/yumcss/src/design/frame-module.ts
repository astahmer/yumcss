import type { StyleObject } from "../types/typings.ts";
import type { DesignModuleAdapter, TokenLookup } from "./contracts.ts";
import { toLength } from "./module-values.ts";

const OVERFLOW: Record<string, string> = {
	show: "visible",
	clip: "hidden",
	scroll: "scroll",
	"scroll-hidden": "auto",
};
const BORDER_STYLES = new Set(["solid", "dashed", "dotted", "double", "none"]);

const toOverflow = (value: unknown): string => {
	if (Array.isArray(value)) {
		if (value.length !== 2 || value.some((item) => typeof item !== "string")) return "";
		const first = OVERFLOW[value[0]!];
		const second = OVERFLOW[value[1]!];
		return first === undefined || second === undefined ? "" : `${first} ${second}`;
	}
	return typeof value === "string" ? (OVERFLOW[value] ?? "") : "";
};

const toSpacingList = (value: unknown, toSize: (item: string | number) => string): string => {
	if (Array.isArray(value)) {
		if (!value.every((item) => typeof item === "string" || Number.isFinite(item))) return "";
		const sizes = value.map((item) => toSize(item as string | number));
		return sizes.every((item) => item !== "") ? sizes.join(" ") : "";
	}
	return typeof value === "string" || (typeof value === "number" && Number.isFinite(value))
		? toSize(value)
		: "";
};

const toBorder = (
	value: unknown,
	token: TokenLookup,
	toSize: (item: string | number) => string,
): string => {
	if (typeof value === "string") {
		const color = token("colors", value);
		return color === "" ? "" : `1px solid ${color}`;
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
	const border = value as {
		color?: unknown;
		width?: unknown;
		style?: unknown;
	};
	if (typeof border.color !== "string") return "";
	if (
		border.width !== undefined &&
		typeof border.width !== "string" &&
		typeof border.width !== "number"
	)
		return "";
	if (
		border.style !== undefined &&
		(typeof border.style !== "string" || !BORDER_STYLES.has(border.style))
	)
		return "";
	const width = toSize((border.width ?? "1px") as string | number);
	const color = token("colors", border.color);
	if (width === "" || color === "") return "";
	return `${width} ${border.style ?? "solid"} ${color}`;
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
			if (
				props.fill.length > 0 &&
				props.fill.every((color) => typeof color === "string" && color.length > 0)
			) {
				const colors = (props.fill as string[]).map((color) => token("colors", color));
				if (colors.every((color) => color !== ""))
					out.background = `linear-gradient(135deg, ${colors.join(", ")})`;
			}
		} else if (typeof props.fill === "string") {
			const color = token("colors", props.fill);
			if (color !== "") out.backgroundColor = color;
		}
	}
	if (props.border !== undefined) out.border = toBorder(props.border, token, toSize);
	if (typeof props.blurBg === "string" || props.blurBg === 0)
		out.backdropFilter = `blur(${toSize(props.blurBg)})`;
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
	if (typeof props.z === "number" && Number.isFinite(props.z)) out.zIndex = String(props.z);
	if (
		typeof props.opacity === "number" &&
		Number.isFinite(props.opacity) &&
		props.opacity >= 0 &&
		props.opacity <= 100
	) {
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
