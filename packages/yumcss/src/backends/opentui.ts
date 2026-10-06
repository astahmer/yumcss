import {
	CSS_LENGTH,
	CSS_NUMERIC_WITH_UNIT,
	expandShorthand,
	parseCssLength,
	SIDE_EXPANSION,
	splitCssValue,
} from "./conversion.ts";
import { createObjectBackend, type ObjectBackend, type ObjectBackendOptions } from "./object.ts";
import type { StyleBackendFactory } from "./registry.ts";
import { StyleBackendId } from "./types.ts";
import { STYLE_BACKEND_SCHEMA, type BackendCapabilityContract } from "./types.ts";

const BORDER_STYLES = new Set([
	"none",
	"hidden",
	"dotted",
	"dashed",
	"solid",
	"double",
	"groove",
	"ridge",
	"inset",
	"outset",
]);
const CELL_PROPERTIES = new Set([
	"width",
	"height",
	"top",
	"right",
	"bottom",
	"left",
	"minWidth",
	"minHeight",
	"maxWidth",
	"maxHeight",
	"flexBasis",
	"margin",
	"marginX",
	"marginY",
	"marginTop",
	"marginRight",
	"marginBottom",
	"marginLeft",
	"padding",
	"paddingX",
	"paddingY",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"gap",
	"rowGap",
	"columnGap",
]);
const PERCENT_PROPERTIES = new Set([
	"top",
	"right",
	"bottom",
	"left",
	"minWidth",
	"minHeight",
	"maxWidth",
	"maxHeight",
	"width",
	"height",
	"margin",
	"marginX",
	"marginY",
	"marginTop",
	"marginRight",
	"marginBottom",
	"marginLeft",
	"padding",
	"paddingX",
	"paddingY",
	"paddingTop",
	"paddingRight",
	"paddingBottom",
	"paddingLeft",
	"gap",
	"rowGap",
	"columnGap",
]);
const AUTO_PROPERTIES = new Set([
	"width",
	"height",
	"minWidth",
	"minHeight",
	"maxWidth",
	"maxHeight",
	"top",
	"right",
	"bottom",
	"left",
	"flexBasis",
	"margin",
	"marginX",
	"marginY",
	"marginTop",
	"marginRight",
	"marginBottom",
	"marginLeft",
]);
const NUMERIC_PROPERTIES = new Set(["flexGrow", "flexShrink", "opacity", "zIndex"]);
const KEEP_STRING = new Set(["fontWeight"]);
const UNSUPPORTED = new Set([
	"backdropFilter",
	"filter",
	"boxShadow",
	"float",
	"clear",
	"cursor",
	"transitionProperty",
	"transitionDuration",
	"transitionTimingFunction",
	"transitionDelay",
	"animationName",
	"animationDuration",
	"animationTimingFunction",
	"animationDelay",
	"gridTemplateColumns",
	"gridTemplateRows",
	"gridColumn",
	"gridRow",
	"borderWidth",
	"borderTopWidth",
	"borderRightWidth",
	"borderBottomWidth",
	"borderLeftWidth",
	"borderRadius",
	"fontFamily",
	"fontSize",
	"lineHeight",
	"letterSpacing",
	"whiteSpace",
]);

const OPENTUI_BACKEND_CAPABILITIES: BackendCapabilityContract = {
	schema: "yumcss.style-backend-capabilities/1",
	artifact: "style-object",
	unsupported: "throw",
	features: {
		declarations: "partial",
		conditions: "partial",
		"dynamic-values": "unsupported",
		"runtime-conditions": "partial",
		"unit-conversion": "partial",
		serialization: "partial",
		"stable-identity": "exact",
		ssr: "unsupported",
	},
};

const toBorder = (value: string): Record<string, unknown> => {
	const parts = splitCssValue(value);
	if (
		parts.some((part) => ["none", "hidden"].includes(part.toLowerCase())) ||
		parts.some((part) => parseCssLength(part) === 0)
	)
		return { border: false };
	const out: Record<string, unknown> = { border: true };
	const candidates = parts.filter(
		(part) => !CSS_LENGTH.test(part) && !BORDER_STYLES.has(part.toLowerCase()),
	);
	const color = candidates[candidates.length - 1];
	if (color !== undefined) out.borderColor = color;
	return out;
};

const makeToCells =
	(cellSize: number) =>
	(part: string): number => {
		const pixels = parseCssLength(part);
		if (pixels === undefined) throw new Error(`yumcss/opentui: unsupported length "${part}"`);
		return Math.round(pixels / cellSize);
	};

const makeConvert =
	(cellSize: number) =>
	(prop: string, value: string): Record<string, unknown> => {
		if (UNSUPPORTED.has(prop))
			throw new Error(`yumcss/opentui: property "${prop}" has no OpenTUI representation`);
		if (prop === "border") return toBorder(value);
		if (KEEP_STRING.has(prop)) return { [prop]: value };

		const parts = splitCssValue(value);
		const unsupportedUnit = parts.find((part) => {
			const unit = CSS_NUMERIC_WITH_UNIT.exec(part)?.[2]?.toLowerCase();
			return unit !== undefined && unit !== "px" && unit !== "rem" && unit !== "%";
		});
		if (CELL_PROPERTIES.has(prop) && unsupportedUnit !== undefined)
			throw new Error(
				`yumcss/opentui: property "${prop}" does not support the length unit in "${unsupportedUnit}"`,
			);
		if (NUMERIC_PROPERTIES.has(prop)) {
			const match = parts.length === 1 ? CSS_LENGTH.exec(parts[0]!) : null;
			if (match !== null && match[2] === undefined) return { [prop]: Number(match[1]) };
			throw new Error(
				`yumcss/opentui: property "${prop}" value "${value}" must be unitless numeric`,
			);
		}
		if (CELL_PROPERTIES.has(prop)) {
			const isPercentage = (part: string) =>
				PERCENT_PROPERTIES.has(prop) && CSS_NUMERIC_WITH_UNIT.exec(part)?.[2] === "%";
			const convertLength = (part: string) =>
				CSS_LENGTH.test(part) ? makeToCells(cellSize)(part) : part;
			if (parts.length === 1 && CSS_LENGTH.test(parts[0]!))
				return { [prop]: makeToCells(cellSize)(parts[0]!) };
			if (parts.length === 1 && isPercentage(parts[0]!)) return { [prop]: value };
			if (parts.length === 1 && value === "auto" && AUTO_PROPERTIES.has(prop))
				return { [prop]: value };
			if (prop === "padding" || prop === "margin") {
				const allConvertible = parts.every((part) => CSS_LENGTH.test(part) || isPercentage(part));
				if (allConvertible) {
					const expanded = expandShorthand(
						parts,
						SIDE_EXPANSION,
						convertLength,
						(suffix) => `${prop}${suffix}`,
					);
					if (expanded !== undefined) return expanded;
				}
			}
			throw new Error(`yumcss/opentui: property "${prop}" value "${value}" is not representable`);
		}
		if (parts.some((part) => CSS_NUMERIC_WITH_UNIT.test(part)))
			throw new Error(`yumcss/opentui: property "${prop}" value "${value}" is not representable`);
		if (parts.length > 1)
			throw new Error(`yumcss/opentui: property "${prop}" value "${value}" is not representable`);
		return { [prop]: value };
	};

export interface OpentuiBackendOptions extends Omit<
	ObjectBackendOptions,
	"name" | "capabilities" | "convert"
> {
	readonly name?: string;
	readonly cellSize?: number;
}

export function createOpentuiBackend(options: OpentuiBackendOptions = {}): ObjectBackend {
	const cellSize = options.cellSize ?? 4;
	if (!Number.isFinite(cellSize) || cellSize <= 0)
		throw new Error("yumcss/opentui: cellSize must be a positive finite number");
	return createObjectBackend({
		...options,
		name: options.name ?? "opentui",
		capabilities: OPENTUI_BACKEND_CAPABILITIES,
		unsupportedProperties: UNSUPPORTED,
		unsupportedPropertyLabel: "OpenTUI",
		convert: makeConvert(cellSize),
	});
}

export const OPENTUI_BACKEND: StyleBackendFactory<
	OpentuiBackendOptions,
	Record<string, unknown>
> = {
	schema: STYLE_BACKEND_SCHEMA,
	id: StyleBackendId.OpenTui,
	capabilities: OPENTUI_BACKEND_CAPABILITIES,
	create: createOpentuiBackend,
};
