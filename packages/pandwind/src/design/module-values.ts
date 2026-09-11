import type { TokenLookup } from "./contracts.ts";

/** Convert numeric design-language lengths and token references to CSS values. */
export const toLength =
	(token: TokenLookup, group: string) =>
	(value: string | number): string => {
		if (typeof value === "number") return Number.isFinite(value) ? `${value}px` : "";
		if (typeof value !== "string" || value.length === 0) return "";
		const resolved = token(group, value);
		if (resolved !== value) return resolved;
		return /^\d+(\.\d+)?$/.test(value) ? `${value}px` : value;
	};
