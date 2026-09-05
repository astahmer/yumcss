import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { h } from "preact";
import renderPreactToString from "preact-render-to-string";
import { renderToString } from "solid-js/web";
import { Stack as PreactStack } from "../src/stack/preact.ts";
import { Stack as ReactStack } from "../src/stack/react.tsx";
import { Stack as SolidStack } from "../src/stack/solid.tsx";
import { Stack as VueStack } from "../src/stack/vue.ts";

const stackInput = {
	direction: "column" as const,
	gap: "4",
	padding: "6",
	align: "center" as const,
	justify: "between" as const,
};

describe("Stack renderer family", () => {
	test("React preserves the shared class contract and forwards HTML attributes", () => {
		const output = renderToStaticMarkup(
			ReactStack({ ...stackInput, className: "custom", id: "react-stack", children: "content" }),
		);

		expect(output).toMatchInlineSnapshot(
			`"<div id="react-stack" class="flex flex-col gap-4 p-6 items-center justify-between custom">content</div>"`,
		);
		expect(output).toContain('id="react-stack"');
		expect(output).toContain('class="flex flex-col gap-4 p-6 items-center justify-between custom"');
	});

	test("Solid preserves the shared class contract and uses class", () => {
		const output = renderToString(() =>
			SolidStack({ ...stackInput, class: "custom", id: "solid-stack", children: "content" }),
		);
		const normalized = output
			.replace(/ data-hk="[^"]+"/, "")
			.replace(/class="([^"]*)\s+"/, 'class="$1"')
			.replace(/\s+>/, ">");

		expect(normalized).toMatchInlineSnapshot(
			`"<div id="solid-stack" class="flex flex-col gap-4 p-6 items-center justify-between custom">content</div>"`,
		);
		expect(normalized).toBe(
			`<div id="solid-stack" class="flex flex-col gap-4 p-6 items-center justify-between custom">content</div>`,
		);
		expect(output).toContain('id="solid-stack"');
		expect(normalized).toContain(
			'class="flex flex-col gap-4 p-6 items-center justify-between custom"',
		);
	});

	test("Vue delegates attrs, slots, and class normalization to Vue", () => {
		if (VueStack.setup === undefined) throw new Error("Vue Stack setup is missing");
		const render = (
			VueStack.setup as unknown as (
				props: typeof stackInput,
				context: { attrs: Record<string, unknown>; slots: { default: () => string } },
			) => () => unknown
		)(stackInput, {
			attrs: { class: "custom", id: "vue-stack" },
			slots: { default: () => "content" },
		});
		const vnode = render?.() as {
			type: unknown;
			props: Record<string, unknown>;
			children: unknown;
		};

		expect({ type: vnode.type, props: vnode.props, children: vnode.children })
			.toMatchInlineSnapshot(`
			{
			  "children": "content",
			  "props": {
			    "class": "flex flex-col gap-4 p-6 items-center justify-between custom",
			    "id": "vue-stack",
			  },
			  "type": "div",
			}
		`);
		expect(vnode.props.id).toBe("vue-stack");
		expect(vnode.props.class).toBe("flex flex-col gap-4 p-6 items-center justify-between custom");
	});

	test("Preact preserves the shared class contract and forwards HTML attributes", () => {
		const output = renderPreactToString(
			h(PreactStack, { ...stackInput, className: "custom", id: "preact-stack" }, "content"),
		);

		expect(output).toMatchInlineSnapshot(
			`"<div id="preact-stack" class="flex flex-col gap-4 p-6 items-center justify-between custom">content</div>"`,
		);
		expect(output).toContain('id="preact-stack"');
		expect(output).toContain('class="flex flex-col gap-4 p-6 items-center justify-between custom"');
	});
});
