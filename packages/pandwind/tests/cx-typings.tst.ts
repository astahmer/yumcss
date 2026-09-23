/**
 * Type-level contract of `createCx`: accepts class strings, compiled css
 * maps, nested arrays and falsey values; always returns a class string.
 */
import { expect, test } from "tstyche";
import { createUnsafeCss } from "pandwind/unsafe/css";
import { createCx } from "pandwind/cx";

const css = createUnsafeCss();
const cx = createCx({ css });

test("cx accepts every input shape", () => {
	expect(cx("flex", "bg-red-500")).type.toBe<string>();
	expect(cx(css({ color: "red" }))).type.toBe<string>();
	expect(cx(css.class({ color: "red" }))).type.toBe<string>();
	expect(
		cx(["flex", "p-4"], false, null, undefined, "", css({ color: "red" })),
	).type.toBe<string>();
});

test("cx is callable without any input", () => {
	expect(cx()).type.toBe<string>();
});
