import {
	CORNER_EXPANSION,
	CSS_LENGTH,
	expandShorthand,
	parseCssLength,
	SIDE_EXPANSION,
	splitCssValue,
} from "./conversion.ts";
import { createObjectBackend, type ObjectBackend, type ObjectBackendOptions } from "./object.ts";
import type { StyleBackendFactory } from "./registry.ts";
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
	"fontFamily",
	"fontSize",
	"lineHeight",
	"letterSpacing",
	"whiteSpace",
]);

const OPENTUI_BACKEND_CAPABILITIES: BackendCapabilityContract = {
	schema: "pandwind.style-backend-capabilities/1",
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
	const out: Record<string, unknown> = { border: true };
	const candidates = splitCssValue(value).filter(
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
		if (pixels === undefined) throw new Error(`pandwind/opentui: unsupported length "${part}"`);
		return Math.round(pixels / cellSize);
	};

const makeConvert =
	(cellSize: number) =>
	(prop: string, value: string): Record<string, unknown> => {
		if (UNSUPPORTED.has(prop))
			throw new Error(`pandwind/opentui: property "${prop}" has no OpenTUI representation`);
		if (prop === "border") return toBorder(value);
		if (KEEP_STRING.has(prop)) return { [prop]: value };

		const parts = splitCssValue(value);
		const allLengths = parts.every((part) => CSS_LENGTH.test(part));
		if (prop === "borderRadius" || prop === "padding" || prop === "margin") {
			if (!allLengths) return { [prop]: value };
			const toCells = makeToCells(cellSize);
			if (parts.length === 1) return { [prop]: toCells(parts[0]!) };
			const table = prop === "borderRadius" ? CORNER_EXPANSION : SIDE_EXPANSION;
			const property =
				prop === "borderRadius"
					? (suffix: string) => `border${suffix}Radius`
					: (suffix: string) => `${prop}${suffix}`;
			return expandShorthand(parts, table, toCells, property) ?? { [prop]: value };
		}
		if (parts.length > 1)
			throw new Error(`pandwind/opentui: property "${prop}" value "${value}" is not representable`);
		if (!allLengths) return { [prop]: value };
		return { [prop]: makeToCells(cellSize)(parts[0]!) };
	};

export interface OpentuiBackendOptions extends Omit<
	ObjectBackendOptions,
	"name" | "capabilities" | "convert"
> {
	readonly name?: string;
	readonly cellSize?: number;
}

export function createOpentuiBackend(options: OpentuiBackendOptions = {}): ObjectBackend {
	return createObjectBackend({
		...options,
		name: options.name ?? "opentui",
		capabilities: OPENTUI_BACKEND_CAPABILITIES,
		convert: makeConvert(options.cellSize ?? 4),
	});
}

export const OPENTUI_BACKEND: StyleBackendFactory<
	OpentuiBackendOptions,
	Record<string, unknown>
> = {
	schema: STYLE_BACKEND_SCHEMA,
	id: "opentui",
	capabilities: OPENTUI_BACKEND_CAPABILITIES,
	create: createOpentuiBackend,
};
