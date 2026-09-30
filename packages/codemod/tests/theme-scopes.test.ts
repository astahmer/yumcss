/**
 * Theme scopes (plans/015) — deterministic emission + REAL-Tailwind proofs.
 *
 * The design claim under test: declared scopes emit as
 * `[data-theme="…"] { --var: … }` override blocks; utilities keep
 * referencing `var(--color-surface)`; switching is pure cascade, so the
 * compiled utility rule is IDENTICAL regardless of theme and the scope
 * block flips the effective value at runtime.
 */
import { compile } from "@tailwindcss/node";
import { parse } from "postcss";
import { describe, expect, test } from "vitest";
import { buildThemeBlock, buildThemeScopes, type ThemeScopeMap } from "../src/tw/generate-theme.ts";

const warnMessages: Array<string> = [];
const collectWarn = (message: string): void => {
	warnMessages.push(message);
};

describe("buildThemeScopes — deterministic emission", () => {
	test("scopes + bindings are sorted; output is stable across runs", () => {
		const themes: ThemeScopeMap = {
			dark: { "--color-surface": "#0b0b10", "--color-text": "#eee" },
			light: { "--color-surface": "#fff" },
		};
		const a = buildThemeScopes(themes);
		const b = buildThemeScopes({
			light: themes.light as Record<string, string>,
			dark: themes.dark as Record<string, string>,
		});
		expect(a).toBe(b);
		expect(a).toContain('[data-theme="dark"] {');
		expect(a.indexOf('[data-theme="dark"] {')).toBeLessThan(a.indexOf('[data-theme="light"] {'));
		expect(a).toContain("\t--color-surface: #0b0b10;");
	});

	test("invalid entries are warned about and skipped, never guessed", () => {
	const out = buildThemeScopes(
		{
			dark: { "--color-ok": "#000", "not-a-var": "#111", broken: 42 },
			brokenScope: "nope",
		},
			collectWarn,
		);
		expect(out).toContain("--color-ok");
		expect(out).not.toContain("not-a-var");
		expect(out).not.toContain("brokenScope");
		expect(warnMessages.length).toBeGreaterThanOrEqual(2);
	});

	test("empty/undefined input yields empty string (byte-stable presets)", () => {
		expect(buildThemeScopes(undefined)).toBe("");
		expect(buildThemeScopes({})).toBe("");
	});
});

describe("theme scopes — real Tailwind proofs", () => {
	const SHEET = `@import "tailwindcss";

${buildThemeBlock({ colors: { surface: "#ffffff" } })}

${buildThemeScopes({ dark: { "--color-surface": "#0b0b10" } })}
`;

	test("utility keeps var() reference AND the scope override survives compilation", async () => {
		const compiled = await compile(SHEET, { base: import.meta.dirname, onDependency: () => {} });
		const root = parse(compiled.build(["bg-surface"]));
		const css = root.toString();

		// utility references the variable — no value inlining
		let bgRule = "";
		root.walkRules((rule) => {
			if (rule.selector === ".bg-surface") bgRule = rule.toString();
		});
		expect(bgRule).toContain("background-color: var(--color-surface)");

		// the [data-theme] override block survives as author CSS
		expect(css).toContain('[data-theme="dark"]');
		expect(css).toMatch(/\[data-theme="dark"\]\s*\{[^}]*--color-surface: #0b0b10/s);

		// cascade flip proof: the dark binding must come AFTER the @theme
		// :root default so re-assigning the attribute flips the color with
		// zero utility CSS changes.
		const rootIdx = css.indexOf(":root, :host");
		const darkIdx = css.indexOf('[data-theme="dark"]');
		if (rootIdx !== -1 && darkIdx !== -1) expect(darkIdx).toBeGreaterThan(rootIdx);
	});

	test("presets WITHOUT declared themes keep today's byte-stable output", () => {
		const groups = { colors: { surface: "#ffffff" } };
		const without = buildThemeBlock(groups);
		const withEmpty = buildThemeBlock(groups) + buildThemeScopes(undefined);
		const withEmptyMap = buildThemeBlock(groups) + buildThemeScopes({});
		expect(without).toBe(withEmpty);
		expect(without).toBe(withEmptyMap);
	});
});
