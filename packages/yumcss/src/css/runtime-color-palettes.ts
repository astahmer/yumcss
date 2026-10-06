import { pairs } from "../lib/utils.ts";
import type { CssConfigReturn } from "../types/typings.ts";
import { hashCssVar } from "./hash.ts";
import type { RuntimeTokenMaps } from "./runtime-token-maps.ts";

interface RuntimeColorPaletteAssignment {
	readonly suffix: string;
	readonly cssVar: string;
	readonly value: string;
}

export interface RuntimeColorPaletteMaps {
	readonly palettes: ReadonlyMap<string, readonly RuntimeColorPaletteAssignment[]>;
	readonly values: ReadonlyMap<string, string>;
}

const cssVarRef = (key: string): string => `var(--${key})`;

export const buildRuntimeColorPaletteMaps = (
	preset: CssConfigReturn,
	tokenMaps: RuntimeTokenMaps,
	debug: boolean,
): RuntimeColorPaletteMaps => {
	const palettes = new Map<string, readonly RuntimeColorPaletteAssignment[]>();
	const values = new Map<string, string>();
	const colorTokens = Array.from(tokenMaps.flatTokens.entries()).filter(([path]) =>
		path.startsWith("colors."),
	);

	for (const [paletteName, source] of Object.entries(preset.colorPalettes ?? {})) {
		const assignments = new Map<string, RuntimeColorPaletteAssignment>();
		if (typeof source === "string") {
			const seenCssVars = new Set<string>();
			const prefix = `${source}.`;
			for (const [tokenPath, token] of colorTokens) {
				const tokenCssVar = token.cssVar;
				if (tokenCssVar === undefined) continue;
				const suffix =
					tokenPath === source
						? ""
						: tokenPath.startsWith(prefix)
							? tokenPath.slice(prefix.length)
							: undefined;
				if (suffix === undefined || seenCssVars.has(tokenCssVar)) continue;
				seenCssVars.add(tokenCssVar);
				assignments.set(suffix, {
					suffix,
					cssVar: hashCssVar(pairs.join(["colors", "colorPalette", suffix]), debug),
					value: tokenCssVar,
				});
			}
		} else if (source !== null && typeof source === "object" && !Array.isArray(source)) {
			for (const [suffix, tokenPath] of Object.entries(source)) {
				if (typeof tokenPath !== "string") continue;
				const token = tokenMaps.flatTokens.get(tokenPath);
				if (token?.cssVar === undefined) continue;
				assignments.set(suffix, {
					suffix,
					cssVar: hashCssVar(pairs.join(["colors", "colorPalette", suffix]), debug),
					value: token.cssVar,
				});
			}
		}

		const orderedAssignments = Array.from(assignments.values()).toSorted((left, right) =>
			left.suffix.localeCompare(right.suffix),
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
