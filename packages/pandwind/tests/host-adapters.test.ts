import { describe, expect, test } from "vitest";
import {
	getHostStyleAdapter,
	HOST_STYLE_ADAPTERS,
	createHostStyleRegistry,
	HOST_STYLE_PLUGIN_SCHEMA,
	type HostStylePlugin,
} from "../src/host/index.ts";

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

	test("accepts a third-party host through the plugin contract", () => {
		const plugin: HostStylePlugin = {
			schema: HOST_STYLE_PLUGIN_SCHEMA,
			id: "custom-host",
			adapter: {
				id: "custom-host",
				classProp: "class",
				styleProp: "style",
				supportsStyleObject: true,
				packageHints: ["custom-host"],
				classProps: (className) => ({ class: className }),
				styleProps: (style) => ({ style }),
			},
		};
		expect(createHostStyleRegistry().register(plugin).get("custom-host")?.classProp).toBe("class");
	});
});
