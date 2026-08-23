/** The CLI's diff/report helpers — real hunks, honest completeness scores. */
import { describe, expect, test } from "vitest";
import { unifiedDiff } from "../src/cli.ts";

describe("unifiedDiff", () => {
	test("no changes -> empty output", () => {
		expect(unifiedDiff("a\nb\n", "a\nb\n", "f.ts")).toBe("");
	});

	test("insertions produce one hunk with correct numbers", () => {
		const out = unifiedDiff("a\nb\nc\n", "a\nX\nb\nc\n", "f.ts");
		const lines = out.split("\n");
		expect(lines[0]).toBe("--- a/f.ts");
		expect(lines[2]).toMatch(/^@@ -1,\d+ \+1,\d+ @@$/);
		expect(lines).toContain("+X");
		expect(out).not.toContain("-b");
	});

	test("deletions and edits align without phantom churn", () => {
		const before = "one\ntwo\nthree";
		const after = "one\nTWO\nthree";
		const out = unifiedDiff(before, after, "f.ts");
		expect(out).toContain("-two");
		expect(out).toContain("+TWO");
		expect(out.match(/@@/g)).toHaveLength(1);
	});
});
