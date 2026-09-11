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

const labelFor = (
	def: (typeof EXAMPLES)[number],
	variant: (typeof EXAMPLES)[number]["variants"][number],
): string => def.path + " / " + variant.api + " (" + variant.files[0]!.name + ")";

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
				const label = labelFor(def, variant);
				expect(variant.files[0]?.code, label).toMatch(/export default/u);
				const result = evalPlayground(makeInput(variant.files[0]!.code, siblingBindings(variant)));
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

	it("keeps named token bindings separate from string component refs", () => {
		expect(EXAMPLES.every((example) => example.preview.label.length > 0)).toBe(true);
		expect(EXAMPLES.every((example) => example.preview.description.length > 0)).toBe(true);

		const variant = EXAMPLES.find((example) => example.path === "/token-bindings")?.variants[0];
		expect(variant).toBeDefined();
		if (variant === undefined) return;

		const result = evalPlayground(makeInput(variant.files[0]!.code, siblingBindings(variant)));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(variant.files[0]!.code).toContain("backgroundColor: componentTokens.card.bg");
		expect(variant.files[0]!.code).toContain("backgroundColor: componentTokens.card.hoverBg");
		expect(variant.files[0]!.code).not.toContain("props.tone");
		expect(variant.files[0]!.code).not.toContain(" ? ");
		expect(
			result.styleMappings.some(
				(mapping) => mapping.property === "backgroundColor" && mapping.value === "bg.primary",
			),
		).toBe(true);
		expect(
			result.styleMappings.some(
				(mapping) => mapping.property === "color" && mapping.value === "fg.on-primary",
			),
		).toBe(true);
		expect(
			result.styleMappings.some(
				(mapping) => mapping.property === "padding" && mapping.value === "card.padding",
			),
		).toBe(true);
		expect(result.sheets.some((sheet) => sheet.css.includes("padding:20px"))).toBe(true);
		expect(result.sheets.some((sheet) => sheet.css.includes("#2b6cb0"))).toBe(true);
		expect(result.sheets.some((sheet) => sheet.css.includes("#2c5282"))).toBe(true);
		expect(result.sheets.some((sheet) => sheet.css.includes("#f9fafb"))).toBe(true);
	});

	it("resolves string component refs through the semantic token layer", () => {
		const variant = EXAMPLES.find((example) => example.path === "/component-tokens")?.variants[0];
		expect(variant).toBeDefined();
		if (variant === undefined) return;

		const source = variant.files[0]!.code;
		const result = evalPlayground(makeInput(source, siblingBindings(variant)));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(source).toContain('backgroundColor: "component.state.emptyBg"');
		expect(source).toContain('borderWidth: "component.card.borderWidth"');
		expect(source).toContain('boxShadow: "component.card.shadow"');
		expect(source).not.toContain("componentTokens");
		expect(result.styleMappings.map((mapping) => mapping.value)).toEqual(
			expect.arrayContaining([
				"component.card.borderWidth",
				"component.card.border",
				"component.card.radius",
				"component.state.emptyBg",
				"component.state.errorText",
				"component.card.shadow",
				"component.card.padding",
			]),
		);
		expect(result.sheets.some((sheet) => sheet.css.includes("semantic.bg.muted"))).toBe(false);
		expect(result.sheets.some((sheet) => sheet.css.includes("#e5e7eb"))).toBe(true);
		expect(result.sheets.some((sheet) => sheet.css.includes("#374151"))).toBe(true);
	});

	it("keeps composed runtime host styles available to the preview", () => {
		const variant = EXAMPLES.find((example) => example.path === "/dynamic")?.variants[0];
		expect(variant).toBeDefined();
		if (variant === undefined) return;
		const preview = EXAMPLES.find((example) => example.path === "/dynamic")?.preview;
		expect(preview?.interaction).toEqual({
			type: "color",
			label: "Runtime text color",
			cssVariable: "--pw-c-color",
			initialValue: "#fef08a",
			description: "Change this value to update css.props() without creating a class.",
		});

		const result = evalPlayground(makeInput(variant.files[0]!.code));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.runtimeStyle).toMatchObject({
			"--pw-c-color": "#fef08a",
		});
		expect(result.rendered).toMatchObject({
			type: "div",
			props: {
				role: "alert",
				style: { "--pw-c-color": "#fef08a" },
			},
		});
	});

	it("makes viewport and container breakpoints visible in their specimens", () => {
		const responsive = EXAMPLES.find((example) => example.path === "/responsive");
		const responsiveVariant = responsive?.variants[0];
		expect(responsiveVariant).toBeDefined();
		if (responsiveVariant === undefined) return;

		const responsiveResult = evalPlayground(makeInput(responsiveVariant.files[0]!.code));
		expect(responsiveResult.ok).toBe(true);
		if (!responsiveResult.ok) return;
		expect(responsiveResult.output).toContain("sm:bg-amber-500");
		expect(responsiveResult.output).toContain("md:bg-blue-500");
		expect(responsiveResult.output).toContain("lg:bg-violet-500");

		const container = EXAMPLES.find((example) => example.path === "/container-queries");
		const containerVariant = container?.variants[0];
		expect(container?.preview.interaction).toMatchObject({
			type: "range",
			label: "Container width",
			property: "width",
			initialValue: "360",
			min: 240,
			max: 560,
			unit: "px",
		});
		expect(containerVariant).toBeDefined();
		if (containerVariant === undefined) return;

		const containerResult = evalPlayground(makeInput(containerVariant.files[0]!.code));
		expect(containerResult.ok).toBe(true);
		if (!containerResult.ok) return;
		expect(containerResult.rendered).toMatchObject({
			type: "section",
			props: { className: expect.stringContaining("@container") },
			children: [
				{
					type: "article",
					props: {
						className: expect.stringContaining("@md:bg-blue-500"),
					},
				},
			],
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

	it("makes dynamic group inputs interactive in the preview", () => {
		const example = EXAMPLES.find((candidate) => candidate.path === "/groups");
		const variant = example?.variants[0];
		expect(example?.preview.interaction).toEqual({
			type: "select",
			label: "Runtime tone",
			cssVariable: "--tone",
			initialValue: "blue",
			options: [
				{ label: "blue", value: "blue" },
				{ label: "red", value: "red" },
			],
			description: 'Switching this value updates css.input("tone") without changing classes.',
		});
		expect(variant).toBeDefined();
		if (variant === undefined) return;

		const result = evalPlayground(makeInput(variant.files[0]!.code));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.runtimeStyle).toMatchObject({ "--tone": "blue" });
	});
});
