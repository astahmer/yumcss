import { describe, expect, test } from "vitest";
import {
	STYLE_BACKEND_SCHEMA,
	STYLE_BACKENDS,
	createStyleBackendRegistry,
	type StyleBackendFactory,
} from "../src/backends/index.ts";

describe("style backend registry", () => {
	test("exposes all built-in lowering lanes through one factory contract", () => {
		expect(STYLE_BACKENDS.factories.map((factory) => factory.id)).toEqual([
			"css",
			"object",
			"react-native",
			"opentui",
		]);
		expect(STYLE_BACKENDS.create("css").name).toBe("css");
		expect(STYLE_BACKENDS.create("react-native").name).toBe("react-native");
		expect(STYLE_BACKENDS.create("opentui").name).toBe("opentui");
	});

	test("allows a new target without changing callers", () => {
		const fake: StyleBackendFactory = {
			schema: STYLE_BACKEND_SCHEMA,
			id: "test-target",
			capabilities: STYLE_BACKENDS.factories[0]!.capabilities,
			create: () => ({ name: "test-target", declare: (key, value) => `${key}:${value}` }),
		};
		const registry = createStyleBackendRegistry().register(fake);
		expect(registry.create<string>("test-target").declare("color", "red")).toBe("color:red");
	});

	test("keeps the extension point as a factory registry", () => {
		const factory = STYLE_BACKENDS.factories[0]!;
		const registry = createStyleBackendRegistry().register(factory);
		expect(registry.factories.map((entry) => entry.id)).toEqual([factory.id]);
	});
});
