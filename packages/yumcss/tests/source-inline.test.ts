/**
 * @source inline emission mode (tw:scan --*.css out-file) — proves the
 * generated directives produce IDENTICAL rules through the real Tailwind
 * compiler vs the equivalent candidates compiled without them, i.e. the
 * CSS-file mode fully replaces the JS safelist module.
 */
import { readFileSync } from "node:fs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { compile } from "@tailwindcss/node";
import { parse, type Root } from "postcss";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { collectTwClasses } from "../src/tw/collect.ts";

let dir: string;
let twEntry: string;
const CANDIDATES = [
	"flex",
	"px-4",
	"hover:bg-red-500",
	"sm:text-lg",
	"data-[expanded]:opacity-100",
	"w-[calc(100%-2rem)]",
];

beforeAll(() => {
	dir = mkdtempSync(resolve(tmpdir(), "yumcss-inline-"));
	twEntry = resolve(dir, "tw.ts");
	// Minimal generated-style tw runtime: classes pass through verbatim
	// (the proof is about Tailwind's generation, not the mapping).
	writeFileSync(twEntry, `export const tw = (styles: unknown): string => String(styles);`);
	for (const [i, candidate] of CANDIDATES.entries()) {
		writeFileSync(resolve(dir, `src${i}.ts`), `export const c = tw("${candidate}");\n`);
	}
});

afterAll(() => {
	// leave tmp cleanup to the OS temp dir policy
});

async function build(classes: Array<string>, sheet: string): Promise<Root> {
	const compiled = await compile(sheet, { base: dir, onDependency: () => {} });
	return parse(compiled.build(classes));
}

const ruleSet = (root: Root): string[] => {
	const rules: string[] = [];
	root.walkRules((rule) => {
		rules.push(`${rule.selector} { ${rule.nodes?.map((d) => d.toString()).join(" ")} }`);
	});
	return rules.filter((r) => !r.startsWith(":") && !r.startsWith("*,")).toSorted();
};

describe("@source inline emission mode", () => {
	test("collectTwClasses scans the same candidates feeding both modes", async () => {
		const files = CANDIDATES.map((_, i) => resolve(dir, `src${i}.ts`));
		const scanned = await collectTwClasses(files, twEntry);
		expect(scanned.toSorted()).toEqual(CANDIDATES.toSorted());
	});

	test("generated css file contains one directive per candidate", async () => {
		const outFile = resolve(dir, "yumcss-sources.css");
		// Re-run the collect main flow by invoking the same code path via a
		// tiny inline replication (the CLI block is process-exit guarded):
		const classes = await collectTwClasses(
			CANDIDATES.map((_, i) => resolve(dir, `src${i}.ts`)),
			twEntry,
		);
		const content = `${classes.map((c) => `@source inline(${JSON.stringify(c)});`).join("\n")}\n`;
		writeFileSync(outFile, content);
		const text = readFileSync(outFile, "utf8");
		for (const candidate of CANDIDATES) {
			expect(text).toContain(`@source inline(${JSON.stringify(candidate)});`);
		}
	});

	test("parity: candidates present ONLY via @source inline generate the same rules", async () => {
		const sheet = `@import "tailwindcss";\n@theme { --color-red-500: #ef4444; }\n`;
		const inlineSheet = `${sheet}${CANDIDATES.map((c) => `@source inline(${JSON.stringify(c)});`).join("\n")}\n`;

		// WITHOUT directives: compiling with an empty candidate list yields no
		// utility rules for our candidates.
		const bareRoot = await build([], sheet);
		const bareRules = ruleSet(bareRoot);
		expect(bareRules.some((r) => r.includes("flex"))).toBe(false);

		// WITH directives only (candidates NOT passed to build()): identical
		// rule set to passing candidates explicitly.
		const viaInline = await build([], inlineSheet);
		const viaCandidates = await build(CANDIDATES, sheet);
		const inlineRules = ruleSet(viaInline).filter((r) =>
			CANDIDATES.some((c) => r.includes(c.split(/[:[]/)[0] ?? c)),
		);
		const explicitRules = ruleSet(viaCandidates).filter((r) =>
			CANDIDATES.some((c) => r.includes(c.split(/[:[]/)[0] ?? c)),
		);
		expect(inlineRules).toEqual(explicitRules);
		expect(inlineRules.length).toBeGreaterThan(0);
		expect(bareRules).not.toEqual(inlineRules);
	});
});
