import { expect, test } from "vitest";
import { createCss, createUnsafeCss } from "../src/css/create-css.ts";
import { createStylesheet } from "../src/css/create-stylesheet.ts";
import { createRuntimeStylesheet } from "../src/css/runtime-stylesheet.ts";
import { resolveDesignStyle } from "../src/design/resolve.ts";
import { createDesignCss } from "../src/design/index.ts";
import { define } from "../src/types/define-preset.export.ts";
import { createLiteralStyleCompiler } from "../src/vite/literal-style-compiler.ts";

const preset = define.preset(
	{ config: {}, tokens: { spacing: { 4: "1rem" }, radii: { 2: "0.5rem" } } },
	{
		conditions: { _hover: "&:hover" },
		properties: {
			padding: { $tokens: "spacing" },
			borderRadius: { $tokens: "radii" },
			opacity: true,
		},
	},
);

test("numbered tokens agree across classes, extraction, and both stylesheet compilers", () => {
	const css = createCss(preset, { debug: true });
	const input = { padding: 4, _hover: { borderRadius: 2 }, opacity: 0.5 } as const;
	expect(css.class(input)).toBe(
		css.class({ padding: "4", _hover: { borderRadius: "2" }, opacity: 0.5 }),
	);
	expect(css.vars({ padding: 4 }).style).toEqual(css.vars({ padding: "4" }).style);
	expect(() => css.vars({ $raw: { width: 12 } })).toThrow("explicit CSS unit");
	const compiler = createLiteralStyleCompiler({ preset, debug: true });
	expect(compiler.compile(input, "fixture.ts")).toBe(css.class(input));
	const sheet = createStylesheet(preset, { debug: true });
	const runtimeSheet = createRuntimeStylesheet(preset, { debug: true });
	const prepared = [...compiler.preparedStyles.values()].flat();
	const rulesByCompiler = [sheet.process([input]), runtimeSheet.processPrepared(prepared)];
	for (const entries of rulesByCompiler) {
		const rules = [...entries.values()].map((rule) => rule.css).join("");
		expect(rules).toContain("padding:var(");
		expect(rules).toContain("border-radius:var(");
		expect(rules).toContain("opacity:0.5");
		expect(rules).not.toContain("4px");
	}
});

test("owned APIs require explicit units for non-token lengths", () => {
	const css = createUnsafeCss();
	expect(() => css.class({ width: 12 })).toThrow("explicit CSS unit");
	expect(() => css.vars({ width: 12 })).toThrow("explicit CSS unit");
	expect(css.class({ width: "12px" })).toBeTruthy();
	expect(css.class({ width: 0, opacity: 0.5, lineHeight: 1.5, zIndex: 2 })).toBeTruthy();
});

test("design lengths resolve numbered tokens and reject implicit pixels", () => {
	const dss = createDesignCss(preset);
	expect(dss.raw({ $frame: { pad: 4, corners: 2 } })).toEqual({
		padding: "1rem",
		borderRadius: "0.5rem",
	});
	const openDss = createDesignCss(
		define.preset({ config: {}, tokens: {} }, { conditions: {}, properties: {} }),
	);
	expect(() => resolveDesignStyle({ $frame: { pad: 12 } }, {})).toThrow("explicit CSS unit");
	expect(() => openDss.class({ $frame: { pad: "12" } })).toThrow("explicit CSS unit");
	expect(openDss.raw({ $frame: { pad: "12px" } })).toEqual({ padding: "12px" });
});
