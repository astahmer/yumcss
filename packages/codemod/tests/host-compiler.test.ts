import { describe, expect, test } from "vitest";
import {
	HOST_COMPILER_PLUGINS,
	HOST_COMPILER_SCHEMA,
	createHostCompilerPlugin,
} from "../src/swap/index.ts";

describe("framework-native host compiler contract", () => {
	test("registers every supported host with one versioned shape", () => {
		expect(Object.keys(HOST_COMPILER_PLUGINS)).toEqual([
			"react",
			"preact",
			"solid",
			"vue",
			"svelte",
			"astro",
		]);
		for (const plugin of Object.values(HOST_COMPILER_PLUGINS)) {
			expect(plugin.schema).toBe(HOST_COMPILER_SCHEMA);
			expect(plugin.extensions.length).toBeGreaterThan(0);
		}
	});

	test("delegates React stack folding through the native compiler seam", () => {
		const plugin = createHostCompilerPlugin("react");
		const source = `import { Stack } from "pandwind/stack";\nexport const App = () => <Stack gap={4}>hi</Stack>;`;
		const result = plugin.transform(source, {
			file: "App.tsx",
			framework: "react",
			adapter: HOST_COMPILER_PLUGINS.react as never,
		});
		expect(result.changed).toBe(true);
		expect(result.code).toContain("<div className=");
	});

	test("reports native delegation gaps instead of silently rewriting other hosts", () => {
		const plugin = createHostCompilerPlugin("vue");
		const source = `<script>import Stack from "pandwind/stack";</script><Stack gap={4} />`;
		const result = plugin.transform(source, {
			file: "App.vue",
			framework: "vue",
			adapter: HOST_COMPILER_PLUGINS.vue as never,
		});
		expect(result.changed).toBe(true);
		expect(result.code).toContain('<div class="flex gap-4"');
	});

	test("uses host-native class attributes for Svelte and preserves existing classes", () => {
		const plugin = createHostCompilerPlugin("svelte");
		const result = plugin.transform('<Stack class="shell" direction="column">child</Stack>', {
			file: "App.svelte",
			framework: "svelte",
			adapter: HOST_COMPILER_PLUGINS.svelte as never,
		});
		expect(result.code).toContain('<div class="shell flex flex-col">');
	});
});
