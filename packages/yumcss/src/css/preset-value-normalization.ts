import type { CssConfigReturn } from "../types/typings.ts";
import { normalizeFirstThatWorks } from "./first-that-works.ts";
import { normalizeCssValue } from "./value-normalization.ts";

export const createPresetValueNormalizer = (
	preset: Pick<CssConfigReturn, "properties" | "tokens">,
) => {
	const normalizeScalar = (property: string, value: string | number): string => {
		if (typeof value === "number" && Number.isFinite(value)) {
			const properties: Record<string, unknown> = preset.properties;
			const binding = properties[property];
			if (typeof binding === "object" && binding !== null) {
				if (Object.hasOwn(binding, value)) return String(value);
				const group = "$tokens" in binding ? binding.$tokens : undefined;
				const tokens = typeof group === "string" ? preset.tokens?.[group] : undefined;
				if (tokens !== undefined && typeof tokens !== "function" && Object.hasOwn(tokens, value))
					return String(value);
			}
		}
		return normalizeCssValue(property, value);
	};
	return (property: string, value: string | number): string =>
		normalizeFirstThatWorks(property, value, normalizeScalar);
};
