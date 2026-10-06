import { describe, expect, test } from "vitest";
import { applySourceEdits } from "../src/vite/source-edits.ts";

describe("source edits", () => {
	test("applies large disjoint edit sets in one source pass", () => {
		const source = "ab".repeat(2_000);
		const edits = Array.from({ length: 2_000 }, (_, index) => ({
			start: index * 2,
			end: index * 2 + 1,
			text: "x",
		}));

		expect(applySourceEdits(source, edits)).toBe("xb".repeat(2_000));
	});

	test("preserves right-to-left behavior for overlapping edits", () => {
		expect(
			applySourceEdits("abcdef", [
				{ start: 1, end: 5, text: "O" },
				{ start: 2, end: 3, text: "I" },
			]),
		).toBe("aOf");
	});
});
