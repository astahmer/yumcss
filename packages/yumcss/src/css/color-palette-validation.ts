import type { CssConfigReturn } from "../types/typings.ts";

type PalettePreset = Pick<CssConfigReturn, "colorPalettes">;

const configuredPaletteNames = (preset: PalettePreset): string[] =>
	Object.keys(preset.colorPalettes ?? {});

const missingPaletteError = (): Error =>
	new Error(
		"yumcss: colorPalette requires a preset with colorPalettes. " +
			'Add colorPalettes to the preset or use createUnsafeCss from "yumcss/unsafe/css".',
	);

/** Fail when a preset-bound style has no palette catalog to resolve against. */
export const assertColorPaletteConfigured = (preset: PalettePreset): void => {
	if (configuredPaletteNames(preset).length === 0) throw missingPaletteError();
};

/** Validate one preset-bound color palette assignment before atom registration. */
export const validateColorPaletteValue = (preset: PalettePreset, value: unknown): void => {
	const names = configuredPaletteNames(preset);
	if (names.length === 0) throw missingPaletteError();
	if (typeof value !== "string" || !Object.hasOwn(preset.colorPalettes ?? {}, value)) {
		throw new Error(
			`yumcss: colorPalette '${String(value)}' is not declared in the preset. ` +
				`Available palettes: ${names.join(", ")}.`,
		);
	}
};

/** Fail when a declared palette cannot produce any token assignments. */
export const assertColorPaletteResolved = (
	preset: PalettePreset,
	value: string,
	resolved: boolean,
): void => {
	validateColorPaletteValue(preset, value);
	if (!resolved)
		throw new Error(
			`yumcss: colorPalette '${value}' has no resolvable token assignments in the preset. ` +
				"Check its color token references.",
		);
};
