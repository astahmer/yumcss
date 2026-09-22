import { compareKeyframeStepNames, normalizeKeyframeStepName } from "./keyframes.ts";
import { escapeIdentifier } from "./hash.ts";
import type {
	PresetWeb,
	PresetWebFontFace,
	PresetWebKeyframeBody,
	PresetWebStyleObject,
} from "../types/typings.ts";

interface PresetWebRenderOptions {
	readonly web: PresetWeb | undefined;
	readonly resolveDeclarations: (property: string, value: string | number) => string;
}

const isSafeDeclarationProperty = (property: string): boolean =>
	property.length > 0 &&
	!/[\s;{}]/u.test(property) &&
	!property.includes("\u0000") &&
	!property.includes("__");

const assertSafeCssText = (value: string, label: string): void => {
	if (value.includes("\u0000") || value.includes("{") || value.includes("}"))
		throw new Error(`pandwind: preset.web ${label} contains an unsafe CSS delimiter`);
};

const renderDeclarations = (
	style: PresetWebStyleObject,
	resolveDeclarations: PresetWebRenderOptions["resolveDeclarations"],
	label: string,
): string =>
	Object.entries(style)
		.toSorted(([left], [right]) => left.localeCompare(right))
		.flatMap(([property, value]) => {
			if (value === null || value === undefined) return [];
			if (!isSafeDeclarationProperty(property))
				throw new Error(`pandwind: preset.web ${label} has an invalid property '${property}'`);
			if (typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value)))
				throw new Error(`pandwind: preset.web ${label}.${property} must be a CSS scalar`);
			if (typeof value === "string") assertSafeCssText(value, `${label}.${property}`);
			return [resolveDeclarations(property, value)];
		})
		.join(";");

const renderGlobals = (
	globals: NonNullable<PresetWeb["globals"]>,
	resolveDeclarations: PresetWebRenderOptions["resolveDeclarations"],
): string[] =>
	Object.entries(globals)
		.toSorted(([left], [right]) => left.localeCompare(right))
		.flatMap(([selector, style]) => {
			const normalizedSelector = selector.trim();
			if (
				normalizedSelector.length === 0 ||
				normalizedSelector.startsWith("@") ||
				/[;{}]/u.test(normalizedSelector) ||
				normalizedSelector.includes("\u0000")
			)
				throw new Error(
					`pandwind: preset.web globals selector '${selector}' must be a flat CSS selector`,
				);
			const declarations = renderDeclarations(style, resolveDeclarations, `globals.${selector}`);
			return declarations.length === 0 ? [] : [`${normalizedSelector}{${declarations}}`];
		});

const RESERVED_KEYFRAME_NAMES = new Set([
	"default",
	"none",
	"initial",
	"inherit",
	"unset",
	"revert",
	"revert-layer",
]);

const isKeyframeName = (name: string): boolean =>
	name.length > 0 && escapeIdentifier(name) === name && !RESERVED_KEYFRAME_NAMES.has(name);

const renderKeyframe = (
	name: string,
	body: PresetWebKeyframeBody,
	resolveDeclarations: PresetWebRenderOptions["resolveDeclarations"],
): string => {
	if (!isKeyframeName(name))
		throw new Error(
			`pandwind: preset.web keyframe '${name}' must be a valid, non-reserved CSS identifier`,
		);
	const steps = Object.entries(body)
		.map(([step, declarations]) => ({
			name: normalizeKeyframeStepName(step),
			declarations,
		}))
		.toSorted((left, right) => compareKeyframeStepNames(left.name, right.name))
		.map(({ name: step, declarations }) => {
			if (!/^\d+(?:\.\d+)?%$/u.test(step))
				throw new Error(`pandwind: preset.web keyframe '${name}' has invalid step '${step}'`);
			const position = Number.parseFloat(step);
			if (position < 0 || position > 100)
				throw new Error(
					`pandwind: preset.web keyframe '${name}' step '${step}' must be between 0% and 100%`,
				);
			const css = renderDeclarations(
				declarations,
				resolveDeclarations,
				`keyframes.${name}.${step}`,
			);
			return `${step}{${css}}`;
		})
		.join("");
	return `@keyframes ${escapeIdentifier(name)}{${steps}}`;
};

const fontFaceDescriptors = (
	fontFace: PresetWebFontFace,
): Array<{
	readonly name: string;
	readonly value: string | number | undefined;
}> => [
	{ name: "font-family", value: fontFace.family },
	{
		name: "src",
		value: typeof fontFace.src === "string" ? fontFace.src : fontFace.src.join(","),
	},
	{ name: "font-style", value: fontFace.style },
	{ name: "font-weight", value: fontFace.weight },
	{ name: "font-stretch", value: fontFace.stretch },
	{ name: "font-display", value: fontFace.display },
	{ name: "unicode-range", value: fontFace.unicodeRange },
	{ name: "font-feature-settings", value: fontFace.featureSettings },
	{ name: "font-variation-settings", value: fontFace.variationSettings },
	{ name: "font-named-instance", value: fontFace.namedInstance },
	{ name: "size-adjust", value: fontFace.sizeAdjust },
	{ name: "ascent-override", value: fontFace.ascentOverride },
	{ name: "descent-override", value: fontFace.descentOverride },
	{ name: "line-gap-override", value: fontFace.lineGapOverride },
	{ name: "font-language-override", value: fontFace.languageOverride },
	{ name: "font-palette", value: fontFace.palette },
];

const renderFontFace = (label: string, fontFace: PresetWebFontFace): string => {
	if (fontFace.family.trim().length === 0)
		throw new Error(`pandwind: preset.web font face '${label}' requires a family`);
	const sources = Array.isArray(fontFace.src) ? fontFace.src : [fontFace.src];
	if (sources.length === 0 || sources.some((source) => source.trim().length === 0))
		throw new Error(`pandwind: preset.web font face '${label}' requires a source`);
	for (const [index, source] of sources.entries())
		assertSafeCssText(source, `fontFaces.${label}.src[${index}]`);
	const descriptors = fontFaceDescriptors(fontFace)
		.filter(({ value }) => value !== undefined)
		.map(({ name, value }) => {
			if (typeof value === "string") assertSafeCssText(value, `fontFaces.${label}.${name}`);
			if (typeof value === "number" && !Number.isFinite(value))
				throw new Error(`pandwind: preset.web font face '${label}' has a non-finite ${name}`);
			return `${name}:${String(value)}`;
		})
		.join(";");
	return `@font-face{${descriptors}}`;
};

export const renderPresetWeb = ({ web, resolveDeclarations }: PresetWebRenderOptions): string => {
	if (web === undefined) return "";
	const fontFaces = Object.entries(web.fontFaces ?? {})
		.toSorted(([left], [right]) => left.localeCompare(right))
		.map(([label, fontFace]) => renderFontFace(label, fontFace));
	const keyframes = Object.entries(web.keyframes ?? {})
		.toSorted(([left], [right]) => left.localeCompare(right))
		.map(([name, body]) => renderKeyframe(name, body, resolveDeclarations));
	const globals = renderGlobals(web.globals ?? {}, resolveDeclarations);
	return [...fontFaces, ...keyframes, ...globals].join("\n");
};
