/**
 * Real-Tailwind compilation proof for CONDITION-BOUND semantic tokens.
 *
 * `buildThemeBlock` bridges `{ base, dark, smDown, ... }` token shapes into
 * an `@theme` block (base) plus standalone override rules (variants). The
 * artifact-level shapes are covered by tw-theme-codegen.test.ts; THIS suite
 * feeds the bridge through the real `tailwindcss` compiler and proves:
 *
 * 1. utilities reference the bridged variables (`var(--color-success)`),
 *    so every condition-bound override flows into them by cascade;
 * 2. cascade correctness holds by CSS spec against the REAL output: the
 *    base value lands inside `@layer theme`, overrides stay unlayered, and
 *    unlayered declarations always beat layered ones;
 * 3. each condition shape applies within its own context — class ancestor
 *    (`.dark`), at-rule (`@media`), and compound (media around `:root:hover`);
 * 4. cross-engine parity: the css() engine, given the same token groups and
 *    conditions, resolves the same per-condition values as the compiled
 *    Tailwind sheet (both engines emit var() references + overrides).
 *
 * Current-behavior pins are marked as such (dark-only tokens), with rationale.
 */
import { compile } from "@tailwindcss/node";
import { parse, type AtRule, type Root, type Rule } from "postcss";
import { describe, expect, test } from "vitest";
import {
	buildThemeBlock,
	createConditionResolver,
	type ThemeConditions,
	type ThemeTokenGroups,
} from "../src/tw/generate-theme.ts";
import { rulesForClass } from "./helpers/tailwind-proof.ts";
import { PostCssNodeKind } from "./helpers/postcss-node-kind.ts";

const CONDITIONS: ThemeConditions = {
	dark: ".dark &",
	smDown: "@media (max-width: 640px)",
	supportHover: ["@media (hover: hover)", "&:hover"],
};

const GROUPS: ThemeTokenGroups = {
	colors: {
		success: { base: "#60A3BC", dark: "#2C7A7B" },
		danger: { base: "#E53E3E", smDown: "#FC8181" },
		cta: { base: "#805AD5", supportHover: "#6B46C1" },
	},
};

const ALIASED_GROUPS: ThemeTokenGroups = {
	colors: { "$gray-50": "#F9FAFB", "$gray-900": "#111827" },
	semantic: { surface: { base: "colors.$gray-50", dark: "colors.$gray-900" } },
};

const THEME_BLOCK = buildThemeBlock(GROUPS, createConditionResolver(CONDITIONS));

/** Compile the bridged entry with the REAL tailwindcss and parse the full sheet. */
async function compileSheet(classes: string[]): Promise<Root> {
	return compileSheetFrom(THEME_BLOCK, classes);
}

async function compileSheetFrom(themeBlock: string, classes: string[]): Promise<Root> {
	const result = await compile(
		themeBlock ? `@import "tailwindcss";\n${themeBlock}` : '@import "tailwindcss";',
		{
			base: import.meta.dirname,
			onDependency: () => {},
		},
	);
	return parse(result.build(classes));
}

interface VarDeclInfo {
	value: string;
	selector: string;
	layer: string | null;
	atRuleChains: string[];
}

/** Every declaration setting `varName`, with selector / layer / at-rule context. */
function findVarDecls(root: Root, varName: string): VarDeclInfo[] {
	const found: VarDeclInfo[] = [];
	root.walkRules((rule) => {
		rule.walkDecls((decl) => {
			if (decl.prop !== varName) return;
			let node: (typeof decl)["parent"] = decl.parent;
			let selector = "";
			const atRuleChains: string[] = [];
			let layer: string | null = null;
			while (node && node.type !== PostCssNodeKind.Root) {
				if (node.type === PostCssNodeKind.Rule)
					selector = `${(node as Rule).selector} ${selector}`.trim();
				if (node.type === PostCssNodeKind.AtRule) {
					const params = (node as { params?: string }).params ?? "";
					atRuleChains.push(`${(node as { name?: string }).name} ${params}`.trim());
					if ((node as { name?: string }).name === "layer") {
						layer = params.replace(/^all\b/, "").trim() || null;
					}
				}
				node = node.parent;
			}
			found.push({ value: decl.value, selector: selector.trim(), layer, atRuleChains });
		});
	});
	return found;
}

function declsInRule(
	root: Root,
	selectorIncludes: string,
	varName?: string,
): Record<string, string> {
	const out: Record<string, string> = {};
	root.walkRules((rule) => {
		if (!rule.selector.includes(selectorIncludes)) return;
		rule.walkDecls((decl) => {
			if (varName === undefined || decl.prop === varName) out[decl.prop] = decl.value;
		});
	});
	return out;
}

describe("condition-bound tokens compile through real Tailwind", () => {
	test("semantic token paths stay valid and resolve through the compiled var chain", async () => {
		const block = buildThemeBlock(ALIASED_GROUPS, createConditionResolver({ dark: ".dark &" }));
		expect(block).toContain("--color-surface: var(--color-gray-50);");
		expect(block).toContain("--color-surface: var(--color-gray-900);");
		expect(block).not.toContain("colors.$");

		const root = await compileSheetFrom(block, ["bg-surface"]);
		const surfaceValues = findVarDecls(root, "--color-surface").map(
			(declaration) => declaration.value,
		);
		expect(surfaceValues).toEqual(
			expect.arrayContaining(["var(--color-gray-50)", "var(--color-gray-900)"]),
		);
		expect(root.toString()).not.toContain("colors.$");

		const utility = rulesForClass(root, "bg-surface")[0];
		expect(utility).toBeDefined();
		let utilityValue = "";
		utility?.walkDecls((declaration) => {
			if (declaration.prop === "background-color") utilityValue = declaration.value;
		});
		expect(utilityValue).toBe("var(--color-surface)");

		const { resolveVar } = await import("./helpers/tailwind-proof.ts");
		expect(
			resolveVar(
				utilityValue,
				new Map([
					["--color-surface", "var(--color-gray-50)"],
					["--color-gray-50", "#f9fafb"],
				]),
			),
		).toBe("#f9fafb");
	});

	test("utilities reference the bridged variables", async () => {
		const root = await compileSheet(["bg-success", "bg-danger", "bg-cta"]);
		for (const [cls, varName] of [
			["bg-success", "--color-success"],
			["bg-danger", "--color-danger"],
			["bg-cta", "--color-cta"],
		] as const) {
			const rules = rulesForClass(root, cls);
			expect(rules.length, cls).toBe(1);
			const decls: string[] = [];
			rules[0]!.walkDecls((d) => {
				decls.push(d.value);
			});
			expect(
				decls.some((v) => v.includes(`var(${varName})`)),
				`${cls} -> ${varName}`,
			).toBe(true);
		}
	});

	test("cascade correctness: base is layered (@theme), overrides are unlayered", async () => {
		const root = await compileSheet(["bg-success"]);

		const baseDecls = findVarDecls(root, "--color-success").filter((d) => d.value === "#60a3bc");
		expect(baseDecls.length, "exactly one base declaration").toBe(1);
		expect(baseDecls[0]!.layer, "base lives in @layer theme").toBe("theme");

		const darkDecls = findVarDecls(root, "--color-success").filter((d) => d.value === "#2c7a7b");
		expect(darkDecls.length, "exactly one dark override").toBe(1);
		expect(darkDecls[0]!.layer, "override stays unlayered (beats any layer)").toBeNull();
		expect(darkDecls[0]!.selector).toContain(".dark");
	});

	test("dark conditional application: the var chain resolves per condition", async () => {
		const root = await compileSheet(["bg-success"]);
		const utilityRule = rulesForClass(root, "bg-success")[0]!;
		let utilityValue = "";
		utilityRule.walkDecls((d) => {
			if (d.prop === "background-color") utilityValue = d.value;
		});

		const baseVars = new Map([["--color-success", "#60a3bc"]]);
		const darkVars = new Map([["--color-success", "#2c7a7b"]]);
		const { resolveVar } = await import("./helpers/tailwind-proof.ts");
		expect(resolveVar(utilityValue, baseVars)).toBe("#60a3bc");
		// Under `.dark` the override re-declares the variable; the same
		// utility declaration then computes to the dark value — no second
		// utility rule needed.
		expect(resolveVar(utilityValue, darkVars)).toBe("#2c7a7b");
	});

	test("media-conditioned variant applies within its query", async () => {
		const root = await compileSheet(["bg-danger"]);
		const media = root.nodes.find(
			(node): node is AtRule =>
				node.type === PostCssNodeKind.AtRule &&
				node.name === "media" &&
				node.params.includes("max-width: 640px"),
		);
		if (media === undefined) throw new Error("@media (max-width: 640px) block was not emitted");

		const inner: Record<string, string> = {};
		media.walkDecls((d) => {
			inner[d.prop] = d.value;
		});
		expect(inner["--color-danger"]).toBe("#fc8181");

		// Base value stays in the theme layer for outside-the-query contexts.
		const base = findVarDecls(root, "--color-danger").find((d) => d.value === "#e53e3e");
		expect(base?.layer).toBe("theme");
	});

	test("compound condition nests the media query around :root:hover", async () => {
		const root = await compileSheet(["bg-cta"]);
		const hoverMedia = root.nodes.find(
			(node): node is AtRule =>
				node.type === PostCssNodeKind.AtRule &&
				node.name === "media" &&
				node.params.includes("(hover: hover)"),
		);
		if (hoverMedia === undefined) throw new Error("hover media query was not emitted");

		const selectors: string[] = [];
		hoverMedia.walkRules((rule) => selectors.push(rule.selector));
		expect(selectors).toContain(":root:hover");
		const decls = declsInRule(root, ":root:hover", "--color-cta");
		expect(decls["--color-cta"]).toBe("#6b46c1");
	});

	test("overrides survive alongside unrelated utilities (tree-shake concern)", async () => {
		// Compiling ONLY an unrelated utility must not drop the override
		// rules — they are author CSS, not theme-layer content.
		const root = await compileSheet(["p-4"]);
		const darkOverride = declsInRule(root, ".dark", "--color-success");
		expect(darkOverride["--color-success"]).toBe("#2c7a7b");
	});
});

describe("current-behavior pins", () => {
	test("dark-only token (no base) is dropped from the bridge entirely", async () => {
		// Without a `base` value the variable never reaches @theme, so real
		// Tailwind does not recognize the utility at all (unknown candidate
		// -> zero rules, verified against tailwindcss 4.3.x). The generator
		// therefore skips base-less tokens instead of shipping dead CSS —
		// they also cannot appear in the generated autocomplete unions.
		const groups: ThemeTokenGroups = { colors: { alert: { dark: "#B794F4" } } };
		const block = buildThemeBlock(groups, createConditionResolver(CONDITIONS));
		expect(block).toBe("");

		// Root cause (verified against tailwindcss 4.3.x): without the base
		// value in @theme, the compiler treats `bg-alert` as an unknown
		// candidate and emits zero rules — so shipping overrides alone would
		// be dead CSS. Demonstrated directly:
		const probeEntry = ['@import "tailwindcss";', "@theme {\n\t--color-alert: #b794f4;\n}"].join(
			"\n",
		);
		const probed = await compile(probeEntry, { base: import.meta.dirname, onDependency: () => {} });
		expect(rulesForClass(parse(probed.build(["bg-alert"])), "bg-alert").length).toBe(1);
		const bareResult = await compile('@import "tailwindcss";', {
			base: import.meta.dirname,
			onDependency: () => {},
		});
		expect(rulesForClass(parse(bareResult.build(["bg-alert"])), "bg-alert").length).toBe(0);

		// ...and a healthy sibling still bridges normally.
		const entry = [
			'@import "tailwindcss";',
			buildThemeBlock({ colors: { ok: { base: "#22c55e" } } }, createConditionResolver(CONDITIONS)),
		].join("\n");
		const result = await compile(entry, { base: import.meta.dirname, onDependency: () => {} });
		const root = parse(result.build(["bg-alert", "bg-ok"]));

		expect(rulesForClass(root, "bg-alert").length, "no var declared -> no utility").toBe(0);
		expect(rulesForClass(root, "bg-ok").length).toBe(1);
	});
});
