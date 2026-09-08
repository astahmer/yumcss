import { describe, expect, test } from "vitest";
import { SourcePass } from "../src/source-pass-utils.ts";

describe("SourcePass", () => {
	test("returns the original source for no edits and avoids sorting one edit", () => {
		const source = "const value = old;";

		expect(SourcePass.applyEdits(source, [])).toBe(source);
		expect(
			SourcePass.applyEdits(source, [
				{ start: source.indexOf("old"), end: source.indexOf("old") + 3, text: "new" },
			]),
		).toBe("const value = new;");
	});

	test("applies edits from right to left without shifting offsets", () => {
		const source = "const value = old;";
		expect(
			SourcePass.applyEdits(source, [
				{ start: 0, end: 5, text: "let" },
				{ start: source.indexOf("old"), end: source.indexOf("old") + 3, text: "new" },
			]),
		).toBe("let value = new;");
	});

	test("keeps insertion order at a shared source position", () => {
		expect(
			SourcePass.applyEdits("ab", [
				{ start: 0, end: 0, text: "first" },
				{ start: 0, end: 0, text: "second" },
			]),
		).toBe("firstsecondab");
	});

	test("rejects overlapping source ranges", () => {
		expect(() =>
			SourcePass.applyEdits("abcdef", [
				{ start: 0, end: 3, text: "first" },
				{ start: 2, end: 4, text: "second" },
			]),
		).toThrow();
	});

	test("matches nested blocks and returns the exclusive end", () => {
		const source = "css({ color: red, states: { hover: { color: blue } } })";
		const block = SourcePass.matchBlock(source, source.indexOf("{"));
		expect(block).toEqual({
			body: " color: red, states: { hover: { color: blue } } ",
			end: source.lastIndexOf("}") + 1,
		});
	});

	test("inserts an indented skip marker at the containing line", () => {
		expect(
			SourcePass.insertSkipMarker(
				"  css({ color: value });",
				10,
				"dynamic",
				"pandwind:migrate-skip",
			),
		).toBe("  // pandwind:migrate-skip (dynamic)\n  css({ color: value });");
	});
});
