/**
 * 8bitcn port 1:1 CSS parity check (plans/013).
 *
 * BEFORE = pristine literal tokens extracted AST-wise from className JSX
 * attributes and cn()/clsx()/twMerge()/cva() arguments of the ORIGINAL tree
 * (/tmp/8bit-orig). AFTER = tw({...}) calls of the migrated tree
 * re-evaluated through the generated runtime + every static string that
 * survived migration. Both candidate sets compile through REAL Tailwind
 * with 8bit's own theme; rule sets and byte sizes are diffed.
 *
 * Usage: ./node_modules/.bin/tsx css-parity-8bit.mts   (paths below)
 */
import { globSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { parse, type Root } from "postcss";
import { parseSync } from "oxc-parser";
import { compile } from "@tailwindcss/node";

const THEME = "/tmp/8bit-meta/tailwind.css";
const TW_ENTRY = "/tmp/8bit-meta/tw.ts";
const ORIG = "/tmp/8bit-orig/components";
const MIG = "/tmp/pandwind-8bit-dogfood/components";

/** Static class strings: className JSX attrs + cn()/clsx()/twMerge()/cva() args. */
function staticClassStrings(files: string[]): Set<string> {
	const out = new Set<string>();
	const HELPERS = new Set(["cn", "clsx", "twMerge", "cva"]);
	for (const file of files) {
		const source = readFileSync(file, "utf8");
		const parsed: any = parseSync(file, source, {
			sourceType: "module",
			lang: file.endsWith(".tsx") ? "tsx" : "ts",
		});
		const push = (v: unknown): void => {
			if (typeof v === "string") for (const t of (v as string).split(/\s+/)) if (t) out.add(t);
		};
		const visit = (node: any, inClass: boolean): void => {
			if (!node || typeof node !== "object" || typeof node.type !== "string") return;
			if (node.type === "JSXAttribute" && node.name?.name === "className") {
				visit(node.value, true);
				return;
			}
			if (
				node.type === "CallExpression" &&
				node.callee?.type === "Identifier" &&
				HELPERS.has(node.callee.name)
			) {
				for (const arg of node.arguments ?? []) visit(arg, true);
				return;
			}
			if (node.type === "Literal" && typeof node.value === "string" && inClass) push(node.value);
			if (node.type === "TemplateLiteral" && inClass) {
				for (const q of node.quasis ?? []) push(q.value?.cooked ?? q.value?.raw);
				for (const e of node.expressions ?? []) visit(e, true);
				return;
			}
			for (const key of Object.keys(node)) {
				if (key === "parent" || key === "start" || key === "end") continue;
				const v = (node as any)[key];
				if (Array.isArray(v)) v.forEach((c) => visit(c, inClass));
				else if (v && typeof v === "object" && typeof v.type === "string") visit(v, inClass);
			}
		};
		visit(parsed.program, false);
	}
	return out;
}

async function compileCandidates(classes: string[]): Promise<{ root: Root; css: string }> {
	const compiled = await compile(readFileSync(THEME, "utf8"), {
		base: "/tmp/8bit-meta",
		onDependency: () => {},
	});
	const built = compiled.build(classes);
	return { root: parse(built), css: built };
}

function ruleSet(root: Root): Map<string, string> {
	const map = new Map<string, string>();
	root.walkRules((rule) => {
		const decls = rule.nodes
			?.filter((n): n is any => n.type === "decl")
			.map((d: any) => `${d.prop}:${d.value}`)
			.toSorted()
			.join(";");
		const sel = rule.selector.replace(/\\/g, "");
		map.set(`${sel}{${decls}}`, rule.selector);
	});
	return map;
}

const origFiles = (globSync(`${ORIG}/**/*.tsx`) as string[]).toSorted();
const migFiles = (globSync(`${MIG}/**/*.tsx`) as string[]).toSorted();

console.log("collecting candidates…");
const T_orig = [...staticClassStrings(origFiles)];
// migrated side: evaluated tw() calls + every static string that survived
const { collectTwClasses } = await import("../pandwind/src/tw/collect.ts");
const T_tw = await collectTwClasses(migFiles, TW_ENTRY);
const T_verbatim = staticClassStrings(migFiles);
const T_after = [...new Set([...T_tw, ...T_verbatim])];
const afterSet = new Set(T_after);

const absentTokens = T_orig.filter((t) => !afterSet.has(t));
const migText = migFiles.map((f) => readFileSync(f, "utf8")).join("\n");
const silentDrops = absentTokens.filter((t) => !migText.includes(t));

console.log(`candidates: orig ${T_orig.length} · after ${T_after.length} (tw-eval ${T_tw.length})`);
console.log(
	`baseline tokens absent from after-set: ${absentTokens.length} (silent drops: ${silentDrops.length})`,
);

console.log("compiling both sides through real Tailwind…");
const A = await compileCandidates(T_orig);
const B = await compileCandidates(T_after);
const ra = ruleSet(A.root);
const rb = ruleSet(B.root);
const missing = [...ra.keys()].filter((k) => !rb.has(k));
const extra = [...rb.keys()].filter((k) => !ra.has(k));

console.log("\n=== RESULT ===");
console.log(`before css: ${A.css.length} B (${gzipSync(Buffer.from(A.css)).byteLength} gz)`);
console.log(`after css:  ${B.css.length} B (${gzipSync(Buffer.from(B.css)).byteLength} gz)`);
console.log(
	`byte delta: ${B.css.length - A.css.length} (${(((B.css.length - A.css.length) / A.css.length) * 100).toFixed(2)}%)`,
);
console.log(
	`rules: before ${ra.size} · after ${rb.size} · missing ${missing.length} · extra ${extra.length}`,
);
writeFileSync(
	new URL("./css-parity-8bit-result.json", import.meta.url),
	JSON.stringify(
		{
			baselineBytes: A.css.length,
			afterBytes: B.css.length,
			rulesBaseline: ra.size,
			rulesAfter: rb.size,
			missingRules: missing,
			extraRules: extra,
			tokensOrig: T_orig.length,
			tokensAbsent: absentTokens.length,
			silentDrops,
		},
		null,
		2,
	),
);
console.log("wrote css-parity-8bit-result.json");
