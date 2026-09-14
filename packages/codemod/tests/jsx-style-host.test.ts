import { describe, expect, it } from "vitest";
import { JsxStyleHost } from "../src/swap/jsx-style-host.ts";

describe("JsxStyleHost", () => {
	it("passes an existing class through Pandwind props", () => {
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

	it("keeps cx for non-Pandwind class expressions", () => {
		const result = JsxStyleHost.render(
			"<div className={className} {...props} />",
			[],
			'tw({ color: "red" })',
			"react",
		);

		expect(result.text).toContain(
			'className={cx(tw({ color: "red" }), className, props.className)}',
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
