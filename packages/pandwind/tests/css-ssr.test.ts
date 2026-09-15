/**
 * Server/rendering contract for the CSS lane.
 *
 * This intentionally uses only Node-visible APIs: a server render must not
 * need `window`, `document`, or a hidden style injector. Browser hydration is
 * then a property of the host renderer consuming the same class/style data.
 */
import { describe, expect, test } from "vitest";
import { createCss } from "../src/css/create-css.ts";
import { createUnsafeCss } from "../src/unsafe/css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { examplePreset } from "@pandwind/example-preset";

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

describe("SSR dynamic-value routing (plan-057 T9)", () => {
	test("theme-conditioned values route to the vars carrier, not generated CSS", () => {
		const sheet = createStylesheet(examplePreset);

		const themed = css.vars({
			_dark: { color: "#f8fafc" },
			color: "#0f172a",
		});
		// Inline style carries BOTH condition-scoped values; the class carries
		// the toggle keys. The stylesheet itself stays value-free.
		expect(themed.style).toEqual({
			"--pw-c-color": "#0f172a",
			"--pw-c-color_dark": "#f8fafc",
		});
		expect(themed.class).toBe("pw-dark:color pw-color");

		sheet.processVarKey("color");
		sheet.processVarKey("_dark__color");
		const rules = sheet.gen.varRules();
		expect(rules).toContain("color: var(--pw-c-color_dark, var(--pw-c-color))");
		expect(rules).not.toContain("#f8fafc");
		expect(rules).not.toContain("#0f172a");
	});

	test("responsive conditions resolve through the same carrier contract", () => {
		const responsiveCss = createUnsafeCss({
			conditions: { md: "@media (min-width: 768px)" },
		} as never);
		const out = responsiveCss.vars({ padding: { base: "4px", md: "12px" } } as never);
		// Property-first responsive keys keep the property in the declaration
		// and the breakpoint in the custom-property suffix:
		// Each breakpoint value gets its own atom and custom property:
		expect(out.class).toBe("pw-padding:base pw-md:padding");
		expect(out.style).toEqual({
			"--pw-c-base_padding": "4px",
			"--pw-c-padding_md": "12px",
		});

		// The breakpoint toggle rule resolves inside the media query:
		const sheet = createStylesheet({ conditions: { md: "@media (min-width: 768px)" } } as never);
		sheet.processVarKey("padding__md");
		expect(sheet.gen.varRules()).toContain("@media (min-width: 768px)");
		expect(sheet.gen.varRules()).toContain("var(--pw-c-padding_md, var(--pw-c-padding))");
	});

	test("pseudo-state toggles keep values out of the generated sheet", () => {
		const sheet = createStylesheet(examplePreset);

		const out = css.vars({
			_hover: { backgroundColor: "#1d4ed8" },
			backgroundColor: "#3b82f6",
		} as never);
		expect(out.class).toBe("pw-hover:background-color pw-background-color");

		sheet.processVarKey("background-color");
		sheet.processVarKey("_hover__background-color");
		const rules = sheet.gen.varRules();
		expect(rules).toContain(
			"background-color: var(--pw-c-background-color_hover, var(--pw-c-background-color))",
		);
		// No literal value from the call leaks into the sheet:
		expect(rules).not.toContain("#1d4ed8");
		expect(rules).not.toContain("#3b82f6");
	});

	test("hydration round-trip preserves carrier data byte-identically", () => {
		const server = css.vars({ color: "#3182ce", _hover: { color: "#1d4ed8" } });
		const serialized = JSON.stringify(server);
		const client = JSON.parse(serialized);

		// The wire contract is class + style; the internal atoms symbol is
		// process-local metadata and does not (must not) serialize.
		expect(client).toEqual({ class: server.class, style: server.style });
		// Recomputing the same call on the "client" yields identical data:
		const fresh = css.vars({ color: "#3182ce", _hover: { color: "#1d4ed8" } });
		expect(JSON.parse(JSON.stringify(fresh))).toEqual(client);
	});

	test("unsupported dynamic values are omitted rather than becoming CSS", () => {
		const out = css.vars({
			color: "#3182ce",
			opacity: Number.NaN,
			zIndex: Number.POSITIVE_INFINITY,
		} as never);
		expect(out.class).toBe("pw-color");
		expect(out.style).toEqual({ "--pw-c-color": "#3182ce" });
	});
});
