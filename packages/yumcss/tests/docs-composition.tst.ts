import { expect, test } from "tstyche";
import { createCss, type AtomicStyleProps } from "yumcss/css";
import { tailwindPreset } from "yumcss/preset/tailwindcss";

const css = createCss(tailwindPreset);

test("documentation variants retain maps through xcss and host props", () => {
	const button = {
		base: css({
			display: "inline-flex",
			alignItems: "center",
			borderRadius: "md",
			fontWeight: "medium",
		}),
		size: {
			sm: css({ paddingInline: 2, height: 8 }),
			md: css({ paddingInline: 4, height: 10 }),
		},
		tone: {
			primary: css({
				backgroundColor: "$blue-600",
				color: "$white",
				_hover: { backgroundColor: "$blue-700" },
			}),
			ghost: css({
				backgroundColor: "transparent",
				color: "$slate-900",
				_hover: { backgroundColor: "$slate-100" },
			}),
		},
	};
	const override: ReturnType<typeof css> = css({ borderRadius: "full" });
	expect(css.props(button.base, button.size.sm, button.tone.primary, override).className).type.toBe<
		string | undefined
	>();
	expect(
		css({
			// @ts-expect-error not assignable
			color: "#123456",
		}),
	).type.toBe<ReturnType<typeof css>>();
});

test("documentation authored objects and dynamic props use distinct projections", () => {
	const styles: AtomicStyleProps<typeof css> = { color: "$slate-700", padding: 4 };
	expect(css(styles, false, null, undefined)).type.toBe<ReturnType<typeof css>>();
	const input: Parameters<typeof css.props>[number] = css.vars({ opacity: 0.5 });
	expect(css.props(css({ display: "flex" }), input).style).type.toBe<
		Record<string, string> | undefined
	>();
});
