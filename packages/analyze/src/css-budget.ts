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
	/** Component scope-block rules (`.pwc-*`) present in the theme bridge. */
	componentScopeRules: number;
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
	const componentScopeRules = (options.themeCss?.match(/\.pwc-[a-z0-9-]+[^{]*{/g) ?? []).length;
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
		componentScopeRules,
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
	if (budget.componentScopeRules > 0) {
		lines.push(`component scopes (.pwc-*): ${budget.componentScopeRules} rule(s)`);
	}
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

export interface ClassRule {
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

export interface ShapeCategory {
	category: string;
	rules: number;
	/** Approximate byte weight of the rules in this category. */
	bytes: number;
	/** Most frequent declaration values within the category. */
	topValues: Array<{ value: string; count: number }>;
}

export interface SpecificityBucket {
	label: string;
	rules: number;
}

export interface SheetShape {
	totalRules: number;
	totalBytes: number;
	categories: Array<ShapeCategory>;
	specificity: Array<SpecificityBucket>;
}

const PROPERTY_CATEGORY: Record<string, string> = {
	color: "colors",
	"background-color": "colors",
	fill: "colors",
	stroke: "colors",
	"caret-color": "colors",
	"border-color": "borders",
	margin: "spacing",
	"margin-top": "spacing",
	"margin-right": "spacing",
	"margin-bottom": "spacing",
	"margin-left": "spacing",
	padding: "spacing",
	"padding-top": "spacing",
	"padding-right": "spacing",
	"padding-bottom": "spacing",
	"padding-left": "spacing",
	gap: "spacing",
	"row-gap": "spacing",
	"column-gap": "spacing",
	"font-family": "typography",
	"font-size": "typography",
	"font-weight": "typography",
	"font-style": "typography",
	"line-height": "typography",
	"letter-spacing": "typography",
	"text-align": "typography",
	"text-transform": "typography",
	display: "layout",
	position: "layout",
	flex: "layout",
	"flex-direction": "layout",
	"flex-wrap": "layout",
	"align-items": "layout",
	"justify-content": "layout",
	grid: "layout",
	"grid-template-columns": "layout",
	width: "layout",
	height: "layout",
	"min-width": "layout",
	"min-height": "layout",
	"max-width": "layout",
	"max-height": "layout",
	top: "layout",
	right: "layout",
	bottom: "layout",
	left: "layout",
	inset: "layout",
	"z-index": "layout",
	overflow: "layout",
	"box-shadow": "effects",
	opacity: "effects",
	filter: "effects",
	"backdrop-filter": "effects",
	transform: "effects",
	transition: "effects",
	animation: "effects",
};

const categoryOf = (prop: string): string => {
	if (PROPERTY_CATEGORY[prop] !== undefined) return PROPERTY_CATEGORY[prop]!;
	const prefixes: Array<[RegExp, string]> = [
		[/^border-(top|right|bottom|left)-(color|width|style)$/, "borders"],
		[/^border-.+-radius$/, "borders"],
		[/^border/, "borders"],
		[/^outline-?(color|width|style|offset)?$/, "borders"],
		[/^(text-decoration|text-emphasis)/, "typography"],
		[/^(margin|padding)-?(block|inline)?/, "spacing"],
		[/^(grid|place|align|justify)/, "layout"],
	];
	for (const [pattern, cat] of prefixes) {
		if (pattern.test(prop)) return cat;
	}
	return "other";
};

/**
 * Compute the stylesheet SHAPE from a parsed compiled sheet: per-category
 * rule counts and byte weights, most frequent declaration values, and a
 * specificity histogram. CSS Overview-style, but data-only and reusable.
 */
export function sheetShapeFromRoot(root: Root): SheetShape {
	type Cat = { rules: number; bytes: number; values: Map<string, number> };
	const cats = new Map<string, Cat>();
	const spec = new Map<string, number>();
	let totalRules = 0;
	let totalBytes = 0;

	root.walkRules((rule) => {
		totalRules++;
		totalBytes += rule.toString().length;

		// specificity triple via token counting on the selector
		const s = rule.selector;
		const ids = (s.match(/#[\w-]+/g) ?? []).length;
		const classesAttrs =
			(s.match(/\.[\w-]+/g) ?? []).length + (s.match(/\[[^\]]+\]/g) ?? []).length;
		const pseudos = (s.match(/:[a-zA-Z-]+/g) ?? []).length;
		const label = `${ids}-${classesAttrs}-${pseudos}`;
		spec.set(label, (spec.get(label) ?? 0) + 1);

		const declProps = new Set<string>();
		rule.walkDecls((decl) => {
			const prop = decl.prop.toLowerCase();
			const cat = categoryOf(prop);
			let bucket = cats.get(cat);
			if (bucket === undefined) {
				bucket = { rules: 0, bytes: 0, values: new Map<string, number>() };
				cats.set(cat, bucket);
			}
			declProps.add(cat);
			bucket.values.set(decl.value, (bucket.values.get(decl.value) ?? 0) + 1);
		});
		for (const cat of declProps) {
			const bucket = cats.get(cat)!;
			bucket.rules++;
			bucket.bytes += rule.toString().length;
		}
	});

	const categories: Array<ShapeCategory> = [...cats.entries()]
		.map(([category, c]) => ({
			category,
			rules: c.rules,
			bytes: c.bytes,
			topValues: [...c.values.entries()]
				.toSorted((a, b) => b[1] - a[1])
				.slice(0, 4)
				.map(([value, count]) => ({ value, count })),
		}))
		.toSorted((a, b) => b.bytes - a.bytes);

	const specificity: Array<SpecificityBucket> = [...spec.entries()]
		.map(([label, rules]) => ({ label, rules }))
		.toSorted((a, b) => b.rules - a.rules)
		.slice(0, 8);

	return { totalRules, totalBytes, categories, specificity };
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
