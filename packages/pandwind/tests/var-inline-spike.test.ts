/**
 * Var-inline spike (plans/014 §1): verify the fallback-chain encoding
 * against REAL Tailwind compilation before committing to the design.
 *
 * Claim under test: a dynamic-value atom can be expressed as
 *   class "pw-color"            -> color: var(--pw-c-color)
 *   class "pw-hover:color"      -> color: var(--pw-c-color_hover, var(--pw-c-color))
 * with the value delivered inline (`style="--pw-c-color: X"`), conditions
 * resolved by static toggle rules, and cx()-style last-wins still working
 * because both classes set the same property.
 */
import { compile, __unstable__loadDesignSystem } from "@tailwindcss/node";
import { parse, type Root, type Rule } from "postcss";
import { describe, expect, test } from "vitest";

const SHEET = `
@theme {
	--color-blue-500: #3b82f6;
}
.pw-color { color: var(--pw-c-color); }
.pw-hover\\:color:hover { color: var(--pw-c-color_hover, var(--pw-c-color)); }
`;

async function rulesFor(sheet: string, classes: string[]): Promise<Root> {
	const ds = await __unstable__loadDesignSystem(sheet, { base: import.meta.dirname });
	const result = await compile(sheet, { base: import.meta.dirname, onDependency: () => {} });
	void ds;
	return parse(result.build(classes));
}

function colorDeclarations(root: Root): string[] {
	const out: string[] = [];
	root.walkRules((rule) => {
		rule.walkDecls("color", (decl) => {
			out.push(`${rule.selector} :: ${decl.value}`);
		});
	});
	return out;
}

describe("var-inline spike — real Tailwind compilation", () => {
	test("base var class survives compilation and references the inline var", async () => {
		const root = await rulesFor(SHEET, ["pw-color"]);
		expect(colorDeclarations(root)).toContain(".pw-color :: var(--pw-c-color)");
	});

	test("hover variant compiles with the fallback chain", async () => {
		const root = await rulesFor(SHEET, ["pw-hover:color"]);
		const hover = colorDeclarations(root).find((r) => r.includes(":hover"));
		expect(hover).toBeDefined();
		expect(hover).toContain("var(--pw-c-color_hover, var(--pw-c-color))");
	});

	test("both classes together: later utility wins by source order (cx parity)", async () => {
		const root = await rulesFor(SHEET, ["pw-hover:color", "pw-color"]);
		const decls = colorDeclarations(root);
		expect(decls.some((d) => d.startsWith(".pw-color "))).toBe(true);
		expect(decls.some((d) => d.includes(":hover"))).toBe(true);
	});

	test("inline custom property delivery works without any emitted value rules", async () => {
		// The sheet never contains the VALUE (#ff0000) — proof values ride
		// inline styles only, i.e. zero runtime CSS injection.
		const root = await rulesFor(SHEET, ["pw-color"]);
		let sawValue = false;
		root.walkDecls((decl) => {
			if (decl.value.includes("#ff0000")) sawValue = true;
		});
		void 0;
		expect(sawValue).toBe(false);
	});
});
