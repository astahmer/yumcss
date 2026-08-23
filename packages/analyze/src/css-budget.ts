/**
 * `pandwind analyze --css` — emitted-CSS budget reporting.
 *
 * Compiles the scanned tw() class surface through the REAL Tailwind engine
 * (same standard as the parity suites) and reports what the app's utility
 * usage actually costs: raw/gzip bytes of generated CSS, rule count,
 * per-prefix breakdown and dead candidates (classes that produce no rules).
 *
 * This is the CSS counterpart to the JS fold-coverage lane: fold coverage
 * says how much merge work disappeared; the budget says what the remaining
 * classes cost in shipped stylesheet bytes.
 */
import { gzipSync } from "node:zlib";
import { compile } from "@tailwindcss/node";
import { parse, type Root } from "postcss";
import { collectTwClasses } from "../../pandwind/src/tw/collect.ts";

/** One declared theme scope's extra cost (plans/015). */
export interface ThemeScopeDelta {
	scope: string;
	/** Bytes of the override block (author CSS shipped as-is). */
	bytes: number;
	/** Custom-property bindings in the block. */
	vars: number;
}

export interface CssBudget {
	/** Classes scanned from source that produced at least one rule. */
	liveCandidates: number;
	/** Scanned classes that produced no rules (unknown/dead utilities). */
	deadCandidates: number;
	/** Sample of dead candidates (bounded, for the report). */
	deadSample: Array<string>;
	/** Generated CSS bytes (minified by Tailwind). */
	cssBytes: number;
	/** Gzipped CSS bytes. */
	cssGzipBytes: number;
	/** Number of rules in the compiled sheet. */
	rules: number;
	/** Rules per top-level utility prefix (`bg`, `flex`, `md:hover:bg`…), top 15. */
	perPrefix: Array<{ prefix: string; rules: number }>;
	/** Per-theme-scope extra cost, when a theme bridge was supplied. */
	themeScopes: Array<ThemeScopeDelta>;
}

const unescape = (c: string): string => c.replace(/\\/g, "");

const prefixOf = (selector: string): string => {
	// Strip escape noise and pseudo tails: `.sm\:hover\:bg-red-500:hover` ->
	// "sm:hover:bg". Good enough for a budget breakdown.
	const cls = new RegExp("\\.([A-Za-z0-9_:[\\]/\\-.%]+)").exec(selector)?.[1] ?? selector;
	return cls.replace(/\\/g, "");
};

export async function cssBudget(options: {
	files: Array<string>;
	twEntry: string;
	themeCss?: string;
	base: string;
}): Promise<CssBudget> {
	const classes = await collectTwClasses(options.files, options.twEntry);
	const cssInput = `@import "tailwindcss";\n${options.themeCss ?? ""}\n`;
	const compiled = await compile(cssInput, { base: options.base, onDependency: () => {} });
	const built = compiled.build(classes);
	const root: Root = parse(built);

	const perPrefixMap = new Map<string, number>();
	let liveRules = 0;
	root.walkRules((rule) => {
		liveRules++;
		const key = prefixOf(rule.selector);
		perPrefixMap.set(key, (perPrefixMap.get(key) ?? 0) + 1);
	});

	// Dead-candidate detection: a candidate is alive when its unescaped
	// class name appears in some compiled selector.
	const selectorText = (() => {
		let text = "";
		root.walkRules((rule) => {
			text += `${rule.selector}\n`;
		});
		return text;
	})();
	const live = new Set<string>();
	for (const candidate of classes) {
		const plain = unescape(candidate);
		if (selectorText.includes(plain.split(":")[0] ?? plain)) live.add(candidate);
	}
	const dead = classes.filter((c) => !live.has(c));

	const themeScopes: Array<ThemeScopeDelta> = [];
	if (options.themeCss !== undefined) {
		const scopeRegex = /\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g;
		for (const match of options.themeCss.matchAll(scopeRegex)) {
			const body = match[2] ?? "";
			themeScopes.push({
				scope: match[1] ?? "?",
				bytes: Buffer.byteLength(match[0] ?? ""),
				vars: (body.match(/--[/\w-]+\s*:/g) ?? []).length,
			});
		}
		themeScopes.sort((a, b) => a.scope.localeCompare(b.scope));
	}

	const perPrefix = [...perPrefixMap.entries()]
		.map(([prefix, count]) => ({ prefix, rules: count }))
		.toSorted((a, b) => b.rules - a.rules)
		.slice(0, 15);

	return {
		liveCandidates: live.size,
		deadCandidates: dead.length,
		deadSample: dead.slice(0, 10),
		cssBytes: Buffer.byteLength(built),
		cssGzipBytes: gzipSync(Buffer.from(built)).byteLength,
		rules: liveRules,
		perPrefix,
		themeScopes,
	};
}

/** Human-readable budget report. */
export function formatCssBudget(budget: CssBudget): string {
	const lines: string[] = [];
	lines.push("pandwind analyze — css budget (real-Tailwind compilation)");
	lines.push("");
	lines.push(
		`generated css: ${(budget.cssBytes / 1024).toFixed(2)} KB min / ${(budget.cssGzipBytes / 1024).toFixed(2)} KB gzip`,
	);
	lines.push(
		`rules: ${budget.rules} · candidates live/dead: ${budget.liveCandidates}/${budget.deadCandidates}`,
	);
	if (budget.perPrefix.length > 0) {
		lines.push("top prefixes:");
		for (const { prefix, rules } of budget.perPrefix) {
			lines.push(`    ${prefix.padEnd(30)} ${rules}`);
		}
	}
	if (budget.themeScopes.length > 0) {
		const totalBytes = budget.themeScopes.reduce((acc, t) => acc + t.bytes, 0);
		lines.push(
			`theme scopes: ${budget.themeScopes.length} (+${(totalBytes / 1024).toFixed(2)} KB total)`,
		);
		for (const t of budget.themeScopes) {
			lines.push(`    ${t.scope.padEnd(20)} ${t.vars} vars · ${(t.bytes / 1024).toFixed(2)} KB`);
		}
	}
	if (budget.deadCandidates > 0) {
		lines.push(`dead sample: ${budget.deadSample.join(", ")}`);
	}
	return lines.join("\n");
}
