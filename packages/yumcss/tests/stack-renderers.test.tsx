import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { h } from "preact";
import { createTextVNode, isVNode, type SetupContext, type VNode } from "vue";
import renderPreactToString from "preact-render-to-string";
import { renderToString } from "solid-js/web";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createNamedAtomsStrategy } from "../src/css/named-atoms-strategy.ts";
import { createStack as createPreactStack, Stack as PreactStack } from "../src/stack/preact.ts";
import { createStack as createReactStack, Stack as ReactStack } from "../src/stack/react.tsx";
import { createStack as createSolidStack, Stack as SolidStack } from "../src/stack/solid.tsx";
import { createStack as createVueStack, Stack as VueStack } from "../src/stack/vue.ts";

const stackInput = {
	direction: "column" as const,
	gap: "4",
	padding: "6",
	align: "center" as const,
	justify: "between" as const,
};

const configuredCss = createUnsafeCss({
	className: createNamedAtomsStrategy("app"),
});
const configuredInput = { ...stackInput, gap: "4px", padding: "1rem" };
const configuredClassName =
	"app-display-flex app-flexDirection-column app-gap-4px app-padding-1rem " +
	"app-alignItems-center app-justifyContent-space-between";

const vueSetupContext = (attrs: Record<string, unknown>, child: VNode): SetupContext => ({
	attrs,
	slots: { default: () => [child] },
	emit: () => undefined,
	expose: () => undefined,
});

const isRenderFunction = (value: unknown): value is () => VNode => typeof value === "function";

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
		const setup = VueStack.setup;
		if (setup === undefined) throw new Error("Vue Stack setup is missing");
		const child = createTextVNode("content");
		const render = setup(stackInput, vueSetupContext({ class: "custom", id: "vue-stack" }, child));
		if (!isRenderFunction(render))
			throw new Error("Vue Stack setup did not return a render function");
		const rendered = render();
		if (!isVNode(rendered)) throw new Error("Vue Stack render did not return a VNode");

		expect(rendered.type).toBe("div");
		expect(rendered.props).toMatchObject({
			id: "vue-stack",
			class: "flex flex-col gap-4 p-6 items-center justify-between custom",
		});
		expect(rendered.children).toEqual([child]);
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

	test("createStack binds every renderer to the supplied class-name strategy", () => {
		const configuredReact = createReactStack(configuredCss);
		const reactOutput = renderToStaticMarkup(
			configuredReact({ ...configuredInput, id: "react-configured", children: "content" }),
		);
		expect(reactOutput).toContain(`class="${configuredClassName}"`);

		const configuredSolid = createSolidStack(configuredCss);
		const solidOutput = renderToString(() =>
			configuredSolid({ ...configuredInput, id: "solid-configured", children: "content" }),
		);
		expect(solidOutput.replace(/\s+"/, '"')).toContain(`class="${configuredClassName}"`);

		const configuredVue = createVueStack(configuredCss);
		const configuredSetup = configuredVue.setup;
		if (configuredSetup === undefined) throw new Error("Configured Vue Stack setup is missing");
		const configuredChild = createTextVNode("content");
		const vueRender = configuredSetup(
			configuredInput,
			vueSetupContext({ class: "custom", id: "vue-configured" }, configuredChild),
		);
		if (!isRenderFunction(vueRender)) {
			throw new Error("Configured Vue Stack setup did not return a render function");
		}
		const rendered = vueRender();
		if (!isVNode(rendered)) throw new Error("Configured Vue Stack render did not return a VNode");
		expect(rendered.props).toMatchObject({
			id: "vue-configured",
			class: `${configuredClassName} custom`,
		});
		expect(rendered.children).toEqual([configuredChild]);

		const configuredPreact = createPreactStack(configuredCss);
		const preactOutput = renderPreactToString(
			h(configuredPreact, { ...configuredInput, id: "preact-configured" }, "content"),
		);
		expect(preactOutput).toContain(`class="${configuredClassName}"`);
	});
});
