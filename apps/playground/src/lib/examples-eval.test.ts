import { describe, expect, it } from "vitest";
import { EXAMPLES, PlaygroundApi } from "./examples.ts";
import { evalPlayground, evalSiblingModule, type EvalInput } from "./eval-playground.ts";
import { tw } from "../tw.ts";
import { css as designCss } from "../css.ts";
import { cx } from "../cx.ts";
import { createCss } from "pandwind/css";
import { resolveDesignStyle } from "pandwind/design/resolve";
import { examplePreset } from "@pandwind/example-preset";
import { SANDBOX_MODULES } from "./sandbox-modules.ts";

function makeInput(code: string, moduleBindings?: EvalInput["moduleBindings"]): EvalInput {
	return {
		code,
		tw: tw as unknown as (...args: Array<unknown>) => unknown,
		css: designCss as unknown as ((...args: Array<unknown>) => unknown) & Record<string, unknown>,
		cx: cx as unknown as (...inputs: Array<never>) => string,
		createCss: createCss as unknown as (...args: Array<unknown>) => unknown,
		moduleBindings:
			moduleBindings === undefined ? SANDBOX_MODULES : { ...SANDBOX_MODULES, ...moduleBindings },
		resolveCss: (style: Record<string, unknown>) => {
			const resolved = resolveDesignStyle(style, examplePreset.tokens);
			const out: Record<string, string> = {};
			for (const [prop, value] of Object.entries(resolved)) out[String(prop)] = String(value);
			return out;
		},
	};
}

function siblingBindings(
	variant: (typeof EXAMPLES)[number]["variants"][number],
): EvalInput["moduleBindings"] {
	if (variant.files.length <= 1) return undefined;
	const bindings: Record<string, Record<string, unknown>> = {};
	for (let index = 1; index < variant.files.length; index++) {
		const file = variant.files[index]!;
		bindings["./" + file.name] = evalSiblingModule(makeInput(file.code));
	}
	return bindings;
}

describe("example catalog evaluates end to end", () => {
	it("groups the own APIs under one conceptual Basics scenario", () => {
		const basics = EXAMPLES.find((example) => example.path === "/basics");

		expect(basics?.variants.map((variant) => variant.api)).toEqual([
			PlaygroundApi.Tw,
			PlaygroundApi.Css,
			PlaygroundApi.Dss,
		]);
		expect(EXAMPLES.map((example) => example.path)).not.toContain("/basics-tw");
		expect(EXAMPLES.map((example) => example.path)).not.toContain("/basics-css");
		expect(EXAMPLES.map((example) => example.path)).not.toContain("/basics-dss");
	});

	it("every entry tab produces a playground result", () => {
		for (const def of EXAMPLES) {
			for (const variant of def.variants) {
				const result = evalPlayground(makeInput(variant.files[0]!.code, siblingBindings(variant)));
				const label = def.path + " / " + variant.api + " (" + variant.files[0]!.name + ")";
				const outcome = result.ok ? "ok" : "error: " + result.error;
				expect(outcome, label).toBe("ok");
				if (result.ok) expect(result.rendered, label).toBeDefined();
			}
		}
	});

	it("every sibling tab evaluates in module mode", () => {
		for (const def of EXAMPLES) {
			for (const variant of def.variants) {
				for (let index = 1; index < variant.files.length; index++) {
					const file = variant.files[index]!;
					expect(
						() => evalSiblingModule(makeInput(file.code)),
						def.path + " / " + variant.api + " sibling " + file.name,
					).not.toThrow();
				}
			}
		}
	});

	it("keeps the variants example extractable and runtime-backed", () => {
		const variant = EXAMPLES.find((example) => example.path === "/variants")?.variants[0];
		expect(variant).toBeDefined();
		if (variant === undefined) return;

		const result = evalPlayground(makeInput(variant.files[0]!.code));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.sheets.some((sheet) => sheet.rules.length > 0)).toBe(true);
		expect(result.programs).not.toHaveLength(0);
		expect(result.programs.every((program) => program.residuals.length === 0)).toBe(true);
	});

	it("connects each entry to a rendered preview and resolves component tokens", () => {
		expect(EXAMPLES.every((example) => example.preview.label.length > 0)).toBe(true);
		expect(EXAMPLES.every((example) => example.preview.description.length > 0)).toBe(true);

		const variant = EXAMPLES.find((example) => example.path === "/tokens")?.variants[0];
		expect(variant).toBeDefined();
		if (variant === undefined) return;

		const result = evalPlayground(makeInput(variant.files[0]!.code, siblingBindings(variant)));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(
			result.styleMappings.some(
				(mapping) => mapping.property === "padding" && mapping.value === "button.padding",
			),
		).toBe(true);
		expect(result.sheets.some((sheet) => sheet.css.includes("padding:20px"))).toBe(true);
	});

	it("keeps composed runtime host styles available to the preview", () => {
		const variant = EXAMPLES.find((example) => example.path === "/dynamic")?.variants[0];
		expect(variant).toBeDefined();
		if (variant === undefined) return;

		const result = evalPlayground(makeInput(variant.files[0]!.code));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.runtimeStyle).toMatchObject({
			"--pw-c-color": "red-600",
		});
		expect(result.rendered).toMatchObject({
			type: "div",
			props: {
				role: "alert",
				style: { "--pw-c-color": "red-600" },
			},
		});
	});

	it("keeps tw compatibility hover classes on the rendered button", () => {
		const variant = EXAMPLES.find((example) => example.path === "/tw-compat")?.variants[0];
		expect(variant).toBeDefined();
		if (variant === undefined) return;

		const result = evalPlayground(makeInput(variant.files[0]!.code));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.output).toContain("bg-blue-500");
		expect(result.output).toContain("group-hover:text-red-500");
		expect(result.rendered).toMatchObject({
			type: "div",
			props: { className: "group" },
			children: [
				{
					type: "button",
					props: { className: expect.stringContaining("group-hover:text-red-500") },
				},
			],
		});
	});
});
