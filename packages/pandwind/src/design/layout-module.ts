import type { StyleObject } from "../types/typings.ts";
import type { DesignModuleAdapter, TokenLookup } from "./contracts.ts";
import { toLength } from "./module-values.ts";

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


export const layoutModule: DesignModuleAdapter = {
	key: "$layout",
	resolve(props, { token }) { return resolveLayout(props, token); },
};
