import type { TokenLookup } from "./contracts.ts";

/** Convert numeric design-language lengths and token references to CSS values. */
export const toLength =
	(token: TokenLookup, group: string) =>
	(value: string | number): string => {
		if (value === "" || (typeof value === "number" && !Number.isFinite(value))) return "";
		const resolved = token(group, value);
		if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(resolved) && Number(resolved) !== 0) {
			throw new Error(
				`yumcss: '${group}: ${value}' requires an explicit CSS unit or a preset token.`,
			);
		}
		return resolved;
	};
