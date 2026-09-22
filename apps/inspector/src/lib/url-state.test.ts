import { describe, expect, test } from "vitest";
import { readInspectorUrlState, serializeInspectorUrlState } from "./url-state.ts";

describe("inspector URL state", () => {
	test("reads tab, query, and section deep links", () => {
		expect(readInspectorUrlState({ search: "?q=blue%20100", hash: "#design/sec-colors" })).toEqual({
			tab: "design",
			query: "blue 100",
			section: "sec-colors",
		});
	});

	test("accepts a section-only hash", () => {
		expect(readInspectorUrlState({ search: "", hash: "#sec-spacing" })).toEqual({
			tab: "design",
			query: "",
			section: "sec-spacing",
		});
	});

	test("opens the merged usage and cleanup view", () => {
		expect(readInspectorUrlState({ search: "", hash: "#usage" })).toEqual({
			tab: "usage",
			query: "",
			section: null,
		});
	});

	test("serializes stable shareable state and preserves unrelated params", () => {
		expect(
			serializeInspectorUrlState(
				{ tab: "stats", query: "runtime", section: null },
				"token=studio&tab=design",
			),
		).toBe("?token=studio&q=runtime#stats");
	});
});
