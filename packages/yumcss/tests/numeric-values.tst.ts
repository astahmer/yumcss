import { expect, test } from "tstyche";
import { createCss } from "yumcss/css";
import { createDesignCss } from "yumcss/design";
import { define, type YumCSSProperties } from "yumcss/preset";

const config: YumCSSProperties = {};
const preset = define.preset(
	{ config, tokens: { spacing: { 4: "1rem" }, radii: { 2: "0.5rem" } } },
	{
		conditions: { _hover: "&:hover" },
		properties: {
			padding: { $tokens: "spacing" },
			borderRadius: { $tokens: "radii" },
			width: true,
			opacity: true,
			lineHeight: true,
			zIndex: true,
		},
	},
);
const css = createCss(preset);
const dss = createDesignCss(preset);

test("numbered CSS tokens accept numeric and string spelling, never arbitrary pixel numbers", () => {
	expect(css.class({ padding: 4, borderRadius: 2 })).type.toBe<string>();
	expect(
		css.class({ padding: "4", borderRadius: "2", _hover: { padding: 4 } }),
	).type.toBe<string>();
	expect(css.class({ width: 0, opacity: 0.5, lineHeight: 1.5, zIndex: 2 })).type.toBe<string>();
	expect(css.class).type.not.toBeCallableWith({ width: 12 });
	expect(css.class).type.not.toBeCallableWith({ padding: 999 });
	expect(css.class).type.not.toBeCallableWith({ padding: "999" });
	expect(css.class({ $raw: { width: "12px" } })).type.toBe<string>();
});

test("designer lengths accept numbered tokens and explicit CSS units", () => {
	expect(dss.class({ $frame: { pad: 4, corners: 2 } })).type.toBe<string>();
	expect(
		dss.class({ $frame: { pad: "4", corners: "2", w: "12px", blurBg: "8px" } }),
	).type.toBe<string>();
	expect(dss.class).type.not.toBeCallableWith({ $frame: { pad: 999 } });
	expect(dss.class).type.not.toBeCallableWith({ $frame: { corners: 999 } });
	expect(dss.class).type.not.toBeCallableWith({ $frame: { blurBg: 8 } });
	expect(dss.class({ $text: { spacing: { line: 1.5, letter: "0.1em" } } })).type.toBe<string>();
});
