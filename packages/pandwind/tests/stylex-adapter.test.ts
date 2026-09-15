import { describe, expect, test } from "vitest";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createStyleXAdapter } from "../src/css/stylex-adapter.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { examplePreset } from "@pandwind/example-preset";

describe("StyleX class-name adapter", () => {
	test("emits StyleX-shaped atomic names for static declarations", () => {
		const adapter = createStyleXAdapter();
		const css = createUnsafeCss({ className: adapter });
		const result = css.class({ color: "red", margin: 8 });

		expect(result).toMatchInlineSnapshot(`"x1e2nbdu xkib98w"`);
		expect(result).toMatch(/^x[a-z0-9]+ x[a-z0-9]+$/u);
		expect(result.split(" ")).toHaveLength(2);
	});

	test("uses configured custom conditions in the identity", () => {
		const adapter = createStyleXAdapter({
			conditions: {
				_night: ".night &",
				_supportHover: ["@media (hover: hover)", "&:hover"],
			},
		});
		const css = createUnsafeCss({ className: adapter });
		const result = css.class({ _night: { color: "red" } });
		const reordered = css.class({ color: { _night: "red" } });

		expect(result).toMatchInlineSnapshot(`"x1a4pbus"`);
		expect(result).toBe(reordered);
		expect(result).toMatch(/^x[a-z0-9]+$/u);
	});

	test("keeps custom conditions deterministic without a condition catalog", () => {
		const adapter = createStyleXAdapter();
		const css = createUnsafeCss({ className: adapter });
		const result = css.class({ _customState: { color: "red" } });

		expect(result).toMatchInlineSnapshot(`"x2hy8o5"`);
		expect(result).toMatch(/^x[a-z0-9]+$/u);
	});

	test("registers StyleX-shaped names in the Pandwind stylesheet", () => {
		const adapter = createStyleXAdapter({ conditions: examplePreset.conditions });
		const css = createUnsafeCss({ className: adapter });
		const className = css.class({ _hover: { color: "red" } });
		const sheet = createStylesheet(examplePreset, { className: adapter });
		const output = sheet.process([{ _hover: { color: "red" } }] as never);

		expect(output.size).toBe(1);
		expect(className).not.toBeNull();
		expect(sheet.gen.atomic()).toContain(`.${className!.replaceAll("\\", "")}`);
		expect(sheet.gen.atomic()).toContain(":hover");
	});

	test("supports StyleX debug names without changing the atomic hash", () => {
		const adapter = createStyleXAdapter({ debug: true, enableDebugClassNames: true });
		const className = adapter.toClassName("color", "red");

		expect(className).toMatchInlineSnapshot(`"color-x1e2nbdu"`);
		expect(className).not.toBeNull();
		expect(className!.startsWith("color-x")).toBe(true);
		expect(className!.replace("color-", "")).toBe(
			createStyleXAdapter().toClassName("color", "red"),
		);
	});
});
