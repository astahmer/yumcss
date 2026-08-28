/**
 * Type-level pins for the small public helpers added after the original
 * runtime typing sweep. These keep stack and dynamic-value contracts visible
 * to the same tstyche gate as tw/css/cx.
 */
import { expect, test } from "tstyche";
import { createCss } from "../src/css/create-css.ts";
import { stackClasses, type StackProps } from "../src/stack/index.ts";

const css = createCss();

test("css.vars returns a class/style carrier", () => {
	const output = css.vars({ color: "var(--runtime-color)" });
	expect(output).type.toBeAssignableTo<{ class: string; style: Record<string, string> }>();
});

test("stackClasses accepts the public stack props", () => {
	const props: StackProps = {
		direction: "column",
		gap: "4",
		padding: "6",
		align: "center",
		justify: "between",
	};
	expect(stackClasses(props)).type.toBe<string>();
});

test("stack direction and alignment values stay constrained", () => {
	// @ts-expect-error is not assignable
	stackClasses({ direction: "diagonal" });
	// @ts-expect-error is not assignable
	stackClasses({ align: "middle" });
});
