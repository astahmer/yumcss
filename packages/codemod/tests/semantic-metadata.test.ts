import { describe, expect, test } from "vitest";
import {
	STYLE_VALIDATORS,
	STYLE_LOWERING_REGISTRY,
	createStyleValidatorRegistry,
	requiredAdapterCapabilities,
	styleProgramFromSourceObject,
	StyleProgramCompositionKind,
	externalIdentifier,
} from "../src/swap/index.ts";
import type { StyleProgram } from "../src/swap/index.ts";

describe("semantic metadata and validator domains", () => {
	test("retains dynamic dependencies and project semantic context", () => {
		const program = styleProgramFromSourceObject("color: theme.colors.foreground, padding: 2", {
			source: { file: "Card.tsx", framework: "react" },
			themes: [{ path: "colors.foreground", authored: "theme.colors.foreground" }],
			compositions: [{ kind: StyleProgramCompositionKind.Mixin, reference: "surface" }],
			runtime: { phase: "render", framework: "react", dependencies: ["theme"] },
			plugins: [{ id: "emotion/serialize", input: "theme.colors.foreground" }],
		});
		const dynamic = program.declarations.find(
			(declaration) => declaration.value.kind === "dynamic",
		);
		expect(dynamic?.value).toMatchObject({
			kind: "dynamic",
			dependencies: ["theme.colors.foreground"],
		});
		expect(program.themes).toHaveLength(1);
		expect(requiredAdapterCapabilities(program)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ capability: "theme-context" }),
				expect.objectContaining({ capability: "composition" }),
				expect.objectContaining({ capability: "runtime-context" }),
				expect.objectContaining({ capability: "plugin-transforms" }),
				expect.objectContaining({ capability: "framework-semantics" }),
			]),
		);
	});

	test("runs standalone custom validators with the canonical registry", () => {
		const program: StyleProgram = {
			schema: "pandwind.style-program/3",
			rules: [],
			declarations: [],
			residuals: [],
		};
		const registry = createStyleValidatorRegistry([
			...STYLE_VALIDATORS.validators,
			{
				schema: "pandwind.style-validator/1",
				id: externalIdentifier("fixture-name"),
				validate: ({ fixture }) => ({
					validator: externalIdentifier("fixture-name"),
					valid: fixture === "fixture",
					lossiness: "lossless",
					differences: fixture === "fixture" ? [] : ["fixture name mismatch"],
				}),
			},
		]);
		const result = registry.validate({
			source: program,
			target: program,
			residuals: [],
			fixture: "fixture",
		});
		expect(result.valid).toBe(true);
	});

	test("lowers resolved themes and preserves an explicit dynamic residual", () => {
		const program = styleProgramFromSourceObject(
			"color: theme.colors.foreground, padding: props.padding",
			{
				themes: [
					{ path: "colors.foreground", authored: "theme.colors.foreground", resolved: "red" },
				],
			},
		);
		const result = STYLE_LOWERING_REGISTRY.lower({
			program,
			target: {
				schema: "pandwind.adapter-capabilities/2",
				adapter: "static-target",
				capabilities: {
					declarations: "exact",
					"dynamic-values": "unsupported",
					"theme-context": "unsupported",
				},
			},
			mode: "safe",
		});
		expect(result.program.declarations.find((item) => item.property === "color")?.value).toEqual({
			kind: "literal",
			value: "red",
		});
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "dynamic" })]),
		);
	});

	test("lowers unsupported dynamics to a stable custom-property contract", () => {
		const program = styleProgramFromSourceObject("color: props.color", {});
		const result = STYLE_LOWERING_REGISTRY.lower({
			program,
			target: {
				schema: "pandwind.adapter-capabilities/2",
				adapter: "static-target",
				capabilities: {
					declarations: "exact",
					"dynamic-values": "unsupported",
					"custom-properties": "partial",
				},
			},
			mode: "partial",
		});
		const value = result.program.declarations[0]?.value;
		expect(value).toMatchObject({
			kind: "literal",
			value: expect.stringMatching(/^var\(--pandwind-dynamic-[a-z0-9]+\)$/),
		});
		expect(result.residuals).toEqual(
			expect.arrayContaining([expect.objectContaining({ kind: "dynamic-custom-property" })]),
		);
	});
});
