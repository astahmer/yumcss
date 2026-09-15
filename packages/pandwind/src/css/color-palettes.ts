import { pairs } from "../lib/utils.ts";
import type { CssConfigReturn, DefinePresetOptions, Token } from "../types/typings.ts";
import { hashCssVar } from "./hash.ts";

export interface ColorPaletteAssignment {
	readonly suffix: string;
	readonly cssVar: string;
	readonly value: string;
	readonly tokenPath: string;
}

export interface ColorPaletteMaps {
	readonly palettes: ReadonlyMap<string, readonly ColorPaletteAssignment[]>;
	readonly values: ReadonlyMap<string, string>;
}

const cssVarRef = (key: string): string => `var(--${key})`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const tokenCssVar = (token: Token): string | undefined =>
	"cssVar" in token ? token.cssVar : undefined;

export const buildColorPaletteMaps = (
	preset: CssConfigReturn<DefinePresetOptions>,
	flatTokens: ReadonlyMap<string, Token>,
	debug: boolean,
): ColorPaletteMaps => {
	const palettes = new Map<string, readonly ColorPaletteAssignment[]>();
	const values = new Map<string, string>();

	for (const [paletteName, source] of Object.entries(preset.colorPalettes ?? {})) {
		const assignments = new Map<string, ColorPaletteAssignment>();
		if (typeof source === "string") {
			const seenTokenPaths = new Set<string>();
			for (const token of flatTokens.values()) {
				if (seenTokenPaths.has(token.path)) continue;
				seenTokenPaths.add(token.path);
				const prefix = `${source}.`;
				const suffix =
					token.path === source
						? ""
						: token.path.startsWith(prefix)
							? token.path.slice(prefix.length)
							: undefined;
				if (suffix === undefined) continue;
				const tokenVar = tokenCssVar(token);
				if (tokenVar === undefined) continue;
				assignments.set(suffix, {
					suffix,
					cssVar: hashCssVar(pairs.join(["colors", "colorPalette", suffix]), debug),
					value: tokenVar,
					tokenPath: token.path,
				});
			}
		} else if (isRecord(source)) {
			for (const [suffix, tokenPath] of Object.entries(source)) {
				if (typeof tokenPath !== "string") continue;
				const token = flatTokens.get(tokenPath);
				const tokenVar = token === undefined ? undefined : tokenCssVar(token);
				if (token === undefined || tokenVar === undefined) continue;
				assignments.set(suffix, {
					suffix,
					cssVar: hashCssVar(pairs.join(["colors", "colorPalette", suffix]), debug),
					value: tokenVar,
					tokenPath: token.path,
				});
			}
		}

		const orderedAssignments = Array.from(assignments.values()).toSorted((a, b) =>
			a.suffix.localeCompare(b.suffix),
		);
		if (orderedAssignments.length === 0) continue;
		palettes.set(paletteName, orderedAssignments);
		for (const assignment of orderedAssignments) {
			const virtualName = assignment.suffix ? `colorPalette.${assignment.suffix}` : "colorPalette";
			values.set(virtualName, cssVarRef(assignment.cssVar));
		}
	}

	return { palettes, values };
};
