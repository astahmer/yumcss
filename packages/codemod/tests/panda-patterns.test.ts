import { describe, expect, test } from "vitest";
import { BUILTIN_PATTERNS, expandBuiltinPattern } from "../src/swap/adapters/panda/patterns.ts";

describe("Panda builtin pattern lowering", () => {
	test.each([...BUILTIN_PATTERNS])(
		"expands the %s pattern without dropping shared props",
		(name) => {
			const result = expandBuiltinPattern(name, { padding: 4, color: "red" });
			expect(result.consumed).toContain("padding");
			expect(result.style).toMatchObject({ padding: 4, color: "red" });
		},
	);

	test("expands stack direction and alignment aliases", () => {
		const result = expandBuiltinPattern("stack", {
			direction: "row",
			align: "center",
			justify: "space-between",
		});
		expect(result.style).toMatchObject({
			display: "flex",
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
		});
	});

	test("expands flex, grid, and sizing patterns", () => {
		expect(expandBuiltinPattern("flex", { direction: "row", grow: 1 }).style).toMatchObject({
			display: "flex",
			flexDirection: "row",
			flexGrow: 1,
		});
		expect(expandBuiltinPattern("grid", { columns: 2, rows: 3, gap: 4 }).style).toMatchObject({
			display: "grid",
			gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
			gridTemplateRows: "repeat(3, minmax(0, 1fr))",
			gap: 4,
		});
		expect(expandBuiltinPattern("circle", { size: 10 }).style).toMatchObject({
			borderRadius: "9999px",
			width: 10,
			height: 10,
		});
		expect(expandBuiltinPattern("square", { size: 12 }).style).toMatchObject({
			width: 12,
			height: 12,
		});
	});

	test("leaves an unknown custom pattern for config evaluation", () => {
		const result = expandBuiltinPattern("custom", { padding: 4 });
		expect(result.style).toEqual({});
		expect(result.consumed).toEqual(new Set());
	});
});
