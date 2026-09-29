import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	StyleProgramCompositionKind,
	StyleProgramBuilder,
	createTailwindAdapter,
	styleProgramToCanonicalCss,
	swapIRFromStyleProgram,
} from "../src/swap/index.ts";

const emitContext = {
	file: "Card.tsx",
	config: {
		adapter: CodemodAdapterId.Tailwind,
		files: [],
		values: {},
	},
	mode: "safe" as const,
	index: 0,
};

describe("StyleProgramBuilder", () => {
	test("builds the existing rule-level IR with tokens, ordering, and metadata", () => {
		const program = StyleProgramBuilder.create({
			source: { file: "Card.tsx", adapter: CodemodAdapterId.Pandwind },
		})
			.style({
				color: "red",
				padding: StyleProgramBuilder.token("space.2", { resolved: "0.5rem" }),
			})
			.global(":root", { "--brand": "#2563eb" })
			.keyframes("fade", [
				{ selector: "from", declarations: { opacity: 0 } },
				{ selector: "to", declarations: { opacity: 1 } },
			])
			.fontFace({ fontFamily: "Inter", src: 'url("/inter.woff2")' })
			.layer("components", { display: "flex" })
			.supports("(display: grid)", { display: "grid" })
			.property("--progress", { syntax: '"<number>"', inherits: false, initialValue: 0 })
			.withTheme({ path: "space.2", authored: "tokens.space.2", resolved: "0.5rem" })
			.withComposition({ kind: StyleProgramCompositionKind.Mixin, reference: "surface" })
			.withPlugin({ id: "normalize", input: "space.2", output: "0.5rem" })
			.withResidual({
				kind: "unrepresentable",
				text: "custom-at-rule",
				hint: "target owns this rule",
			})
			.build();

		expect(program.schema).toBe("pandwind.style-program/5");
		expect(program.rules.map((rule) => rule.kind)).toEqual([
			"style",
			"global",
			"keyframes",
			"font-face",
			"layer",
			"supports",
			"property",
		]);
		expect(
			program.rules[0]?.declarations.find((declaration) => declaration.property === "padding")
				?.value,
		).toMatchInlineSnapshot(`
			{
			  "authored": "$space.2",
			  "kind": "token",
			  "ref": "space.2",
			  "resolved": "0.5rem",
			}
		`);
		expect(program.sourceMap).toContainEqual(program.source);
		expect(program.themes).toHaveLength(1);
		expect(program.compositions).toHaveLength(1);
		expect(program.plugins).toHaveLength(1);
		expect(program.residuals).toMatchInlineSnapshot(`
			[
			  {
			    "hint": "target owns this rule",
			    "kind": "unrepresentable",
			    "text": "custom-at-rule",
			  },
			]
		`);
		expect(styleProgramToCanonicalCss(program)).toMatchInlineSnapshot(
			`"&{padding:0.5rem;color:red}:root{--brand:#2563eb}@keyframes fade{from{opacity:0}to{opacity:1}}@font-face{fontFamily:Inter;src:url("/inter.woff2")}@layer components{display:flex}@supports (display: grid){display:grid}@property --progress{inherits:false;initialValue:0;syntax:"<number>"}"`,
		);
	});

	test("keeps dynamic semantics explicit and projects simple programs to SwapIR", () => {
		const program = StyleProgramBuilder.create()
			.withStyle({
				color: StyleProgramBuilder.dynamic("props.color", {
					lowering: "custom-property",
					fallback: StyleProgramBuilder.literal("red"),
				}),
			})
			.style({ opacity: 0.8 })
			.build();

		expect(program.rules[0]?.declarations[0]?.value).toMatchInlineSnapshot(`
			{
			  "expression": "props.color",
			  "expressionKind": "member",
			  "fallback": {
			    "kind": "literal",
			    "value": "red",
			  },
			  "kind": "dynamic",
			  "lowering": "custom-property",
			  "staticEvaluation": {
			    "attempted": true,
			    "reason": "expression depends on runtime or unresolved source bindings",
			    "status": "unresolved",
			  },
			}
		`);
		expect(swapIRFromStyleProgram(program)).toMatchInlineSnapshot(`
			{
			  "entries": [
			    {
			      "conditions": [],
			      "prop": "opacity",
			      "value": 0.8,
			    },
			  ],
			  "residuals": [
			    {
			      "hint": "dynamic semantic declaration requires a target runtime",
			      "kind": "dynamic",
			      "text": "props.color",
			    },
			  ],
			}
		`);
	});

	test("preserves conditional and nested rule nodes", () => {
		const program = StyleProgramBuilder.create()
			.style(
				{ color: "red" },
				{
					conditions: [{ kind: "pseudo", name: "hover" }],
					children: [
						{
							kind: "style",
							selector: ".icon",
							conditions: [],
							declarations: [
								{ conditions: [], property: "opacity", value: { kind: "literal", value: 0.8 } },
							],
						},
					],
				},
			)
			.build();

		expect(program.rules[0]?.conditions).toEqual([{ kind: "pseudo", name: "hover" }]);
		expect(program.rules[0]?.children).toHaveLength(1);
		expect(styleProgramToCanonicalCss(program)).toMatchInlineSnapshot(
			`"&:hover{color:red}.icon{opacity:0.8}"`,
		);
	});

	test("can be consumed by a registered target adapter", () => {
		const program = StyleProgramBuilder.create().style({ display: "flex", color: "red" }).build();
		const emitted = createTailwindAdapter({ moduleLoader: null }).emit(program, emitContext);

		expect(emitted.residuals).toEqual([]);
		expect(emitted.text).toBe(JSON.stringify("[display:flex] [color:red]"));
		expect(JSON.parse(emitted.text)).toMatchInlineSnapshot(`"[display:flex] [color:red]"`);
	});

	test("can seed a new construction without sharing mutable arrays", () => {
		const original = StyleProgramBuilder.create().style({ color: "red" }).build();
		const rebuilt = StyleProgramBuilder.from(original).style({ color: "blue" }).build();

		expect(original.rules).toHaveLength(1);
		expect(rebuilt.rules).toHaveLength(2);
		expect(rebuilt.rules).not.toBe(original.rules);
	});

	test("rejects malformed semantic values instead of dropping them", () => {
		expect(() => StyleProgramBuilder.token(" ")).toThrow(
			"StyleProgramBuilder requires a token reference",
		);
		expect(() =>
			StyleProgramBuilder.create().style({ color: { kind: "future" } as never }),
		).toThrow("unknown semantic value kind");
	});
});
