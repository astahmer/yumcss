import { describe, expect, test } from "vitest";
import {
	ADAPTER_PLUGIN_SCHEMA,
	createBuiltinCodemodCatalog,
	createStyleAdapterPlugin,
	createStyleAdapterRegistry,
	readAdapterPackageDeclaration,
	getCodemodAdapter,
	StyleProgramCompatibility,
} from "../src/swap/index.ts";

describe("third-party adapter registry", () => {
	test("discovers a plugin module in the canonical migration routes", async () => {
		const registry = createStyleAdapterRegistry();
		const emotion = createBuiltinCodemodCatalog().registry.get("emotion")!;
		const plugin = createStyleAdapterPlugin("test-plugin", [emotion]);
		expect(plugin.schema).toBe(ADAPTER_PLUGIN_SCHEMA);
		expect(plugin.manifest.adapters[0]?.id).toBe("emotion");
		expect(plugin.manifest.core).toEqual(StyleProgramCompatibility.current());
		const results = await registry.discover(["test-plugin"], { load: async () => plugin });
		expect(results[0]).toMatchObject({ registered: ["emotion"], errors: [] });
		expect(registry.get("emotion")).toBe(emotion);
		expect(registry.resolveRoute("emotion", "emotion").target.id).toBe("emotion");
	});

	test("reads the package manifest convention and validates adapter metadata", () => {
		expect(
			readAdapterPackageDeclaration({
				pandwind: { plugin: "./dist/plugin.js", manifest: "./dist/manifest.json" },
			}),
		).toEqual({ plugin: "./dist/plugin.js", manifest: "./dist/manifest.json" });
		const plugin = createStyleAdapterPlugin("bad-manifest", [
			createBuiltinCodemodCatalog().registry.get("emotion")!,
		]);
		const registry = createStyleAdapterRegistry();
		expect(() =>
			registry.registerPlugin({
				...plugin,
				manifest: {
					...plugin.manifest,
					adapters: [{ ...plugin.manifest.adapters[0]!, version: "999" }],
				},
			}),
		).toThrow(/manifest version/);
	});

	test("rejects plugins built for an incompatible semantic core", () => {
		const plugin = createStyleAdapterPlugin("future-core", [
			createBuiltinCodemodCatalog().registry.get("emotion")!,
		]);
		const registry = createStyleAdapterRegistry();

		expect(() =>
			registry.registerPlugin({
				...plugin,
				manifest: {
					...plugin.manifest,
					core: { ...plugin.manifest.core, versionRange: "^2" },
				},
			}),
		).toThrow(/core version range/);
	});

	test("rejects manifests whose declared capabilities drift from the adapter", () => {
		const plugin = createStyleAdapterPlugin("drifted-capabilities", [
			createBuiltinCodemodCatalog().registry.get("emotion")!,
		]);
		const registry = createStyleAdapterRegistry();

		expect(() =>
			registry.registerPlugin({
				...plugin,
				manifest: {
					...plugin.manifest,
					adapters: [{ ...plugin.manifest.adapters[0]!, capabilities: {} }],
				},
			}),
		).toThrow(/manifest capabilities/);
	});

	test("rejects manifests whose documented API evidence drifts from the adapter", () => {
		const plugin = createStyleAdapterPlugin("drifted-api-evidence", [
			createBuiltinCodemodCatalog().registry.get("emotion")!,
		]);
		const registry = createStyleAdapterRegistry();

		expect(() =>
			registry.registerPlugin({
				...plugin,
				manifest: {
					...plugin.manifest,
					adapters: [
						{
							...plugin.manifest.adapters[0]!,
							officialApi: {
								...plugin.manifest.adapters[0]!.officialApi,
								apis: [],
							},
						},
					],
				},
			}),
		).toThrow(/manifest official API/);
	});

	test("ships expanded ecosystem adapters as ordinary registry entries", () => {
		const registry = createBuiltinCodemodCatalog().registry;
		expect(registry.get("fela")).toBeDefined();
		expect(registry.get("goober")).toBeDefined();
		expect(registry.get("aphrodite")).toBeDefined();
		expect(getCodemodAdapter("fela")?.dependencies.packages[0]?.name).toBe("fela");
		expect(registry.get("compiled")).toBeDefined();
		expect(registry.get("react-native")).toBeDefined();
		expect(registry.get("bamboo")).toBeDefined();
		expect(registry.get("next-yak")).toBeDefined();
		expect(registry.get("chakra-ui")).toBeDefined();
		expect(registry.get("mui")).toBeDefined();
		expect(registry.get("mantine")).toBeDefined();
	});

	test("discovers only dependencies that advertise the package contract", async () => {
		const registry = createStyleAdapterRegistry();
		const plugin = createStyleAdapterPlugin("declared-plugin", [
			createBuiltinCodemodCatalog().registry.get("emotion")!,
		]);
		const results = await registry.discoverPackages(
			{
				dependencies: { "declared-adapter": "1.0.0", unrelated: "1.0.0" },
			},
			{
				loadPackageJson: async (specifier) =>
					specifier === "declared-adapter" ? { pandwind: { plugin: "./dist/plugin.js" } } : {},
				load: async () => plugin,
			},
		);
		expect(results).toEqual([
			{ specifier: "declared-adapter", registered: ["emotion"], errors: [] },
		]);
	});
});
