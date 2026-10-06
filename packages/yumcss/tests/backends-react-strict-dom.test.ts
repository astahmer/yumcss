import { describe, expect, test } from "vitest";
import {
	createReactStrictDomBackend,
	ReactStrictDomPlatform,
} from "../src/backends/react-strict-dom.ts";

describe("React Strict DOM web backend", () => {
	test("returns StyleX-compatible compiled style objects", () => {
		const backend = createReactStrictDomBackend();
		const style = backend.resolve({
			color: "red",
			_hover: { color: "blue" },
		});

		expect(style.$$css).toBe(true);
		expect(style.color).toMatch(/^x/);
		expect(style._hover__color).toMatch(/^x/);
		expect(Object.keys(style)).toEqual(["color", "_hover__color"]);
	});

	test("merges compiled style maps with last declaration winning", () => {
		const backend = createReactStrictDomBackend({
			classNamePrefix: "rsd",
		});
		const first = backend.resolve({ color: "red", padding: "4px" });
		const second = backend.resolve({ color: "blue" });
		const merged = backend.merge(first, second);

		expect(merged.$$css).toBe(true);
		expect(merged.color).toBe(second.color);
		expect(merged.padding).toBe(first.padding);
		expect(merged.color).toMatch(/^rsd/);
	});
});

describe("React Strict DOM native backend", () => {
	test("uses the native object policy behind the same target id", () => {
		const backend = createReactStrictDomBackend({
			platform: ReactStrictDomPlatform.Native,
		});

		expect(backend.resolve({ padding: "4px", color: "red" })).toEqual({
			padding: 4,
			color: "red",
		});
		expect(backend.declare("borderRadius", "4px 8px")).toEqual({
			borderTopLeftRadius: 4,
			borderTopRightRadius: 8,
			borderBottomRightRadius: 4,
			borderBottomLeftRadius: 8,
		});
	});
});
