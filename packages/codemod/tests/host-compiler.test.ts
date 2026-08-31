import { describe, expect, test } from "vitest";
import {
	HOST_COMPILER_PLUGINS,
	HOST_COMPILER_SCHEMA,
	createHostCompilerPlugin,
	getHostComponentRewriter,
	BuiltinHostFramework,
} from "../src/swap/index.ts";

describe("framework-native host compiler contract", () => {
	test("registers every supported host with one versioned shape", () => {
		expect(Object.keys(HOST_COMPILER_PLUGINS)).toEqual([
			BuiltinHostFramework.React,
			BuiltinHostFramework.ReactNative,
			BuiltinHostFramework.Preact,
			BuiltinHostFramework.Solid,
			BuiltinHostFramework.Qwik,
			BuiltinHostFramework.Vue,
			BuiltinHostFramework.Svelte,
			BuiltinHostFramework.Astro,
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

	test("rewrites JSX subjects with nested expressions without duplicating style props", () => {
		const rewriter = getHostComponentRewriter("react");
		expect(rewriter).toBeDefined();
		const result = rewriter!.rewrite({
			source:
				'// <Card />\nconst example = "<Card />";\nconst view = <Card data={enabled ? ">" : "<"} style={props.style} />;',
			file: "App.tsx",
			binding: "Card",
			tag: "div",
			framework: "react",
			classExpression: "card.class",
			styleExpression: "card.style",
		});
		expect(result.changed).toBe(true);
		expect(result.code).toBe(
			'// <Card />\nconst example = "<Card />";\nconst view = <div data={enabled ? ">" : "<"} style={props.style} className={card.class} />;',
		);
	});

	test("preserves self-closing template hosts", () => {
		const rewriter = getHostComponentRewriter("vue");
		expect(rewriter).toBeDefined();
		const result = rewriter!.rewrite({
			source: '<Card data-id="example" />',
			file: "App.vue",
			binding: "Card",
			tag: "div",
			framework: "vue",
			classExpression: "card.class",
		});
		expect(result.changed).toBe(true);
		expect(result.residuals).toEqual([]);
		expect(result.code).toBe('<div data-id="example" :class="card.class" />');
	});
});
