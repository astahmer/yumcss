import { describe, expect, test } from "vitest";
import {
	STYLE_BACKENDS,
	STYLE_BACKEND_SCHEMA,
	createStyleBackendRegistry,
	createStyleBackendContractSuite,
	STYLE_BACKEND_CONTRACT_SCHEMA,
	StyleBackendId,
	type StyleBackendFactory,
} from "../src/backends/index.ts";

const backendOptions = (id: string) => (id === StyleBackendId.Object ? { name: id } : undefined);

const contractFixtures = [
	{ backend: StyleBackendId.Css, declarations: { color: "red" } },
	{ backend: StyleBackendId.Object, options: { name: StyleBackendId.Object }, declarations: { color: "red" } },
	{ backend: StyleBackendId.ReactNative, declarations: { color: "red" } },
	{ backend: StyleBackendId.OpenTui, declarations: { color: "red" } },
] as const;

describe("style backend contract matrix", () => {
	test("runs one generic substitution suite for every built-in backend", () => {
		const result = createStyleBackendContractSuite().run(STYLE_BACKENDS, contractFixtures);
		expect(result.schema).toBe(STYLE_BACKEND_CONTRACT_SCHEMA);
		expect(result.valid).toBe(true);
		expect(result.checked).toEqual(STYLE_BACKENDS.factories.map((factory) => factory.id));
	});

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
			id: "contract-target",
			capabilities: STYLE_BACKENDS.factories[0]!.capabilities,
			create: () => ({ name: "contract-target", declare: (key, value) => `${key}:${value}` }),
		};
		const registry = createStyleBackendRegistry(STYLE_BACKENDS.factories).register(fake);
		expect(registry.get("contract-target")).toBe(fake);
		expect(STYLE_BACKENDS.get("contract-target")).toBeUndefined();
	});
});
