/**
 * 1:1 CSS parity check for the kumo port (plans/013 "Port result").
 *
 * BEFORE: every string-literal token from the original sources, compiled
 * through real Tailwind with kumo's own theme.
 * AFTER: tw({...}) calls re-evaluated through the real pandwind runtime
 * (createTw with the kumo-generated config) + remaining verbatim literals,
 * compiled the same way.
 *
 * Verdict = diff of RULE SETS (selector + sorted declarations), immune to
 * candidate-extraction noise because unknown tokens emit no rules.
 */
import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { compile } from "@tailwindcss/node";
import { parse } from "postcss";
import { parseSync } from "oxc-parser";
import { evalLiteral } from "../pandwind/src/tw/literal.ts";
import { createTw } from "../pandwind/src/tw/runtime.ts";
import { extractTwConfig } from "../pandwind/src/vite/inline.ts";

const KUMO = "/tmp/pandwind-kumo-dogfood/packages/kumo/src";
const BEFORE = "/tmp/kumo-src-before";
const META = "/tmp/kumo-meta";

const meta = extractTwConfig(readFileSync(resolve(META, "tw.ts"), "utf8"))!;
const twFn = createTw({
	variants: meta.variants,
	conflicts: meta.conflicts,
	compose: meta.compose,
} as never);

	const TOKEN = /^[a-zA-Z@][a-zA-Z0-9_:/[\].\-%#()=!]*$/;
const literalTokens = (src: string): Set<string> => {
	const out = new Set<string>();
	for (const m of src.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g)) {
		for (const tok of (m[1] ?? m[2] ?? "").split(/\s+/)) {
			if (tok.length > 1 && TOKEN.test(tok)) out.add(tok);
		}
	}
	return out;
};

/** Generic recursive AST walk — literal.ts's walk skips JSX containers. */
const twCallClasses = (src: string, file: string): Set<string> => {
	const out = new Set<string>();
	const parsed = parseSync(file, src, {
		sourceType: "module",
		lang: file.endsWith(".tsx") ? "tsx" : "ts",
	});
	const visit = (node: unknown): void => {
		if (!node || typeof node !== "object") return;
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		const rec = node as Record<string, unknown>;
		if (typeof rec.type !== "string") return;
		if (rec.type === "CallExpression") {
			const call = rec as unknown as {
				callee?: { type?: string; name?: string };
				arguments?: Array<unknown>;
			};
			if (call.callee?.type === "Identifier" && call.callee.name === "tw") {
				try {
					const styles = evalLiteral(call.arguments?.[0] as never);
					if (styles !== undefined) {
						for (const cls of twFn(styles as never).split(" ")) if (cls) out.add(cls);
					}
				} catch {
					// non-literal argument
				}
			}
		}
		for (const key of Object.keys(rec)) {
			if (key === "type" || key === "start" || key === "end") continue;
			const value = rec[key];
			if (value && typeof value === "object") visit(value);
		}
	};
	visit(parsed.program as unknown);
	return out;
};

const collect = (): { before: Set<string>; after: Set<string> } => {
	const before = new Set<string>();
	const after = new Set<string>();
	const files = globSync(`${KUMO}/**/*.tsx`) as string[];
	for (const abs of files) {
		const rel = abs.slice(KUMO.length + 1);
		const origPath = resolve(BEFORE, rel);
		let orig: string | undefined;
		try {
			orig = readFileSync(origPath, "utf8");
		} catch {
			orig = undefined; // new file — no before state
		}
		const now = readFileSync(abs, "utf8");
		if (orig !== undefined) for (const t of literalTokens(orig)) before.add(t);
		for (const t of literalTokens(now)) after.add(t);
		if (orig !== now) for (const t of twCallClasses(now, abs)) after.add(t);
	}
	return { before, after };
};

async function compileSheet(classes: Array<string>): Promise<{ set: Set<string>; built: string }> {
	const sheet = `@import "tailwindcss";\n${readFileSync("/tmp/kumo-meta/theme.css", "utf8")}\n`;
	const compiled = await compile(sheet, {
		base: "/Users/astahmer/dev/pandwind/apps/example", // resolves the tailwindcss import
		onDependency: () => {},
	});
	const built = compiled.build(classes);
	const root: ReturnType<typeof parse> = parse(built);
	const set = new Set<string>();
	root.walkRules((rule) => {
		const decls: string[] = [];
		rule.walkDecls((decl) => decls.push(`${decl.prop}:${decl.value}`));
		rule.walkDecls((decl) => void decl);
		if (decls.length > 0) set.add(`${rule.selector} { ${decls.toSorted().join("; ")} }`);
	});
	return { set, built };
}

const { before, after } = collect();
(await import("node:fs")).writeFileSync("/tmp/before-candidates.txt", [...before].join("\n"));
(await import("node:fs")).writeFileSync("/tmp/after-candidates.txt", [...after].join("\n"));
const b = await compileSheet([...before]);
const a = await compileSheet([...after]);

const missing = [...b.set].filter((r) => !a.set.has(r));
const extra = [...a.set].filter((r) => !b.set.has(r));
const identical = b.set.size - missing.length;

console.log("=== candidates:", before.size, "->", after.size);
console.log("=== rules before/after:", b.set.size, "/", a.set.size);
console.log("=== identical rules:", identical);
console.log("=== MISSING (before-only):", missing.length);
for (const r of missing.slice(0, 15)) console.log("  -", r.slice(0, 160));
console.log("=== EXTRA (after-only):", extra.length);
for (const r of extra.slice(0, 15)) console.log("  +", r.slice(0, 160));
console.log(
	"=== bytes: before",
	b.built.length,
	"(gz",
	gzipSync(Buffer.from(b.built)).byteLength,
	") after",
	a.built.length,
	"(gz",
	gzipSync(Buffer.from(a.built)).byteLength,
	") delta",
	a.built.length - b.built.length,
);
