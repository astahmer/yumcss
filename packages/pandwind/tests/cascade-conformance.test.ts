import { describe, expect, test } from "vitest";
import { createStylesheet, getPropertyPriority } from "../src/css/create-stylesheet.ts";
import { examplePreset } from "../src/preset/example-preset.ts";

describe("deterministic CSS cascade ordering", () => {
	test("normalizes camelCase physical properties before applying priorities", () => {
		expect(getPropertyPriority("margin")).toBeLessThan(getPropertyPriority("marginInline"));
		expect(getPropertyPriority("marginInline")).toBeLessThan(getPropertyPriority("marginTop"));
		expect(getPropertyPriority("borderBlockStyle")).toBe(3000);
	});

	test("shorthand and longhand output is independent of object insertion order", () => {
		const forward = createStylesheet(examplePreset, { debug: true });
		const reverse = createStylesheet(examplePreset, { debug: true });

		forward.process([{ marginTop: "2px", margin: "1px", paddingInline: "4px", padding: "3px" }]);
		reverse.process([{ padding: "3px", paddingInline: "4px", margin: "1px", marginTop: "2px" }]);

		const first = forward.gen.atomic();
		const second = reverse.gen.atomic();
		expect(first).toBe(second);
		expect(first).toMatchInlineSnapshot(
			`".margin__1px{margin:1px}\n.padding__3px{padding:3px}\n.paddingInline__4px{padding-inline:4px}\n.marginTop__2px{margin-top:2px}"`,
		);
		expect(first.indexOf("margin:1px")).toBeLessThan(first.indexOf("margin-top:2px"));
		expect(first.indexOf("padding:3px")).toBeLessThan(first.indexOf("padding-inline:4px"));
	});
});
