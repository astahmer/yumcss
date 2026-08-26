import { describe, expect, test } from "vitest";
import {
	createRuntimeCss,
	createRuntimeDesignCss,
	createRuntimeSheet,
} from "../src/css/runtime.ts";
import { examplePreset } from "../src/preset/example-preset.ts";

describe("runtime CSS-in-JS sheet", () => {
	test("collects preset-bound css() rules for SSR without a DOM", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });

		const className = css.class({ color: "$blue-500" });

		expect(className).toMatch(/^[a-z0-9]+$/);
		expect(sheet.css()).toContain("color:#3182ce");
		expect(sheet.snapshot().rules).toHaveLength(1);
	});

	test("deduplicates repeated declarations and preserves generated ordering", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });

		const first = css.class({ color: "$blue-500" });
		const second = css.class({ color: "$blue-500" });

		expect(second).toBe(first);
		expect(sheet.snapshot().rules).toHaveLength(1);
	});

	test("adds var-inline rules to the same runtime sheet", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeCss(examplePreset, { sheet });

		const result = css.vars({ color: "var(--external-color)" });

		expect(result.class).toBe("pw-color");
		expect(sheet.css()).toContain(".pw-color");
	});

	test("design css shares the preset-bound runtime path", () => {
		const sheet = createRuntimeSheet({ autoMount: false });
		const css = createRuntimeDesignCss(examplePreset, { sheet });

		css.class({ $text: { color: "$blue-500" } });

		expect(sheet.snapshot().rules).toHaveLength(1);
	});

	test("hydrates an SSR snapshot before registering new rules", () => {
		const server = createRuntimeSheet({ autoMount: false });
		server.setTokens(":root { --server-token: red; }");
		server.register([{ id: "a", css: ".a{color:red}", priority: 1 }]);

		const client = createRuntimeSheet({ autoMount: false });
		client.hydrate(server.snapshot());
		client.register([{ id: "b", css: ".b{color:blue}", priority: 2 }]);

		expect(client.css()).toBe(":root { --server-token: red; }\n.a{color:red}\n.b{color:blue}");
	});

	test("mounts into an explicit document and updates one style element", () => {
		const styles: Array<{
			tagName: string;
			textContent: string;
			nonce?: string;
			attributes: Map<string, string>;
			setAttribute: (name: string, value: string) => void;
			remove: () => void;
		}> = [];
		const document = {
			querySelector: () => styles[0] ?? null,
			createElement: () => {
				const style = {
					tagName: "STYLE",
					textContent: "",
					attributes: new Map<string, string>(),
					setAttribute: (name: string, value: string) => style.attributes.set(name, value),
					remove: () => styles.splice(styles.indexOf(style), 1),
				};
				styles.push(style);
				return style;
			},
			head: { appendChild: () => undefined },
		};
		const sheet = createRuntimeSheet({ autoMount: false, document, nonce: "test" });

		sheet.register([{ id: "a", css: ".a{color:red}", priority: 1 }]);
		expect(sheet.mount()).toBe(true);
		expect(styles[0]?.textContent).toBe(".a{color:red}");
		expect(styles[0]?.nonce).toBe("test");

		sheet.register([{ id: "b", css: ".b{color:blue}", priority: 2 }]);
		expect(styles[0]?.textContent).toBe(".a{color:red}\n.b{color:blue}");
	});
});
