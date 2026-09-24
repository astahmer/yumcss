import { expect, test } from "tstyche";
import { createCss } from "pandwind/css";
import { createRuntimeCss, createRuntimeDesignCss } from "pandwind/css/runtime";
import { createDesignCss } from "pandwind/design";
import { define } from "pandwind/preset";

const preset = define.preset(
	{
		config: {},
		tokens: {
			colors: { brand: "#2563eb" },
			customProps: { tone: "warm" },
		},
	},
	{
		conditions: { _hover: "&:hover" },
		properties: {
			color: { $tokens: "colors" },
			"--app-tone": { $tokens: "customProps" },
		},
	},
);

const css = createCss(preset);
const design = createDesignCss(preset);
const runtime = createRuntimeCss(preset, { sheetOptions: { autoMount: false } });
const runtimeDesign = createRuntimeDesignCss(preset, {
	sheetOptions: { autoMount: false },
});

const rawDeclarations = {
	color: "#123456",
	"--app-tone": "var(--app-tone)",
};

test("preset token constraints still apply outside the raw CSS escape hatch", () => {
	expect(css.class({ color: "brand" })).type.toBe<string>();
	css.class({
		// @ts-expect-error not assignable
		color: "#123456",
	});
});

test("raw styles accept preset properties and literal CSS values on every typed surface", () => {
	expect(css.class({ $raw: rawDeclarations })).type.toBe<string>();
	expect(design.class({ $raw: rawDeclarations })).type.toBe<string>();
	expect(runtime.class({ $raw: rawDeclarations })).type.toBe<string>();
	expect(runtimeDesign.class({ $raw: rawDeclarations })).type.toBe<string>();
	expect(css.class({ _hover: { $raw: rawDeclarations } })).type.toBe<string>();
});

test("raw styles stay open for declarations outside the preset vocabulary", () => {
	expect(css.class({ $raw: { animation: "spin 1s linear infinite" } })).type.toBe<string>();
	css.class({
		// @ts-expect-error may only specify known properties
		animation: "spin 1s linear infinite",
	});
});
