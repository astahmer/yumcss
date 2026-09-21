import { describe, expect, it } from "vitest";
import { EXAMPLES, PlaygroundApi } from "./examples.ts";
import {
	evalPlayground,
	evalSiblingModule,
	type EvalInput,
	type PlaygroundHostNode,
	type PlaygroundNode,
} from "./eval-playground.ts";
import { tw } from "../tw.ts";
import { dss } from "../css.ts";
import { cx } from "../cx.ts";
import { createCss } from "pandwind/css";
import { createNamedAtomsStrategy } from "pandwind/css/named";
import { createStyleXAdapter } from "pandwind/css/stylex";
import type { ClassNameStrategy } from "pandwind/css";
import { createUnsafeCss } from "pandwind/unsafe/css";
import { resolveDesignStyle } from "pandwind/design/resolve";
import { examplePreset } from "@pandwind/example-preset";
import { SANDBOX_MODULES } from "./sandbox-modules.ts";
import { applyPreviewControls } from "./preview-controls.ts";

function makeInput(
	code: string,
	moduleBindings?: EvalInput["moduleBindings"],
	classNameStrategy?: ClassNameStrategy | null,
): EvalInput {
	return {
		code,
		tw: tw as unknown as (...args: Array<unknown>) => unknown,
		css: dss as unknown as ((...args: Array<unknown>) => unknown) & Record<string, unknown>,
		cx: cx as unknown as (...inputs: Array<never>) => string,
		createCss: createCss as unknown as (...args: Array<unknown>) => unknown,
		createUnsafeCss: createUnsafeCss as unknown as (...args: Array<unknown>) => unknown,
		moduleBindings:
			moduleBindings === undefined ? SANDBOX_MODULES : { ...SANDBOX_MODULES, ...moduleBindings },
		classNameStrategy,
		resolveCss: (style: Record<string, unknown>) => {
			const resolved = resolveDesignStyle(style, examplePreset.tokens);
			const out: Record<string, string> = {};
			for (const [prop, value] of Object.entries(resolved)) out[String(prop)] = String(value);
			return out;
		},
	};
}

const isHostNode = (value: PlaygroundNode | undefined): value is PlaygroundHostNode =>
	value !== undefined &&
	value !== null &&
	typeof value === "object" &&
	!Array.isArray(value) &&
	"children" in value;

function siblingBindings(
	variant: (typeof EXAMPLES)[number]["variants"][number],
	classNameStrategy?: ClassNameStrategy | null,
): EvalInput["moduleBindings"] {
	if (variant.files.length <= 1) return undefined;
	const bindings: Record<string, Record<string, unknown>> = {};
	for (let index = 1; index < variant.files.length; index++) {
		const file = variant.files[index]!;
		bindings["./" + file.name] = evalSiblingModule(
			makeInput(file.code, undefined, classNameStrategy),
		);
	}
	return bindings;
}

const labelFor = (
	def: (typeof EXAMPLES)[number],
	variant: (typeof EXAMPLES)[number]["variants"][number],
): string => def.path + " / " + variant.api + " (" + variant.files[0]!.name + ")";

const escapeCssIdentifier = (name: string): string => {
	const escaped = name.replace(/[^a-zA-Z0-9_\u0081-\uffff-]/g, (part) => `\\${part}`);
	return /^[0-9]/u.test(escaped) ? `\\3${escaped[0]} ${escaped.slice(1)}` : escaped;
};

const sheetBackedStrategies: ReadonlyArray<readonly [string, ClassNameStrategy | null]> = [
	["atomic", null],
	["named atoms", createNamedAtomsStrategy("playground")],
	["StyleX", createStyleXAdapter()],
];

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
		const cssVariant = basics?.variants.find((variant) => variant.api === PlaygroundApi.Css);
		expect(cssVariant?.files[0]?.code).not.toContain("createCx");
		expect(cssVariant?.files[0]?.code).not.toContain('"px-4"');
	});

	it("keeps every Basics API lane visually equivalent", () => {
		const basics = EXAMPLES.find((example) => example.path === "/basics");
		expect(basics).toBeDefined();
		if (basics === undefined) return;

		for (const tone of ["primary", "danger"] as const) {
			for (const size of ["sm", "lg"] as const) {
				const sourceValues = { tone, size };
				const expectedBackground = tone === "danger" ? "#E53E3E" : "#3182ce";
				const expectedPadding = size === "lg" ? "16px" : "8px";
				const expectedFontSize = size === "lg" ? "1.125rem" : "1rem";
				const expectedDeclarations = [
					`background-color:${expectedBackground}`,
					"border-radius:0.5rem",
					"color:#ffffff",
					`font-size:${expectedFontSize}`,
					`padding:${expectedPadding}`,
				];

				for (const variant of basics.variants) {
					const source = applyPreviewControls(
						variant.files[0]!.code,
						basics.preview.controls ?? [],
						sourceValues,
					);
					const result = evalPlayground(makeInput(source, siblingBindings(variant)));
					const label = `${variant.api}/${tone}/${size}`;
					expect(result.ok, label).toBe(true);
					if (!result.ok) continue;

					expect(result.rendered, label).toMatchObject({
						type: "button",
						children: [tone === "danger" ? "Delete" : "Continue"],
					});
					if (variant.api === PlaygroundApi.Tw) {
						expect(result.output, label).toBe(
							[
								`bg-${tone === "danger" ? "red-500" : "blue-500"}`,
								"text-white",
								"rounded-lg",
								`p-${size === "lg" ? "4" : "2"}`,
								`text-${size === "lg" ? "lg" : "base"}`,
							].join(" "),
						);
						continue;
					}

					const declarations = result.sheets
						.flatMap((sheet) =>
							sheet.rules.map((rule) => {
								const start = rule.css.indexOf("{");
								return rule.css.slice(start + 1, -1);
							}),
						)
						.sort();
					expect(declarations, label).toEqual(expectedDeclarations);
				}
			}
		}
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

	it("evaluates every selected combination in the variants preview", () => {
		const example = EXAMPLES.find((candidate) => candidate.path === "/variants");
		const variant = example?.variants[0];
		expect(example?.preview.controls).toHaveLength(2);
		expect(variant).toBeDefined();
		if (example === undefined || variant === undefined) return;

		for (const size of ["sm", "lg"] as const) {
			for (const tone of ["brand", "danger"] as const) {
				const source = applyPreviewControls(variant.files[0]!.code, example.preview.controls, {
					size,
					tone,
				});
				const result = evalPlayground(makeInput(source));
				expect(result.ok, `${size}/${tone}`).toBe(true);
				if (!result.ok) continue;
				expect(result.rendered, `${size}/${tone}`).toMatchObject({
					type: "button",
					props: { className: result.output },
				});
				expect(
					result.styleMappings.some(
						(mapping) =>
							mapping.active &&
							mapping.property === "backgroundColor" &&
							mapping.value.includes(tone === "danger" ? "red" : "blue"),
					),
				).toBe(true);
				expect(
					result.styleMappings.some(
						(mapping) =>
							mapping.active &&
							mapping.property === "padding" &&
							mapping.value === (size === "sm" ? "8" : "16"),
					),
				).toBe(true);
			}
		}
	});

	it("keeps every preview control valid across all API lanes", () => {
		for (const example of EXAMPLES) {
			const controls = example.preview.controls;
			if (controls === undefined || controls.length === 0) continue;
			const values = Object.fromEntries(
				controls.map((control) => [control.id, control.options.at(-1)!.value]),
			);
			for (const variant of example.variants) {
				const source = applyPreviewControls(variant.files[0]!.code, controls, values);
				const result = evalPlayground(makeInput(source, siblingBindings(variant)));
				expect(result.ok, labelFor(example, variant)).toBe(true);
			}
		}
	});

	it("gives every live specimen an obvious visual style", () => {
		for (const example of EXAMPLES) {
			for (const variant of example.variants) {
				const result = evalPlayground(makeInput(variant.files[0]!.code, siblingBindings(variant)));
				expect(result.ok, labelFor(example, variant)).toBe(true);
				if (!result.ok) continue;

				const authoredProperties = result.styleMappings
					.filter((mapping) => mapping.active)
					.map((mapping) => mapping.property)
					.join(" ");
				const emittedCss = result.sheets.map((sheet) => sheet.css).join(" ");
				const classString = result.output;
				expect(
					`${authoredProperties} ${emittedCss} ${classString}`,
					labelFor(example, variant),
				).toMatch(/bg(?:Color|-)|background(?:Color|-color)|border|boxShadow|box-shadow/u);
			}
		}
	});

	it("keeps generated selectors aligned with every CSS and DSS preview", () => {
		for (const [strategyName, strategy] of sheetBackedStrategies) {
			for (const example of EXAMPLES) {
				for (const variant of example.variants) {
					if (variant.api === PlaygroundApi.Tw) continue;
					const label = `${labelFor(example, variant)} / ${strategyName}`;
					const result = evalPlayground(
						makeInput(variant.files[0]!.code, siblingBindings(variant, strategy), strategy),
					);
					expect(result.ok, label).toBe(true);
					if (!result.ok) continue;

					const generatedCss = result.sheets.map((sheet) => sheet.css).join("\n");
					expect(
						result.sheets.some((sheet) => sheet.rules.length > 0),
						label,
					).toBe(true);
					for (const mapping of result.styleMappings.filter((entry) => entry.active)) {
						expect(generatedCss, `${label}: ${mapping.className}`).toContain(
							`.${escapeCssIdentifier(mapping.className)}`,
						);
					}
				}
			}
		}
	});

	it("makes the static-folding example actually fold its component styles", () => {
		const variant = EXAMPLES.find((example) => example.path === "/folding")?.variants[0];
		expect(variant).toBeDefined();
		if (variant === undefined) return;

		const result = evalPlayground(makeInput(variant.files[0]!.code));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.fold).toBe("full");
		expect(result.foldNote).toContain("rendered style calls");
		expect(result.output).toContain("p-4");
		expect(result.output).toContain("text-lg");
		expect(result.output).toContain("bg-blue-500");
		expect(result.output).toContain("border-2");
		expect(result.rendered).toMatchObject({ type: "span", children: ["Folded label (size 4)"] });
	});

	it("makes the design preset condition visually distinct", () => {
		const variant = EXAMPLES.find((example) => example.path === "/design-preset")?.variants[0];
		expect(variant).toBeDefined();
		if (variant === undefined) return;

		const result = evalPlayground(makeInput(variant.files[0]!.code, siblingBindings(variant)));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(variant.files[0]!.code).toContain("$brand-600");
		expect(result.sheets.some((sheet) => sheet.css.includes("#4c51bf"))).toBe(true);
		expect(result.sheets.some((sheet) => sheet.css.includes("#3730a3"))).toBe(true);
		expect(result.sheets.some((sheet) => sheet.css.includes(":hover"))).toBe(true);
	});

	it("makes the design preset active state change the generated style", () => {
		const example = EXAMPLES.find((candidate) => candidate.path === "/design-preset");
		const variant = example?.variants[0];
		expect(variant).toBeDefined();
		if (example === undefined || variant === undefined) return;

		const activeSource = applyPreviewControls(variant.files[0]!.code, example.preview.controls, {
			active: "true",
		});
		const inactiveSource = applyPreviewControls(variant.files[0]!.code, example.preview.controls, {
			active: "false",
		});
		const activeResult = evalPlayground(makeInput(activeSource, siblingBindings(variant)));
		const inactiveResult = evalPlayground(makeInput(inactiveSource, siblingBindings(variant)));

		expect(activeResult.ok).toBe(true);
		expect(inactiveResult.ok).toBe(true);
		if (!activeResult.ok || !inactiveResult.ok) return;
		expect(activeResult.output).not.toBe(inactiveResult.output);
		expect(activeResult.rendered).toMatchObject({
			props: { "aria-pressed": true },
			children: ["Active brand action"],
		});
		expect(inactiveResult.rendered).toMatchObject({
			props: { "aria-pressed": false },
			children: ["Brand action"],
		});
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
		const tokenSource = variant.files[1]?.code ?? "";
		expect(tokenSource).toContain("const rawTokens = define.tokens");
		expect(tokenSource).toContain("const semanticTokens = baseTokens.defineSemanticTokens");
		expect(tokenSource).toContain(
			"const tokens = semanticTokens.defineSemanticTokens(themeConditions",
		);
		expect(tokenSource).toContain('"component.card.borderWidth": "semantic.border.width.default"');
		expect(tokenSource).toContain('base: "semantic.bg.muted"');
		expect(tokenSource).toContain('_dark: "semantic.bg.primary"');
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

	it("renders color palette roles through the runtime sheet", () => {
		const example = EXAMPLES.find((candidate) => candidate.path === "/color-palettes");
		const variant = example?.variants[0];
		expect(variant).toBeDefined();
		if (variant === undefined) return;

		const source = variant.files[0]!.code;
		const result = evalPlayground(makeInput(source, siblingBindings(variant)));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const emittedCss = result.sheets.map((sheet) => sheet.css).join("\n");
		expect(source).toContain('colorPalette: "brand"');
		expect(source).toContain('backgroundColor: "colorPalette.muted"');
		expect(source).toContain('color: "colorPalette.contrast"');
		expect(emittedCss).toContain("background-color:var(--");
		expect(emittedCss).toContain("color:var(--");
		expect(emittedCss).toContain("#ebf8ff");
		expect(emittedCss).toContain("#2b6cb0");
		expect(emittedCss).toContain("#ffffff");
		expect(emittedCss).not.toContain("color-palette:brand");
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

	it("keeps the runtime-pruning example's static and dynamic boundary visible", () => {
		const example = EXAMPLES.find((candidate) => candidate.path === "/runtime-pruning");
		const variant = example?.variants[0];
		expect(example?.preview.controls).toMatchObject([
			{ id: "color", prop: "color", initialValue: "$gray-900" },
		]);
		expect(variant).toBeDefined();
		if (example === undefined || variant === undefined) return;

		const source = applyPreviewControls(variant.files[0]!.code, example.preview.controls, {
			color: "$red-500",
		});
		const result = evalPlayground(makeInput(source));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(source).toContain('backgroundColor: "$blue-100"');
		expect(source).toContain("color: props.color");
		expect(source).toContain("padding: 8");
		expect(result.styleMappings.map((mapping) => mapping.property)).toEqual(
			expect.arrayContaining(["color", "backgroundColor", "padding", "borderRadius"]),
		);
		expect(result.sheets.some((sheet) => sheet.rules.length > 0)).toBe(true);
		expect(result.rendered).toMatchObject({ type: "article" });
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

	it("renders the runtime @property example and keeps progress dynamic", () => {
		const example = EXAMPLES.find((candidate) => candidate.path === "/runtime-at-rules");
		const variant = example?.variants[0];
		expect(variant).toBeDefined();
		if (example === undefined || variant === undefined) return;

		const source = applyPreviewControls(variant.files[0]!.code, example.preview.controls, {
			value: "24%",
		});
		const result = evalPlayground(makeInput(source));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.sheets.some((sheet) => sheet.css.includes("@property --progress"))).toBe(true);
		expect(result.runtimeStyle).toEqual(expect.objectContaining({ "--progress": "24%" }));
		expect(result.sheets.some((sheet) => sheet.css.includes("var(--progress)"))).toBe(true);
		const rendered = result.rendered;
		expect(rendered).toMatchObject({ type: "article" });
		if (!isHostNode(rendered)) {
			throw new Error("Expected the progress preview to render an article host node.");
		}
		const strong = rendered.children.find((child) => isHostNode(child) && child.type === "strong");
		expect(strong).toMatchObject({ type: "strong", children: ["Progress is", "24%"] });
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
		expect(example?.preview.controls).toMatchObject([
			{ id: "tone", prop: "tone", initialValue: "blue" },
		]);
		expect(variant).toBeDefined();
		if (variant === undefined) return;

		const source = applyPreviewControls(variant.files[0]!.code, example?.preview.controls, {
			tone: "red",
		});
		const result = evalPlayground(makeInput(source));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.runtimeStyle).toMatchObject({ "--tone": "red" });
		expect(result.rendered).toMatchObject({ props: { style: { "--tone": "red" } } });
	});
});
