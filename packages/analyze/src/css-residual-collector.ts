import type { TwConfig } from "pandwind/vite/inline";

export interface MissingCssSite {
	readonly line: number;
	readonly token: string;
}

export interface ArbitraryValueSite {
	readonly line: number;
	readonly token: string;
}

export interface CssResidualCollector {
	missingCss(
		values: readonly unknown[],
		lineStarts: readonly number[],
		start: number,
		config: TwConfig,
		ignore?: ReadonlySet<string>,
	): readonly MissingCssSite[];
	arbitraryValues(
		values: readonly unknown[],
		lineStarts: readonly number[],
		start: number,
		ignore?: ReadonlySet<string>,
	): readonly ArbitraryValueSite[];
}

const topLevelColon = (token: string): number => {
	let depth = 0;
	for (let i = 0; i < token.length; i++) {
		const char = token[i];
		if (char === "[") depth++;
		else if (char === "]") depth--;
		else if (char === ":" && depth === 0) return i;
	}
	return -1;
};

const tokenHasCss = (token: string, config: TwConfig): boolean => {
	let rest = token;
	for (;;) {
		const colon = topLevelColon(rest);
		if (colon === -1) break;
		const prefix = rest.slice(0, colon);
		if (config.variants?.[prefix] === undefined) return false;
		rest = rest.slice(colon + 1);
	}
	if (rest.includes("[")) return true;
	if (config.conflicts === undefined) return true;
	const conflicts = config.conflicts as Record<string, Record<string, string[]>>;
	const whole = conflicts[rest];
	if (whole !== undefined) return Object.keys(whole).length > 0;
	let i = rest.length;
	for (;;) {
		i = rest.lastIndexOf("-", i - 1);
		if (i <= 0) return false;
		const byValue = conflicts[rest.slice(0, i)];
		if (byValue === undefined) continue;
		const value = rest.slice(i + 1);
		if (byValue[value] !== undefined || byValue["*"] !== undefined) return true;
		const slash = value.lastIndexOf("/");
		if (slash > 0 && slash < value.length - 1 && byValue[value.slice(0, slash)] !== undefined)
			return true;
	}
};

const tokenIsArbitrary = (token: string): boolean => {
	let rest = token;
	for (;;) {
		const colon = topLevelColon(rest);
		if (colon === -1) break;
		rest = rest.slice(colon + 1);
	}
	return rest.includes("[");
};

const lineOf = (lineStarts: readonly number[], offset: number): number => {
	let lo = 0;
	let hi = lineStarts.length - 1;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if ((lineStarts[mid] ?? 0) <= offset) lo = mid;
		else hi = mid - 1;
	}
	return lo + 1;
};

const tokensFrom = (values: readonly unknown[]): readonly string[] =>
	values.flatMap((value) =>
		typeof value === "string" && value !== "" ? value.split(/\s+/).filter(Boolean) : [],
	);

export class DefaultCssResidualCollector implements CssResidualCollector {
	missingCss(
		values: readonly unknown[],
		lineStarts: readonly number[],
		start: number,
		config: TwConfig,
		ignore?: ReadonlySet<string>,
	): readonly MissingCssSite[] {
		const sites = new Map<string, MissingCssSite>();
		for (const token of tokensFrom(values)) {
			if (ignore?.has(token) || tokenHasCss(token, config)) continue;
			sites.set(token, { line: lineOf(lineStarts, start), token });
		}
		return [...sites.values()];
	}

	arbitraryValues(
		values: readonly unknown[],
		lineStarts: readonly number[],
		start: number,
		ignore?: ReadonlySet<string>,
	): readonly ArbitraryValueSite[] {
		const sites = new Map<string, ArbitraryValueSite>();
		for (const token of tokensFrom(values)) {
			if (ignore?.has(token) || !tokenIsArbitrary(token)) continue;
			sites.set(token, { line: lineOf(lineStarts, start), token });
		}
		return [...sites.values()];
	}
}
