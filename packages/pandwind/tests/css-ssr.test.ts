/**
 * Server/rendering contract for the CSS lane.
 *
 * This intentionally uses only Node-visible APIs: a server render must not
 * need `window`, `document`, or a hidden style injector. Browser hydration is
 * then a property of the host renderer consuming the same class/style data.
 */
import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { examplePreset } from "../src/preset/example-preset.ts";

const css = createCss(examplePreset);

describe("SSR and hydration contract", () => {
	test("dynamic output is serializable and has no DOM dependency", () => {
		const output = css.vars({ color: "#3182ce", opacity: 0.5 } as never);
		const serialized = JSON.stringify(output);

		expect(serialized).toBe(
			'{"class":"pw-color pw-opacity","style":{"--pw-c-color":"#3182ce","--pw-c-opacity":"0.5"}}',
		);
		expect(JSON.parse(serialized)).toEqual({
			class: "pw-color pw-opacity",
			style: { "--pw-c-color": "#3182ce", "--pw-c-opacity": "0.5" },
		});
	});

	test("server stylesheet collection is idempotent across repeated renders", () => {
		const sheet = createStylesheet(examplePreset);
		const styles = [{ color: "$blue-500" }, { _hover: { color: "$red-500" } }];

		sheet.process(styles);
		sheet.process(styles);
		const first = sheet.gen.atomicEntries();
		sheet.process([{ color: "$blue-500" }]);
		const second = sheet.gen.atomicEntries();

		expect(second).toEqual(first);
		expect(new Set(second.map((entry) => entry.id)).size).toBe(second.length);
	});

	test("server and client consume the same class/style contract", () => {
		const server = css.vars({ _hover: { color: "#2563eb" } });
		const client = css.vars({ _hover: { color: "#2563eb" } });

		expect(client).toEqual(server);
	});
});
