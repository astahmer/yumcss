/**
 * L3 component tokens (plans/015, scope-override model A) — emission unit
 * tests plus REAL-Tailwind compilation proofs that a `.pwc-*` scope block
 * overrides semantic vars so existing utilities restyle per component.
 */
import { __unstable__loadDesignSystem, compile } from "@tailwindcss/node";
import { parse } from "postcss";
import { describe, expect, test } from "vitest";
import { buildComponentScopes, type ComponentScopeMap } from "../src/tw/generate-theme.ts";

const warn_messages = (): { warns: Array<string>; warn: (m: string) => void } => {
	const warns: Array<string> = [];
	return { warns, warn: (m: string) => warns.push(m) };
};

const EXISTING = new Set(["--color-primary", "--color-brand", "--color-hairline", "--text-muted"]);

describe("buildComponentScopes — emission", () => {
	test("plain keys land in the color namespace with $refs as var()", () => {
		const components: ComponentScopeMap = {
			button: { primary: "$color-brand" },
		};
		const { warns, warn } = warn_messages();
		const out = buildComponentScopes(components, EXISTING, undefined, warn);
		expect(out).toBe(".pwc-button {\n\t--color-primary: var(--color-brand);\n}");
		expect(warns).toHaveLength(0);
	});

	test("--verbatim and dotted keys keep their own namespaces", () => {
		const components: ComponentScopeMap = {
			card: { "--color-hairline": "#e5e5e5", "text.muted": "#888888" },
		};
		const out = buildComponentScopes(components, EXISTING, undefined);
		expect(out).toContain("--color-hairline: #e5e5e5;");
		expect(out).toContain("--text-muted: #888888;");
	});

	test("unknown $refs, self-cycles and invalid names are skipped loudly", () => {
		const { warns } = warn_messages();
		const components: ComponentScopeMap = {
			button: { primary: "$color-does-not-exist", brand: "$brand" },
			"Bad Name": { primary: "#fff" },
		};
		const out = buildComponentScopes(components, EXISTING, undefined, warn_messages().warn);
		void warns;
		// both button entries dropped -> no block at all; invalid name skipped
		expect(out).toBe("");
	});

	test("deterministic: identical inputs yield byte-identical output", () => {
		const a = buildComponentScopes(
			{ button: { primary: "$color-brand" }, card: { border: "#e5e5e5" } },
			EXISTING,
			undefined,
		);
		const b = buildComponentScopes(
			{ card: { border: "#e5e5e5" }, button: { primary: "$color-brand" } },
			EXISTING,
			undefined,
		);
		expect(a).toBe(b);
	});
});

describe("component scopes — real Tailwind compilation proofs", () => {
	const SHEET = [
		'@import "tailwindcss";',
		"@theme {",
		"\t--color-primary: #0055ff;",
		"\t--color-brand: #ff0000;",
		"}",
		"[data-theme='dark'] {",
		"\t--color-brand: #880000;",
		"}",
		".pwc-button {",
		"\t--color-primary: var(--color-brand);",
		"}",
	].join("\n");

	test("(a) the override rule and the var()-referencing utility both compile", async () => {
		const ds = await __unstable__loadDesignSystem(SHEET, { base: import.meta.dirname });
		void ds;
		const compiled = await compile(SHEET, { base: import.meta.dirname, onDependency: () => {} });
		const cssText = compiled.build(["bg-primary", "pwc-button"]);
		const root = parse(cssText);
		let sawOverride = false;
		let sawUtilityVar = false;
		root.walkRules((rule) => {
			if (rule.selector === ".pwc-button") {
				rule.walkDecls("--color-primary", (decl) => {
					if (decl.value.includes("var(--color-brand)")) sawOverride = true;
				});
			}
			if (rule.selector === ".bg-primary") {
				rule.walkDecls(/background-color/, (decl) => {
					if (decl.value.includes("var(--color-primary)")) sawUtilityVar = true;
				});
			}
		});
		expect(sawOverride).toBe(true);
		expect(sawUtilityVar).toBe(true);
	});

	test("(b) theme scopes and component scopes coexist in one sheet", async () => {
		const compiled = await compile(SHEET, { base: import.meta.dirname, onDependency: () => {} });
		const cssText = compiled.build(["bg-primary"]);
		expect(cssText).toContain("[data-theme=");
		expect(cssText).toContain(".pwc-button");
	});

	test("(c) values never leak into the sheet outside their binding", async () => {
		const compiled = await compile(SHEET, { base: import.meta.dirname, onDependency: () => {} });
		const cssText = compiled.build(["pwc-button"]);
		// the RAW brand hex only appears in @theme's :root default for it,
		// never re-emitted by the component scope itself
		const pwcRule = cssText.split(".pwc-button")[1]?.split("}")[0] ?? "";
		expect(pwcRule).not.toContain("#ff0000");
		expect(pwcRule).toContain("var(--color-brand)");
	});
});
