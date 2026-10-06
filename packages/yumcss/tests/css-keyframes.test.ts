import { expect, test } from "vitest";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { canonicalKeyframeBody, keyframeName } from "../src/css/keyframes.ts";

test("css.keyframes returns one deterministic name per canonical body", () => {
	const css = createUnsafeCss();
	const name = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

	expect(name).toBe(keyframeName({ from: { opacity: 0 }, to: { opacity: 1 } }));
	expect(name.startsWith("pw-kf-")).toBe(true);
	expect(css.keyframes({ "0%": { opacity: 0 }, "100%": { opacity: 1 } })).toBe(name);
	expect(css.keyframes({ to: { opacity: 1 }, from: { opacity: 0 } })).toBe(name);
	expect(css.keyframes({ from: { opacity: 1 }, to: { opacity: 0 } })).not.toBe(name);
});

test("declaration order and step order do not change the name", () => {
	const css = createUnsafeCss();
	const body = {
		"0%": { opacity: 0, transform: "rotate(0deg)" },
		"50%": { opacity: 0.5 },
		"100%": { opacity: 1, transform: "rotate(360deg)" },
	};

	expect(
		css.keyframes({
			"100%": { transform: "rotate(360deg)", opacity: 1 },
			"0%": { transform: "rotate(0deg)", opacity: 0 },
			"50%": { opacity: 0.5 },
		}),
	).toBe(css.keyframes(body));
});

test("the factory namespace selects the emitted prefix", () => {
	const namespaced = createUnsafeCss({ namespace: "checkout" } as never);
	const name = namespaced.keyframes({ from: { opacity: 0 } });

	expect(name.startsWith("checkout-kf-")).toBe(true);
	expect(name).toBe(keyframeName({ from: { opacity: 0 } }, "checkout"));
});

test("canonicalKeyframeBody normalizes steps and sorts declarations", () => {
	expect(canonicalKeyframeBody({ to: { b: 2, a: 1 }, from: { opacity: 0 } })).toBe(
		canonicalKeyframeBody({ from: { opacity: 0 }, "100%": { a: 1, b: 2 } }),
	);
});
