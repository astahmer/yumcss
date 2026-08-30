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
import { BuiltinBackendId } from "./backend-identifiers.ts";
import { STYLE_BACKEND_SCHEMA, type BackendCapabilityContract } from "./types.ts";

const KEEP_STRING = new Set(["fontWeight", "fontFamily", "fontVariant"]);
const UNSUPPORTED = new Set([
	"backdropFilter",
	"filter",
	"boxShadow",
	"float",
	"clear",
	"cursor",
	"whiteSpace",
	"transitionProperty",
	"transitionDuration",
	"transitionTimingFunction",
	"transitionDelay",
	"animationName",
	"animationDuration",
	"animationTimingFunction",
	"gridTemplateColumns",
	"gridTemplateRows",
	"gridColumn",
	"gridRow",
]);

const REACT_NATIVE_BACKEND_CAPABILITIES: BackendCapabilityContract = {
	schema: "pandwind.style-backend-capabilities/1",
	artifact: "style-object",
	unsupported: "throw",
	features: {
		declarations: "exact",
		conditions: "partial",
		"dynamic-values": "unsupported",
		"runtime-conditions": "partial",
		"unit-conversion": "exact",
		serialization: "partial",
		"stable-identity": "exact",
		ssr: "unsupported",
	},
};

const toNumber = (part: string): number => {
	const value = parseCssLength(part);
	if (value === undefined) throw new Error(`pandwind/react-native: unsupported length "${part}"`);
	return value;
};

const convert = (prop: string, value: string): Record<string, unknown> => {
	if (UNSUPPORTED.has(prop))
		throw new Error(`pandwind/react-native: property "${prop}" has no React Native representation`);
	if (KEEP_STRING.has(prop)) return { [prop]: value };

	const parts = splitCssValue(value);
	const allLengths = parts.every((part) => CSS_LENGTH.test(part));
	if (parts.length === 1) return { [prop]: allLengths ? toNumber(parts[0]!) : value };
	if (!allLengths)
		throw new Error(
			`pandwind/react-native: property "${prop}" value "${value}" is not representable`,
		);

	const table = prop === "borderRadius" ? CORNER_EXPANSION : SIDE_EXPANSION;
	const property =
		prop === "borderWidth"
			? (suffix: string) => `border${suffix}Width`
			: prop === "borderRadius"
				? (suffix: string) => `border${suffix}Radius`
				: (suffix: string) => `${prop}${suffix}`;
	if (
		prop === "borderRadius" ||
		prop === "padding" ||
		prop === "margin" ||
		prop === "borderWidth"
	) {
		const expanded = expandShorthand(parts, table, toNumber, property);
		if (expanded !== undefined) return expanded;
	}
	throw new Error(
		`pandwind/react-native: property "${prop}" does not accept a shorthand list ("${value}")`,
	);
};

export interface RnBackendOptions extends Omit<
	ObjectBackendOptions,
	"name" | "capabilities" | "convert"
> {
	readonly name?: string;
}

export function createRnBackend(options: RnBackendOptions = {}): ObjectBackend {
	return createObjectBackend({
		...options,
		name: options.name ?? "react-native",
		capabilities: REACT_NATIVE_BACKEND_CAPABILITIES,
		convert,
	});
}

export const REACT_NATIVE_BACKEND: StyleBackendFactory<
	RnBackendOptions,
	Record<string, unknown>
> = {
	schema: STYLE_BACKEND_SCHEMA,
	id: BuiltinBackendId.ReactNative,
	capabilities: REACT_NATIVE_BACKEND_CAPABILITIES,
	create: createRnBackend,
};
