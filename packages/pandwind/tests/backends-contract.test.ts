import { describe, expect, test } from "vitest";
import {
	STYLE_BACKENDS,
	STYLE_BACKEND_SCHEMA,
	createStyleBackendRegistry,
	externalBackendId,
	type StyleBackendFactory,
} from "../src/backends/index.ts";

const backendOptions = (id: string) => (id === "object" ? { name: id } : undefined);

describe("style backend contract matrix", () => {
	test("every built-in plugin publishes a typed capability contract", () => {
		for (const factory of STYLE_BACKENDS.factories) {
			expect(factory.schema).toBe(STYLE_BACKEND_SCHEMA);
			expect(factory.capabilities.schema).toBe("pandwind.style-backend-capabilities/1");
			expect(factory.capabilities.features.declarations).toMatch(/unsupported|partial|exact/);
			expect(factory.create(backendOptions(factory.id)).name).toBe(factory.id);
		}
	});

	test("every built-in backend handles a common declaration", () => {
		for (const factory of STYLE_BACKENDS.factories) {
			const backend = factory.create(backendOptions(factory.id));
			expect(backend.declare("color", "red")).toBeDefined();
		}
	});

	test("third-party backends can register without changing the built-in root", () => {
		const fake: StyleBackendFactory = {
			schema: STYLE_BACKEND_SCHEMA,
			id: externalBackendId("contract-target"),
			capabilities: STYLE_BACKENDS.factories[0]!.capabilities,
			create: () => ({ name: "contract-target", declare: (key, value) => `${key}:${value}` }),
		};
		const registry = createStyleBackendRegistry(STYLE_BACKENDS.factories).register(fake);
		expect(registry.get("contract-target")).toBe(fake);
		expect(STYLE_BACKENDS.get("contract-target")).toBeUndefined();
	});
});
