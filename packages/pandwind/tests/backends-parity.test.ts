/**
 * Cross-backend parity suite (plans/021 step 6).
 *
 * Pins that the css, react-native and opentui backends agree on SEMANTICS
 * (not artifacts): given the same design-vocabulary input over the same
 * examplePreset, all three must resolve identical winning properties with
 * identical token values — differing ONLY where a target's unit policy says
 * they must (css keeps px strings, RN emits unitless dp numbers, OpenTUI
 * quantizes to terminal cells, default cellSize 4).
 *
 * Oracle: on the css side, declaration identity is observable through the
 * atom hash — two compilations produce the SAME class iff the resolved
 * (key, value) is identical (verified: `fill: "$blue-500"` compiles to the
 * exact atom of `$raw: { backgroundColor: "#3182ce" }`). So css VALUES are
 * asserted by atom identity against raw-CSS reference intents instead of by
 * parsing a stylesheet.
 *
 * Condition scoping (verified against source before asserting): the css
 * engine resolves conditions at the stylesheet layer — at runtime a
 * `_dark` block compiles to an atom whose registry key is
 * `_dark__backgroundColor`, i.e. a SEPARATE variant scope. Object backends
 * have no stylesheet: they resolve conditions eagerly via injected
 * resolvers (strict: unknown condition throws). The parity invariant is
 * therefore: scoped css atoms never clobber unscoped atoms in cx, exactly
 * like an unsatisfied `_dark` resolver leaves the base value standing.
 *
 * Out of scope: stylesheet emission/cascade (css-tw-parity), tailwind
 * adapter equivalence (tw-tailwind-parity), tw-merge string parity
 * (cx-twmerge-parity), theme var() mechanics (tw-theme-parity).
 */
import { describe, expect, test } from "vitest";
import { ATOM_REGISTRY, type AtomRegistry } from "../src/css/atoms.ts";
import { createCx as createWebCx } from "../src/cx/index.ts";
import { createDesignCss as createWebDesignCss } from "../src/design/index.ts";
import { examplePreset } from "@pandwind/example-preset";
import {
	createCx as createOpentuiCx,
	createDesignCss as createOpentuiDesignCss,
} from "../src/opentui.ts";
import { createCx as createRnCx, createDesignCss as createRnDesignCss } from "../src/rn.ts";

/* ---------------------------------------------------------------------------
 * Surfaces under test — same preset, three targets.
 * -------------------------------------------------------------------------*/

const webCss = createWebDesignCss(examplePreset);
const webCx = createWebCx({ css: webCss });
const registry = (webCss as unknown as { [ATOM_REGISTRY]?: AtomRegistry })[ATOM_REGISTRY];

const rnCss = createRnDesignCss(examplePreset);
const rnCx = createRnCx();

const otCss = createOpentuiDesignCss(examplePreset);
const otCx = createOpentuiCx();

/** Compile one design intent to its single css atom class. */
const atomOf = (style: Parameters<typeof webCss.class>[0]): string => {
	const cls = webCss.class(style);
	expect(cls, "atomOf expects exactly one class").not.toContain(" ");
	return cls;
};

/** Decode surviving properties of a cx() result via ATOM_REGISTRY. */
const survivorsOf = (classes: string): Set<string> => {
	const parts = classes.split(/\s+/).filter(Boolean);
	expect(parts.length, `every survivor must be a registered atom: "${classes}"`).toBe(
		new Set(parts).size,
	);
	return new Set(
		parts.map((cls) => {
			const key = registry?.get(cls);
			expect(key, `unregistered atom "${cls}"`).toBeTruthy();
			return key!.split("__").at(-1)!;
		}),
	);
};

describe("merge parity — later wins per property", () => {
	test("disjoint properties coexist on every backend", () => {
		// Web: both atoms survive cx untouched.
		const base = atomOf({ $frame: { fill: "$gray-100" } });
		const accent = atomOf({ $text: { color: "$red-500" } });
		const merged = webCx(base, accent);
		expect(survivorsOf(merged)).toEqual(new Set(["backgroundColor", "color"]));
		expect(merged).toContain(base);
		expect(merged).toContain(accent);

		// Object backends: same property map, same token-resolved values.
		const rn = rnCx(
			rnCss({ $frame: { fill: "$gray-100" } }),
			rnCss({ $text: { color: "$red-500" } }),
		);
		expect(rn).toEqual({ backgroundColor: "#f3f4f6", color: "#E53E3E" });
		// Color values carry no target unit policy -> byte-identical maps.
		expect(
			otCx(otCss({ $frame: { fill: "$gray-100" } }), otCss({ $text: { color: "$red-500" } })),
		).toEqual(rn);
	});

	test("conflicting values: the later style wins on every backend", () => {
		// Web: the loser atom is dropped ENTIRELY, not just overridden.
		const base = atomOf({ $frame: { fill: "$gray-100" } });
		const patch = atomOf({ $frame: { fill: "$blue-500" } });
		expect(webCx(base, patch)).toBe(patch);
		expect(survivorsOf(webCx(base, patch))).toEqual(new Set(["backgroundColor"]));

		// Object backends agree on the winner's value.
		const rn = rnCx(
			rnCss({ $frame: { fill: "$gray-100" } }),
			rnCss({ $frame: { fill: "$blue-500" } }),
		);
		expect(rn).toEqual({ backgroundColor: "#3182ce" });
		expect(
			otCx(otCss({ $frame: { fill: "$gray-100" } }), otCss({ $frame: { fill: "$blue-500" } })),
		).toEqual(rn);
	});

	test("repeated identical declarations collapse to one artifact", () => {
		const intent = { $frame: { fill: "$gray-100" } } as const;
		// Web: cx dedups by exact atom string.
		const atom = atomOf(intent);
		expect(webCx(atom, atom)).toBe(atom);

		// Object backends: the cx instance's hash registry hands back the SAME
		// reference for repeated identical merges (stable identity per surface).
		const rnBase = rnCss(intent);
		expect(rnCx(rnBase, rnBase)).toEqual(rnBase);
		expect(rnCx(rnBase, rnBase)).toBe(rnCx(rnBase, rnBase));
		const otBase = otCss(intent);
		expect(otCx(otBase, otBase)).toEqual(otBase);
		expect(otCx(otBase, otBase)).toBe(otCx(otBase, otBase));
	});

	test("_dark blocks follow the resolver (object) / stay scope-separated (css)", () => {
		let dark = false;

		// Object backends: base stands while the resolver is false, the dark
		// value wins once it flips — identical outcomes on both.
		const rnDark = createRnDesignCss(examplePreset, { conditions: { dark: () => dark } });
		const otDark = createOpentuiDesignCss(examplePreset, { conditions: { dark: () => dark } });
		const darkIntent = {
			$frame: { fill: "$gray-100" },
			_dark: { $frame: { fill: "$gray-800" } },
		} as const;
		dark = false;
		expect(rnDark(darkIntent)).toEqual({ backgroundColor: "#f3f4f6" });
		expect(otDark(darkIntent)).toEqual({ backgroundColor: "#f3f4f6" });
		dark = true;
		expect(rnDark(darkIntent)).toEqual({ backgroundColor: "#1f2937" });
		expect(otDark(darkIntent)).toEqual({ backgroundColor: "#1f2937" });

		// Web: conditions live in the stylesheet, so runtime sees a SCOPED
		// atom (`_dark__backgroundColor`) — distinct from the unscoped atom
		// even for the identical resolved value, and cx never lets one
		// clobber the other (the cascade decides which applies).
		const plain = atomOf({ $frame: { fill: "$gray-100" } });
		const scoped = atomOf({ _dark: { $frame: { fill: "$gray-100" } } });
		expect(scoped).not.toBe(plain);
		expect(registry?.get(scoped)).toBe("_dark__backgroundColor");
		expect(webCx(plain, scoped)).toContain(plain);
		expect(webCx(plain, scoped)).toContain(scoped);
	});
});

describe("token parity — one DTCG preset, three unit policies", () => {
	test("$blue-500 resolves to #3182ce through every backend", () => {
		// Web oracle: the token-fed atom IS the literal-value atom.
		const viaToken = atomOf({ $frame: { fill: "$blue-500" } });
		const viaLiteral = atomOf({ $raw: { backgroundColor: "#3182ce" } });
		expect(viaToken).toBe(viaLiteral);

		// Object backends emit the resolved color directly.
		expect(rnCss({ $frame: { fill: "$blue-500" } })).toEqual({ backgroundColor: "#3182ce" });
		expect(otCss({ $frame: { fill: "$blue-500" } })).toEqual({ backgroundColor: "#3182ce" });
	});

	test("lengths differ only by each target's declared unit policy", () => {
		// Web keeps CSS-shaped px strings (oracle: literal equality).
		expect(atomOf({ $frame: { pad: [4, 8] } })).toBe(atomOf({ $raw: { padding: "4px 8px" } }));

		// RN: automatic policy, px -> unitless dp numbers 1:1.
		expect(rnCss({ $frame: { pad: [4, 8] } })).toEqual({
			paddingTop: 4,
			paddingRight: 8,
			paddingBottom: 4,
			paddingLeft: 8,
		});

		// OpenTUI: declared-with-default policy, round(px / cellSize).
		expect(otCss({ $frame: { pad: [4, 8] } })).toEqual({
			paddingTop: 1,
			paddingRight: 2,
			paddingBottom: 1,
			paddingLeft: 2,
		});
		// Overridable per app: cellSize 2 doubles the cell counts.
		const dense = createOpentuiDesignCss(examplePreset, { cellSize: 2 });
		expect(dense({ $frame: { pad: [4, 8] } })).toMatchObject({ paddingTop: 2, paddingRight: 4 });

		// Same policy split on radii: lg = 0.5rem = 8px.
		expect(rnCss({ $frame: { corners: "lg" } })).toEqual({ borderRadius: 8 });
		expect(otCss({ $frame: { corners: "lg" } })).toEqual({ borderRadius: 2 });
	});
});

describe("condition-policy parity — strict on every object backend", () => {
	test("unknown conditions throw identically-worded errors on rn and opentui", () => {
		for (const css of [createRnDesignCss(examplePreset), createOpentuiDesignCss(examplePreset)]) {
			expect(() =>
				css({ $frame: { fill: "$gray-100" }, _hover: { $frame: { fill: "$gray-800" } } }),
			).toThrow(/"_hover" is not supported/);
		}
	});

	test("css has no runtime resolver BY DESIGN: conditions compile to scoped atoms", () => {
		// Verified against source: resolveDesignStyle flattens conditions into
		// the key (_dark__backgroundColor); the engine scopes the atom, the
		// stylesheet owns applicability. Pinned so a future runtime-condition
		// story on web cannot silently change this contract.
		expect(registry?.get(atomOf({ _hover: { $text: { color: "$red-500" } } }))).toBe(
			"_hover__color",
		);
	});
});
