import { describe, expect, test } from "vitest";
import { createCx } from "../src/cx/index.ts";
import { createCss } from "../src/css/create-css.ts";

describe("runtime hot paths", () => {
	test("plain cx inputs keep normal deduplication semantics", () => {
		const cx = createCx();

		expect(cx("button", "primary", "rounded")).toBe("button primary rounded");
		expect(cx("button", "", false, null, "primary")).toBe("button primary");
		expect(cx("button", "button", "primary")).toBe("button primary");
		expect(cx("button primary", "rounded")).toBe("button primary rounded");
	});

	test("flat CSS styles preserve numeric and string declarations", () => {
		const css = createCss({ debug: true });

		expect(css({ color: "red", padding: 4, fontWeight: 700 })).toMatchObject({
			color: "color__red",
			padding: "padding__4px",
			fontWeight: "fontWeight__700",
		});
	});

	test("callable CSS composes authored objects before atom generation", () => {
		const css = createCss({ debug: true });

		expect(css({ color: "red", padding: 4 }, { color: "blue", gap: 8 })).toMatchObject({
			color: "color__blue",
			padding: "padding__4px",
			gap: "gap__8px",
		});
	});

	test("class projection preserves flat and nested declaration order", () => {
		const css = createCss({ debug: true });

		expect(css.class({ color: "red", padding: 4 })).toBe("color__red padding__4px");
		expect(css.class({ _hover: { color: "red" } }, { color: "blue" })).toBe(
			"_hover__color__red color__blue",
		);
	});

	test("null resets still normalize only the changed branches", () => {
		const css = createCss({ debug: true });

		expect(
			css({
				borderTopWidth: null,
				_hover: { color: null, padding: 2 },
			}),
		).toMatchObject({
			borderTopWidth: "borderTopWidth__0px",
			_hover__color: "_hover__color__initial",
			_hover__padding: "_hover__padding__2px",
		});
	});
});
