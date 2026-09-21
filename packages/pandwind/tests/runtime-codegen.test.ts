import { describe, expect, test } from "vitest";
import {
	CSS_RUNTIME_METHODS,
	CssRuntimeFactoryTag,
	CssRuntimeMethodTag,
	normalizeCssRuntimeMethods,
	renderCssRuntimeModule,
} from "../src/css/runtime-codegen.ts";

describe("CSS runtime codegen registry", () => {
	test("keeps selections deterministic and expands attachment dependencies", () => {
		expect(normalizeCssRuntimeMethods(["input", "group", "class", "class"])).toEqual([
			CssRuntimeMethodTag.Class,
			CssRuntimeMethodTag.Vars,
			CssRuntimeMethodTag.Group,
			CssRuntimeMethodTag.Input,
		]);
		expect(normalizeCssRuntimeMethods([])).toEqual([]);
		expect(CSS_RUNTIME_METHODS).toEqual([
			"class",
			"vars",
			"raw",
			"props",
			"group",
			"input",
			"keyframes",
		]);
	});

	test("rejects unknown attachment names", () => {
		expect(() => normalizeCssRuntimeMethods(["class", "missing"])).toThrow(
			"Unknown CSS runtime method 'missing'",
		);
	});

	test("renders the same lean module for equivalent selections", () => {
		const source = renderCssRuntimeModule(["group"]);

		expect(source).toBe(renderCssRuntimeModule(["vars", "group"]));
		expect(source).toContain("pandwind/_runtime/css-base");
		expect(source).toContain("pandwind/_runtime/css-vars");
		expect(source).toContain("pandwind/_runtime/css-group");
		expect(source).not.toContain("pandwind/_runtime/css-props");
		expect(source).not.toContain("import(");
	});

	test("renders typed explicit modules with only selected methods", () => {
		const source = renderCssRuntimeModule(["class"], { typed: true });

		expect(source).toContain('import { attachClass } from "pandwind/_runtime/css-class";');
		expect(source).not.toContain("pandwind/_runtime/css-vars");
		expect(source).toContain('Pick<CssFn<TStyles>, "class">');
		expect(source).toContain("export const createUnsafeCss");
		expect(source).not.toContain("[ATTACHMENTS]");
	});

	test("renders preset, generated, and design factories over the same lean attachments", () => {
		const preset = renderCssRuntimeModule(["class"], {
			factory: CssRuntimeFactoryTag.Preset,
		});
		const generated = renderCssRuntimeModule(["keyframes"], {
			factory: CssRuntimeFactoryTag.Generated,
		});
		const design = renderCssRuntimeModule(["class"], {
			factory: CssRuntimeFactoryTag.Design,
		});

		expect(preset).toContain("createPresetCssRuntime");
		expect(preset).toContain("export const createCss");
		expect(preset).not.toContain("pandwind/_runtime/css-vars");
		expect(generated).toContain("export const createGeneratedCss");
		expect(generated).toContain("pandwind/_runtime/css-keyframes");
		expect(design).toContain("createDesignCssRuntime");
		expect(design).toContain("export const createDesignCss");
	});

	test("embeds projected preset metadata in specialized preset modules", () => {
		const source = renderCssRuntimeModule(["class"], {
			factory: CssRuntimeFactoryTag.Preset,
			presetSource:
				'{"conditions":{},"properties":{"color":{"$tokens":"colors"}},"strict":true,"tokens":{"colors":{"red":"#f00"}}}',
		});

		expect(source).toContain(
			'createPresetCssRuntime({"conditions":{},"properties":{"color":{"$tokens":"colors"}},"strict":true,"tokens":{"colors":{"red":"#f00"}}}, options',
		);
	});
});
