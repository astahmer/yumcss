import { gzipSync } from "node:zlib";
import type { Root } from "postcss";
import type { CssBudget, CssBudgetMetrics } from "./css-budget-contracts.ts";

const unescape = (value: string): string => value.replace(/\\/g, "");

const prefixOf = (selector: string): string => {
	const cls = new RegExp("\\.([A-Za-z0-9_:[\\]\\/\\-.%]+)").exec(selector)?.[1] ?? selector;
	return cls.replace(/\\/g, "");
};

/** Pure artifact accounting policy. It receives compiled CSS, never source files. */
export class DefaultCssBudgetMetrics implements CssBudgetMetrics {
	measure(root: Root, candidates: readonly string[], themeCss?: string): CssBudget {
		const componentScopeRules = (themeCss?.match(/\.pwc-[a-z0-9-]+[^{]*{/g) ?? []).length;
		const perPrefixMap = new Map<string, number>();
		let liveRules = 0;
		let cssText = "";
		root.walkRules((rule) => {
			liveRules++;
			cssText += `${rule.selector}\n`;
			const key = prefixOf(rule.selector);
			perPrefixMap.set(key, (perPrefixMap.get(key) ?? 0) + 1);
		});

		const live = new Set<string>();
		for (const candidate of candidates) {
			const plain = unescape(candidate);
			if (cssText.includes(plain.split(":")[0] ?? plain)) live.add(candidate);
		}
		const dead = candidates.filter((candidate) => !live.has(candidate));
		const themeScopes: Array<{ scope: string; bytes: number; vars: number }> = [];
		if (themeCss !== undefined) {
			const scopeRegex = /\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g;
			for (const match of themeCss.matchAll(scopeRegex)) {
				const body = match[2] ?? "";
				themeScopes.push({
					scope: match[1] ?? "?",
					bytes: Buffer.byteLength(match[0] ?? ""),
					vars: (body.match(/--[/\w-]+\s*:/g) ?? []).length,
				});
			}
			themeScopes.sort((a, b) => a.scope.localeCompare(b.scope));
		}

		return {
			liveCandidates: live.size,
			deadCandidates: dead.length,
			deadSample: dead.slice(0, 10),
			cssBytes: Buffer.byteLength(root.toString()),
			cssGzipBytes: gzipSync(Buffer.from(root.toString())).byteLength,
			rules: liveRules,
			componentScopeRules,
			perPrefix: [...perPrefixMap.entries()]
				.map(([prefix, rules]) => ({ prefix, rules }))
				.toSorted((a, b) => b.rules - a.rules)
				.slice(0, 15),
			themeScopes,
		};
	}
}
