import { expect, test } from "vitest";
import { BuiltinHostFramework, CodemodAdapterId, runAdapterMigration } from "../src/swap/index.ts";

const source = [
	'<script setup lang="ts">',
	'import styled from "@vue-styled-components/core";',
	"const TabButton = styled.button<{ active: boolean }>`",
	'\tbackground: ${props => props.active ? "red" : "blue"};',
	"`;",
	"const ContentArea = styled.div.props({ color: String })(({ color }) => ({",
	"\tflex: 1,",
	"\tcolor,",
	'\tpadding: "2rem",',
	"}));",
	"</script>",
	"<template>",
	'\t<TabButton :active="true">Active</TabButton>',
	'\t<ContentArea color="red" />',
	"</template>",
].join("\n");

test("vue-styled dynamic components retain prop and function types in YumCSS output", () => {
	const result = runAdapterMigration(source, {
		from: CodemodAdapterId.VueStyled,
		to: CodemodAdapterId.YumCSS,
		file: "App.vue",
		mode: "safe",
		semantic: { source: { file: "App.vue", framework: BuiltinHostFramework.Vue } },
	});

	expect(result.converted).toBe(2);
	expect(result.skipped).toBe(0);
	expect(result.residuals).toEqual([]);
	expect(result.code).toContain('props: { "active": { type: Boolean, required: true } }');
	expect(result.code).toContain('h("button", { ..._props, ...attrs');
	expect(result.code).toContain("runtimeCss.vars");
	expect(result.code).not.toContain("runtimeCss.group({ flex: 1");
	expect(result.code).toMatchInlineSnapshot(`
		"<script setup lang="ts">
		import styled from "@vue-styled-components/core";
		import { computed, defineComponent, h } from "vue";
		import { createRuntimeCss } from "yumcss/css/runtime";
		import { defaultPreset } from "yumcss/preset/default";
		const runtimeCss = createRuntimeCss(defaultPreset);
		const TabButton = defineComponent({ props: { "active": { type: Boolean, required: true } }, inheritAttrs: false, setup(_props, { attrs: rawAttrs, slots }) { const attrs = rawAttrs; const props = computed(() => ({ ..._props, ...attrs })); const style = computed(() => runtimeCss.vars({ background: (props => props.active ? "red" : "blue")(props.value) })); return () => h("button", { ..._props, ...attrs, ...{}, class: [style.value.class, attrs.class], style: [style.value.style, attrs.style] }, slots.default?.()); } });
		const ContentArea = defineComponent({ props: { color: String }, inheritAttrs: false, setup(_props, { attrs: rawAttrs, slots }) { const attrs = rawAttrs; const props = computed(() => ({ ..._props, ...attrs })); const style = computed(() => runtimeCss.vars({ flex: 1, color: (({ color }) => color)(props.value), padding: "2rem" })); return () => h("div", { ...attrs, ...{}, class: [style.value.class, attrs.class], style: [style.value.style, attrs.style] }, slots.default?.()); } });
		</script>
		<template>
			<TabButton :active="true">Active</TabButton>
			<ContentArea color="red" />
		</template>"
	`);
});
