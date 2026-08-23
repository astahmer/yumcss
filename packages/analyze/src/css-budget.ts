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
}

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
	const unescape = (c: string): string => c.replace(/\\/g, "");
	const live = new Set<string>();
	for (const candidate of classes) {
		const plain = unescape(candidate);
		if (selectorText.includes(plain.split(":")[0] ?? plain)) live.add(candidate);
	}
	const dead = classes.filter((c) => !live.has(c));

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
	if (budget.deadCandidates > 0) {
		lines.push(`dead sample: ${budget.deadSample.join(", ")}`);
	}
	return lines.join("\n");
}
