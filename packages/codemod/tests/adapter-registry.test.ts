import { describe, expect, test } from "vitest";
import {
	ADAPTER_PLUGIN_SCHEMA,
	EXTERNAL_ADAPTER_REGISTRY,
	EXTERNAL_ADAPTERS,
	createStyleAdapterPlugin,
	createStyleAdapterRegistry,
	getExternalAdapter,
} from "../src/swap/index.ts";

describe("third-party adapter registry", () => {
	test("discovers a plugin module and projects it into migration routes", async () => {
		const registry = createStyleAdapterRegistry();
		const plugin = createStyleAdapterPlugin("test-plugin", [EXTERNAL_ADAPTERS.emotion!]);
		expect(plugin.schema).toBe(ADAPTER_PLUGIN_SCHEMA);
		const results = await registry.discover(["test-plugin"], { load: async () => plugin });
		expect(results[0]).toMatchObject({ registered: ["emotion"], errors: [] });
		expect(registry.get("emotion")).toBe(EXTERNAL_ADAPTERS.emotion);
		expect(registry.toStyleSystemRegistry().resolveRoute("emotion", "emotion").target.id).toBe(
			"emotion",
		);
	});

	test("ships expanded ecosystem adapters as ordinary registry entries", () => {
		expect(EXTERNAL_ADAPTER_REGISTRY.get("fela")).toBeDefined();
		expect(EXTERNAL_ADAPTER_REGISTRY.get("goober")).toBeDefined();
		expect(EXTERNAL_ADAPTER_REGISTRY.get("aphrodite")).toBeDefined();
		expect(getExternalAdapter("fela")?.dependencies.packages[0]?.name).toBe("fela");
	});
});
