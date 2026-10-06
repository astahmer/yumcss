import { describe, expect, it } from "vitest";
import { JsxStyleHost } from "../src/swap/jsx-style-host.ts";

describe("JsxStyleHost", () => {
	it("passes an existing class through YumCSS props", () => {
		const result = JsxStyleHost.render(
			'<div className="existing" data-kind="card" />',
			[],
			'css.class({ color: "red" })',
			"react",
		);

		expect(result.text).toContain(
			'className={css.props(css.class({ color: "red" }), "existing").className}',
		);
		expect(result.needsCx).toBe(false);
	});

	it("spreads one YumCSS props carrier when the host has no class or style", () => {
		const result = JsxStyleHost.render(
			'<div data-kind="card" />',
			[],
			"css.vars({ color: tone }).class",
			"react",
			"css.vars({ color: tone }).style",
			undefined,
			"css.vars({ color: tone })",
		);

		expect(result.text).toBe('<div data-kind="card" {...css.props(css.vars({ color: tone }))} />');
		expect(result.text).not.toContain(".class");
		expect(result.text).not.toContain(".style");
	});

	it("spreads the native vars carrier for class-based JSX hosts", () => {
		const result = JsxStyleHost.render(
			'<div data-kind="card" />',
			[],
			"css.vars({ color: tone }).class",
			"solid",
			"css.vars({ color: tone }).style",
			undefined,
			"css.vars({ color: tone })",
		);

		expect(result.text).toBe('<div data-kind="card" {...css.vars({ color: tone })} />');
	});

	it("reuses one vars carrier when JSX class and style props already exist", () => {
		const result = JsxStyleHost.render(
			'<div className={existingClass} style={existingStyle} data-kind="card" />',
			[],
			"css.vars({ color: tone }).class",
			"react",
			"css.vars({ color: tone }).style",
			undefined,
			"css.vars({ color: tone })",
		);

		expect(result.text).toContain(
			"{...(() => { const __yumcssVars = css.vars({ color: tone }); return { ...css.props(__yumcssVars, existingClass), style: { ...(existingStyle ?? {}), ...__yumcssVars.style } }; })()}",
		);
		expect(result.text).not.toContain("css.vars({ color: tone }).class");
		expect(result.text).not.toContain("css.vars({ color: tone }).style");
	});

	it("merges one vars carrier into class-based host props", () => {
		const result = JsxStyleHost.render(
			"<div class={existingClass} {...props} />",
			[],
			"css.vars({ color: tone }).class",
			"solid",
			"css.vars({ color: tone }).style",
			undefined,
			"css.vars({ color: tone })",
		);

		expect(result.text).toContain(
			'class: [__yumcssVars.class, existingClass, props?.class].filter(Boolean).join(" ")',
		);
		expect(result.text).toContain("style: { ...(props?.style ?? {}), ...__yumcssVars.style }");
		expect(result.text).not.toContain("css.vars({ color: tone }).class");
		expect(result.text).not.toContain("css.vars({ color: tone }).style");
	});

	it("keeps cx for non-YumCSS class expressions", () => {
		const result = JsxStyleHost.render(
			"<div className={className} {...props} />",
			[],
			'tw({ color: "red" })',
			"react",
		);

		expect(result.text).toContain(
			'className={cx(tw({ color: "red" }), className, props?.className)}',
		);
		expect(result.needsCx).toBe(true);
	});

	it("does not attach a boolean attribute's following name to the host tag", () => {
		const result = JsxStyleHost.parse(
			'<Text fontWeight="700" truncate title="Campaign" />',
			0,
			{
				file: "App.tsx",
				source: '<Text fontWeight="700" truncate title="Campaign" />',
				config: { adapter: "chakra-ui", files: [], values: {} },
			},
			["fontWeight", "truncate"],
			{ adapter: "chakra-ui", framework: "react" },
		);

		expect(result?.attributes.map((attribute) => attribute.raw)).toEqual([
			'fontWeight="700"',
			"truncate",
			'title="Campaign"',
		]);
	});
});
