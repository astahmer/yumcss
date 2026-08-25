/**
 * Style IR + css backend (plans/021 step 1).
 *
 * Pins the target-independent IR contract every backend lowers from, and
 * the css backend's declaration lowering (moved verbatim out of
 * create-css.ts):
 *
 * - flattening: `__`-separated keys, OUTERMOST condition first, inner
 *   conditions keeping their `_` (`_hover___dark__color`), trailing
 *   segment = property; null/false/empty dropped; numbers and `true`
 *   pass through unstringified; arrays flatten to index keys;
 * - css backend lowering: strategy chain first (custom class, sheet-backed
 *   registration), hashed atomic fallback, idempotent per (key, value),
 *   atom registry shared with cx.
 */
import { describe, expect, test } from "vitest";
import { createCssBackend } from "../src/backends/css.ts";
import type { FlatStyleIR } from "../src/backends/types.ts";
import { ATOM_REGISTRY } from "../src/css/atoms.ts";
import { createCss } from "../src/css/create-css.ts";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { flattenStyle } from "../src/lib/utils.ts";
import { createCx } from "../src/cx/index.ts";

describe("style IR (flattened style object)", () => {
	test("flat declarations pass through", () => {
		expect(flattenStyle({ color: "red", padding: 4 } as never)).toEqual({
			color: "red",
			padding: 4,
		});
	});

	test("conditions nest `__`-separated, outermost first, inner `_` kept", () => {
		const ir = flattenStyle({ _hover: { _dark: { color: "green" } } }) as FlatStyleIR;
		expect(ir).toEqual({ _hover___dark__color: "green" });
		const key = Object.keys(ir)[0]!;
		expect(key.split("__")).toEqual(["_hover", "_dark", "color"]);
	});

	test("null / undefined / empty objects disappear (false is kept for flattie, dropped upstream)", () => {
		expect(flattenStyle({ a: null, c: undefined, d: {}, e: "kept" } as never)).toEqual({
			e: "kept",
		});
		// The design layer (resolveDesignStyle) drops false before flattening;
		// raw css() callers see flattie's pass-through.
		expect(flattenStyle({ b: false } as never)).toEqual({ b: false });
	});

	test("numbers and true pass through unstringified (backend stringifies)", () => {
		const ir = flattenStyle({ margin: { top: 4 }, flag: true } as never) as FlatStyleIR;
		expect(ir).toEqual({ margin__top: 4, flag: true });
	});

	test("arrays flatten to index keys", () => {
		expect(flattenStyle({ font: ["a", "b"] } as never)).toEqual({ font__0: "a", font__1: "b" });
	});
});

describe("css backend", () => {
	test("declare is idempotent per (key, value) and registers atoms", () => {
		const backend = createCssBackend();
		const first = backend.declare("color", "red");
		expect(backend.declare("color", "red")).toBe(first);
		expect(backend.atoms.get(first)).toBe("color");
		// Different value -> different atom.
		expect(backend.declare("color", "blue")).not.toBe(first);
	});

	test("values are stringified on the way in", () => {
		const backend = createCssBackend();
		const fromString = backend.declare("line", "4");
		expect(backend.declare("line", 4 as unknown as string)).toBe(fromString);
	});

	test("sheet-backed strategy classes join the registry", () => {
		const backend = createCssBackend({ className: createNamedAtomsStrategy() });
		const cls = backend.declare("_hover__color", "red");
		expect(cls).toBe("pw-_hover__color-red");
		expect(backend.atoms.get(cls)).toBe("_hover__color");
	});

	test("non-sheet-backed strategy classes stay out of the registry", () => {
		const backend = createCssBackend({
			className: { name: "external", toClassName: () => "ext-color-red" },
		});
		const cls = backend.declare("color", "red");
		expect(cls).toBe("ext-color-red");
		expect(backend.atoms.has(cls)).toBe(false);
	});

	test("createCss rides the backend: registry lands on the css fn for cx", () => {
		const css = createCss();
		const compiled = css({ color: "red" });
		const atom = compiled.color!;
		const registry = (css as unknown as { [ATOM_REGISTRY]?: Map<string, string> })[ATOM_REGISTRY];
		expect(registry?.get(atom)).toBe("color");
		// cx resolves atoms back to property signatures: a later same-property
		// atom wins (eager conflict resolution).
		const cx = createCx({ css });
		expect(cx(css({ color: "blue" }), compiled)).toBe(atom);
	});
});
