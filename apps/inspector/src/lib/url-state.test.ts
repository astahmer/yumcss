import { describe, expect, test } from "vitest";
import { readInspectorUrlState, serializeInspectorUrlState } from "./url-state.ts";

describe("inspector URL state", () => {
	test("reads tab, query, and section deep links", () => {
		expect(readInspectorUrlState({ search: "?q=blue%20100", hash: "#tokens/sec-colors" })).toEqual({
			tab: "tokens",
			query: "blue 100",
			section: "sec-colors",
		});
	});

	test("ignores retired section-only hashes", () => {
		expect(readInspectorUrlState({ search: "", hash: "#sec-spacing" })).toEqual({
			tab: "tokens",
			query: "",
			section: null,
		});
	});

	test("opens token usage and cleanup as a section of the Tokens view", () => {
		expect(readInspectorUrlState({ search: "", hash: "#tokens/usage" })).toEqual({
			tab: "tokens",
			query: "",
			section: "usage",
		});
	});

	test("opens token relationships as a section of the Tokens view", () => {
		expect(readInspectorUrlState({ search: "", hash: "#tokens/relationships" })).toEqual({
			tab: "tokens",
			query: "",
			section: "relationships",
		});
	});

	test("opens the Build report", () => {
		expect(readInspectorUrlState({ search: "", hash: "#build" })).toEqual({
			tab: "build",
			query: "",
			section: null,
		});
	});

	test("serializes stable shareable state and preserves unrelated params", () => {
		expect(
			serializeInspectorUrlState(
				{ tab: "build", query: "runtime", section: null },
				"token=session&tab=design",
			),
		).toBe("?token=session&q=runtime#build");
	});
	test("uses the URL hash instead of the retired tab query parameter", () => {
		expect(readInspectorUrlState({ search: "?tab=history", hash: "" })).toEqual({
			tab: "tokens",
			query: "",
			section: null,
		});
	});
});
