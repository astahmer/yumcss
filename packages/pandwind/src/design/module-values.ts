import type { TokenLookup } from "./contracts.ts";

/** Convert numeric design-language lengths and token references to CSS values. */
export const toLength =
	(token: TokenLookup, group: string) =>
	(value: string | number): string => {
		if (typeof value === "number") return `${value}px`;
		const resolved = token(group, value);
		if (resolved !== value) return resolved;
		return /^\d+(\.\d+)?$/.test(value) ? `${value}px` : value;
	};
