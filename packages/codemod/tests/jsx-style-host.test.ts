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
});
