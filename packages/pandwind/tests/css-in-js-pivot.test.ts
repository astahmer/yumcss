import { describe, expect, test } from "vitest";
import { getHostStyleAdapter, HOST_STYLE_REGISTRY } from "../src/host/index.ts";
import { createRuntimeSheet, type RuntimeSheetSnapshot } from "../src/css/runtime.ts";

interface FakeStyle {
	tagName: string;
	textContent: string;
	nonce?: string;
	attributes: Map<string, string>;
	setAttribute(name: string, value: string): void;
	remove(): void;
}

function fakeDocument(): { document: DocumentLike; styles: FakeStyle[] } {
	const styles: FakeStyle[] = [];
	const document: DocumentLike = {
		querySelector: (selector) =>
			styles.find((style) => {
				const id = style.attributes.get("data-pandwind-sheet");
				return selector === `style[data-pandwind-sheet="${id ?? ""}"]`;
			}) ?? null,
		createElement: () => {
			const style: FakeStyle = {
				tagName: "STYLE",
				textContent: "",
				attributes: new Map(),
				setAttribute(name, value) {
					this.attributes.set(name, value);
				},
				remove() {
					const index = styles.indexOf(this);
					if (index !== -1) styles.splice(index, 1);
				},
			};
			styles.push(style);
			return style;
		},
		head: { appendChild: () => undefined },
	};
	return { document, styles };
}

interface DocumentLike {
	querySelector(selector: string): FakeStyle | null;
	createElement(name: string): FakeStyle;
	head: { appendChild(element: FakeStyle): void };
}

const semanticRules = [
	{
		kind: "global" as const,
		selector: "body",
		declarations: [{ property: "margin", value: 0 }],
	},
	{
		kind: "layer" as const,
		layer: "components",
		children: [
			{
				kind: "style" as const,
				selector: ".card",
				conditions: ["hover"],
				declarations: [{ property: "color", value: "red" }],
			},
		],
	},
	{
		kind: "keyframes" as const,
		name: "fade",
		children: [
			{
				kind: "style" as const,
				selector: "from",
				declarations: [{ property: "opacity", value: 0 }],
			},
			{ kind: "style" as const, selector: "to", declarations: [{ property: "opacity", value: 1 }] },
		],
	},
];

describe("CSS-in-JS pivot runtime and host fixtures", () => {
	test("mounts one browser sheet, preserves order, and hydrates an SSR snapshot", () => {
		const server = createRuntimeSheet({ autoMount: false });
		server.registerSemanticRules(semanticRules);
		const snapshot: RuntimeSheetSnapshot = server.snapshot();

		const browser = fakeDocument();
		const client = createRuntimeSheet({ document: browser.document, autoMount: true });
		client.hydrate(snapshot);

		expect(browser.styles).toHaveLength(1);
		expect(browser.styles[0]?.textContent).toBe(server.css());
		expect(client.css()).toBe(server.css());

		client.registerSemanticRules([semanticRules[0]!]);
		expect(browser.styles).toHaveLength(1);
		expect(browser.styles[0]?.textContent).toBe(server.css());
		expect(server.css()).toContain("body{margin:0}");
		expect(server.css()).toContain("@layer components{.card:hover{color:red}}");
		expect(server.css()).toContain("@keyframes fade{from{opacity:0}to{opacity:1}}");
	});

	test("keeps host framework class and style bindings renderer-neutral", () => {
		for (const adapter of HOST_STYLE_REGISTRY.adapters) {
			const classProps = adapter.classProps("pw-card", "existing");
			const styleProps = adapter.styleProps({ color: "red", opacity: 0.5 });
			expect(classProps[adapter.classProp]).toBe("existing pw-card");
			expect(styleProps.style).toEqual({ color: "red", opacity: 0.5 });
			expect(adapter.packageHints.length).toBeGreaterThan(0);
		}
	});
});
