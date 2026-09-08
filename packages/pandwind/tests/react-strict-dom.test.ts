import { describe, expect, test } from "vitest";
import { examplePreset } from "@pandwind/example-preset";
import {
	createCss,
	createCx,
	createDesignCss,
	ReactStrictDomPlatform,
} from "../src/react-strict-dom.ts";

describe("pandwind/react-strict-dom web surface", () => {
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

	test("preserves Pandwind design tokens in the RSD style carrier", () => {
		const css = createDesignCss(examplePreset);
		const style = css({ $frame: { fill: "$blue-500", pad: 4 } });

		expect(style.$$css).toBe(true);
		expect(style.backgroundColor).toMatch(/^x/);
		expect(style.padding).toMatch(/^x/);
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

describe("pandwind/react-strict-dom native surface", () => {
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
