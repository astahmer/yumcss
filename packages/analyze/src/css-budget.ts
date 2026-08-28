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
import { collectTwClasses } from "pandwind/tw/collect";
import { PostCssArtifactAnalyzer, type SheetShape } from "./css-artifact-analyzer.ts";

export type { SheetShape } from "./css-artifact-analyzer.ts";

import { CssBudgetEvaluator, type CssBudget } from "./css-budget-evaluator.ts";
export type { CssBudget } from "./css-budget-evaluator.ts";
export const cssBudget = (options: Parameters<CssBudgetEvaluator["measure"]>[0]): Promise<CssBudget> =>
	new CssBudgetEvaluator().measure(options);
import { CssBudgetReportRenderer } from "./css-budget-report.ts";
export const formatCssBudget = (budget: CssBudget): string => new CssBudgetReportRenderer().format(budget);
interface ClassRule {
	selector: string;
	declarations: string;
}

export interface ClassDrillDown {
	candidate: string;
	/** Rules whose selector references this candidate (escaped forms included). */
	rules: Array<ClassRule>;
}

const unescapeCandidate = (candidate: string): string => {
	// Compiled selectors escape special chars (`:` -> `\:`). Compare on the
	// base class (variant prefixes are part of the escaped selector too).
	const [base] = candidate.split(":");
	return base!.replace(/\\/g, "").replace(/[.*+?^${}()|[\]]/g, "\\$&");
};

/**
 * Per-class rule drill-down (unocss inspector steal): for every scanned
 * candidate, the rules the real compiler emitted for it. Matching is
 * selector-substring based on the unescaped base class — variant-scoped
 * rules (`:hover` tails, media wrappers) attach to their base class.
 */
export async function classRules(options: {
	files: Array<string>;
	twEntry: string;
	themeCss?: string;
	base: string;
}): Promise<Array<ClassDrillDown>> {
	const classes = await collectTwClasses(options.files, options.twEntry);
	const cssInput = `@import "tailwindcss";\n${options.themeCss ?? ""}\n`;
	const compiled = await compile(cssInput, { base: options.base, onDependency: () => {} });
	const built = compiled.build(classes);
	const root: Root = parse(built);

	const compiledRules: Array<{ selector: string; text: string; plain: string }> = [];
	root.walkRules((rule) => {
		compiledRules.push({
			selector: rule.selector,
			text: rule.toString(),
			plain: rule.selector.replace(/\\/g, ""),
		});
	});

	const out: Array<ClassDrillDown> = [];
	for (const candidate of classes) {
		const pattern = unescapeCandidate(candidate.split(":").pop() ?? candidate);
		if (pattern === "") continue;
		const rules: Array<ClassRule> = [];
		for (const rule of compiledRules) {
			if (rule.plain.includes(pattern)) {
				rules.push({ selector: rule.selector, declarations: rule.text });
			}
		}
		if (rules.length > 0) out.push({ candidate, rules });
	}
	return out.toSorted((a, b) => b.rules.length - a.rules.length);
}

/* ------------------------------------------------------------------ */
/* Stylesheet shape — CSS Overview-style distributions                 */
/* ------------------------------------------------------------------ */

/**
 * Compute the stylesheet SHAPE from a parsed compiled sheet: per-category
 * rule counts and byte weights, most frequent declaration values, and a
 * specificity histogram. CSS Overview-style, but data-only and reusable.
 */
export function sheetShapeFromRoot(root: Root): SheetShape {
	return new PostCssArtifactAnalyzer().shape(root);
}

/** Compile the scanned classes and return their stylesheet shape. */
export async function sheetShape(options: {
	files: Array<string>;
	twEntry: string;
	themeCss?: string;
	base: string;
}): Promise<SheetShape> {
	const classes = await collectTwClasses(options.files, options.twEntry);
	const cssInput = `@import "tailwindcss";\n${options.themeCss ?? ""}\n`;
	const compiled = await compile(cssInput, { base: options.base, onDependency: () => {} });
	return sheetShapeFromRoot(parse(compiled.build(classes)));
}
