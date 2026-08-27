import { describe, expect, test } from "vitest";
import { getHostStyleAdapter, HOST_STYLE_ADAPTERS } from "../src/host/index.ts";

describe("renderer-neutral host style adapters", () => {
	test("covers the supported host syntax families", () => {
		expect(Object.keys(HOST_STYLE_ADAPTERS)).toEqual([
			"react",
			"preact",
			"solid",
			"vue",
			"svelte",
			"astro",
		]);
		expect(getHostStyleAdapter("react")?.classProps("generated", "existing")).toEqual({
			className: "existing generated",
		});
		expect(getHostStyleAdapter("vue")?.classProps("generated")).toEqual({ class: "generated" });
		expect(getHostStyleAdapter("solid")?.styleProps({ color: "red" })).toEqual({
			style: { color: "red" },
		});
	});
});
