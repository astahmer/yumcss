import { expect, test } from "tstyche";
import { createCss, ReactStrictDomPlatform } from "yumcss/react-strict-dom";
import type {
	ReactStrictDomCompiledStyle,
	ReactStrictDomNativeStyle,
} from "yumcss/react-strict-dom";

const web = createCss();
const native = createCss({ platform: ReactStrictDomPlatform.Native });

test("css.create preserves named style keys and dynamic arguments", () => {
	const styles = web.create({
		root: { color: "red" },
		opacity: (value: number) => ({ opacity: value }),
	});

	expect(styles.root).type.toBeAssignableTo<Record<string, unknown>>();
	expect(styles.root).type.toBeAssignableTo<ReactStrictDomCompiledStyle>();
	expect(styles.opacity).type.toBeCallableWith(0.5);
	// @ts-expect-error not assignable
	styles.opacity("half");
});

test("native and web surfaces share the style-definition shape", () => {
	expect(
		native.create({ root: { padding: "4px" } }).root,
	).type.toBeAssignableTo<ReactStrictDomNativeStyle>();
	expect(native({ padding: "4px" })).type.toBeAssignableTo<ReactStrictDomNativeStyle>();
	expect(web({ padding: "4px" })).type.toBeAssignableTo<ReactStrictDomCompiledStyle>();
});
