import { describe, expect, test } from "vitest";
import { filterNamed, makeTextMatcher } from "./filter.ts";

describe("makeTextMatcher", () => {
	test("case-insensitive substring", () => {
		const m = makeTextMatcher("RED");
		expect(m("red-500")).toBe(true);
		expect(m("bg-blue-500")).toBe(false);
	});
	test("empty query matches everything", () => {
		const m = makeTextMatcher("");
		expect(m("anything")).toBe(true);
	});
});

describe("filterNamed", () => {
	const entries = [
		{ name: "red-500", value: "#ef4444" },
		{ name: "blue-500", value: "#3b82f6" },
	];
	test("filters by name", () => {
		expect(filterNamed(entries, makeTextMatcher("red"))).toEqual([entries[0]]);
	});
	test("searchable extras participate", () => {
		const out = filterNamed(entries, makeTextMatcher("#3b82f6"), (e) => [String(e.value)]);
		expect(out).toEqual([entries[1]]);
	});
	test("no-match empties the list", () => {
		expect(filterNamed(entries, makeTextMatcher("zzz"))).toEqual([]);
	});
});
