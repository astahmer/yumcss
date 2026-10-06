import { describe, expect, test } from "vitest";
import { examplePreset } from "@yumcss/example-preset";
import {
	createCss,
	createCx,
	createDesignCss,
	createReactStrictDomBackend,
	ReactStrictDomPlatform,
} from "../src/react-strict-dom.ts";
import { resolveDesignStyle } from "../src/design/resolve.ts";

describe("yumcss/react-strict-dom web surface", () => {
	test("exposes RSD's named css.create style carrier", () => {
		const css = createCss();
		const styles = css.create({
			root: { color: "red", padding: "1rem" },
			opacity: (value: number) => ({ opacity: value }),
		});

		expect(styles.root.$$css).toBe(true);
		expect(styles.root.color).toMatch(/^x/);
		expect(styles.opacity(0.5).opacity).toMatch(/^x/);
	});

	test("preserves YumCSS design tokens in the RSD style carrier", () => {
		const dss = createDesignCss(examplePreset);
		const style = dss({ $frame: { fill: "$blue-500", pad: 4 } });

		expect(style.$$css).toBe(true);
		expect(style.backgroundColor).toMatch(/^x/);
		expect(style.padding).toMatch(/^x/);
	});

	test("uses the preset condition selectors for design style identities", () => {
		const dss = createDesignCss(examplePreset);
		const style = dss({ _hover: { $frame: { fill: "$blue-500" } } });
		const resolved = resolveDesignStyle(
			{ _hover: { $frame: { fill: "$blue-500" } } },
			examplePreset.tokens,
		);
		const expected = createReactStrictDomBackend({
			conditions: examplePreset.conditions,
		}).resolve(resolved);

		expect(style._hover__backgroundColor).toBe(expected._hover__backgroundColor);
	});

	test("merges compiled web style maps through createCx", () => {
		const css = createCss();
		const cx = createCx();
		const first = css({ color: "red", padding: "4px" });
		const second = css({ color: "blue" });

		const merged = cx(first, second);

		expect(merged.$$css).toBe(true);
		expect(merged.color).toBe(second.color);
		expect(merged.padding).toBe(first.padding);
	});
});

describe("yumcss/react-strict-dom native surface", () => {
	test("lowers css.create values to native style objects", () => {
		const css = createCss({ platform: ReactStrictDomPlatform.Native });
		const styles = css.create({
			root: { padding: "1rem", borderRadius: "4px 8px" },
		});

		expect(styles.root).toEqual({
			padding: 16,
			borderTopLeftRadius: 4,
			borderTopRightRadius: 8,
			borderBottomRightRadius: 4,
			borderBottomLeftRadius: 8,
		});
	});

	test("merges platform artifacts through createCx", () => {
		const cx = createCx({ platform: ReactStrictDomPlatform.Native });
		const first = createCss({ platform: ReactStrictDomPlatform.Native })({ color: "red" });
		const second = createCss({ platform: ReactStrictDomPlatform.Native })({ color: "blue" });

		expect(cx(first, second)).toEqual({ color: "blue" });
	});
});
