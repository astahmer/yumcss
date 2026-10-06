import { describe, expect, test } from "vitest";
import { CodemodAdapterId } from "@yumcss/codemod/swap/browser";
import { createMigrationLab } from "./migration-lab.ts";

describe("migration examples plan 055 adapters", () => {
	/** Roundtrip leg: migrate back to the source adapter with the generated code. */
	function roundtrip(lab: ReturnType<typeof createMigrationLab>, source: CodemodAdapterId) {
		const first = lab.migrate(source, CodemodAdapterId.YumCSS, lab.sampleFor(source));
		expect(first.ok, source).toBe(true);
		if (!first.ok) return;
		expect(first.converted, source).toBe(1);
		expect(first.skipped, source).toBe(0);
		expect(first.residuals, source).toEqual([]);
		const back = lab.migrate(CodemodAdapterId.YumCSS, source, first.code);
		expect(back.ok, `${source} roundtrip`).toBe(true);
	}

	test("migrates the Tamagui sample to the YumCSS css API and back", () => {
		const lab = createMigrationLab();
		const result = lab.migrate(
			CodemodAdapterId.Tamagui,
			CodemodAdapterId.YumCSS,
			lab.sampleFor(CodemodAdapterId.Tamagui),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('css.class({ padding: 16, color: "red" })');
		expect(result.code).toMatchInlineSnapshot(`
			"import { View } from "tamagui";
			import { createUnsafeCss } from "yumcss/unsafe/css";
			import { createCx } from "yumcss/cx";
			const cx = createCx();
			const css = createUnsafeCss();
			const __yumcssSlot = ({ defaultComponent, style, stableClass, inheritedClass, classAttribute, attrs, joinClass }) => { const component = (props) => { const Component = props.as ?? defaultComponent; const { as: _as, ...rest } = props; return <Component {...attrs} {...rest} {...{ [classAttribute]: joinClass(style, stableClass, inheritedClass, props[classAttribute]) }} />; }; component.__yumcssClassName = stableClass; return component; };

			export const Card = __yumcssSlot({ defaultComponent: (View), style: css.class({ padding: 16, color: "red" }), stableClass: "pw-1l0hnhk", inheritedClass: undefined, classAttribute: "className", attrs: {}, joinClass: cx });"
		`);
		roundtrip(lab, CodemodAdapterId.Tamagui);
	});

	test("migrates the authored CSS sample to the YumCSS css API and back", () => {
		const lab = createMigrationLab();
		const result = lab.migrate(
			CodemodAdapterId.AuthoredCss,
			CodemodAdapterId.YumCSS,
			lab.sampleFor(CodemodAdapterId.AuthoredCss),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('css.class({ padding: "1rem", color: "red" })');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
			export default styles;"
		`);
		roundtrip(lab, CodemodAdapterId.AuthoredCss);
	});

	test("migrates the CSS modules sample to the YumCSS css API and back", () => {
		const lab = createMigrationLab();
		const result = lab.migrate(
			CodemodAdapterId.CssModules,
			CodemodAdapterId.YumCSS,
			lab.sampleFor(CodemodAdapterId.CssModules),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('css.class({ padding: "1rem", color: "red" })');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
			export default styles;"
		`);
		roundtrip(lab, CodemodAdapterId.CssModules);
	});

	test("migrates the Sass sample to the YumCSS css API and back", () => {
		const lab = createMigrationLab();
		const result = lab.migrate(
			CodemodAdapterId.Sass,
			CodemodAdapterId.YumCSS,
			lab.sampleFor(CodemodAdapterId.Sass),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('css.class({ padding: "1rem", color: "red" })');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
			export default styles;"
		`);
		roundtrip(lab, CodemodAdapterId.Sass);
	});

	test("migrates the Less sample to the YumCSS css API and back", () => {
		const lab = createMigrationLab();
		const result = lab.migrate(
			CodemodAdapterId.Less,
			CodemodAdapterId.YumCSS,
			lab.sampleFor(CodemodAdapterId.Less),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.converted).toBe(1);
		expect(result.residuals).toEqual([]);
		expect(result.code).toContain('css.class({ padding: "1rem", color: "red" })');
		expect(result.code).toMatchInlineSnapshot(`
			"import { createUnsafeCss } from "yumcss/unsafe/css";
			const css = createUnsafeCss();
			export const styles = { "card": css.class({ padding: "1rem", color: "red" }) };
			export default styles;"
		`);
		roundtrip(lab, CodemodAdapterId.Less);
	});
});
