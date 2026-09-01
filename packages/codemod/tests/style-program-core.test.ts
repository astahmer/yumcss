import { describe, expect, test } from "vitest";
import {
	CodemodAdapterId,
	createBuiltinCodemodCatalog,
	createStyleAdapterRegistry,
	runAdapterMigration,
	STYLE_PROGRAM_ARTIFACT_SCHEMA,
	STYLE_PROGRAM_CORE_VERSION,
	StyleProgramCompatibility,
	StyleProgramBuilder,
	StyleProgramCore,
} from "../src/swap/index.ts";

const program = StyleProgramBuilder.create({
	source: { file: "src/Card.tsx", adapter: CodemodAdapterId.StyleX, pattern: "stylex.create" },
})
	.withTheme({ path: "color.brand", authored: "$brand", resolved: "#2563eb" })
	.withResidual({ kind: "plugin-transform", text: "custom-shadow()", hint: "review plugin output" })
	.style(
		{
			color: StyleProgramBuilder.token("color.brand", { authored: "$brand", resolved: "#2563eb" }),
			padding: StyleProgramBuilder.literal(8),
			backgroundColor: StyleProgramBuilder.dynamic("props.tone", {
				dependencies: ["props.tone"],
			}),
		},
		{ selector: ".card", order: 2 },
	)
	.global("body", { margin: 0 }, { order: 1 })
	.build();

describe("StyleProgramCore", () => {
	test("normalizes once and remains stable when normalized again", () => {
		const normalized = StyleProgramCore.normalize(program);

		expect(StyleProgramCore.normalize(normalized)).toEqual(normalized);
		expect(StyleProgramCore.validate(normalized)).toEqual({ valid: true, issues: [] });
		expect(StyleProgramCore.canonical(normalized)).toMatchInlineSnapshot(
			`"{"compositions":[],"declarations":[{"conditions":[],"property":"color","value":{"authored":"$brand","kind":"token","ref":"color.brand","resolved":"#2563eb"}},{"conditions":[],"property":"padding","value":{"kind":"literal","value":8}},{"conditions":[],"property":"backgroundColor","value":{"dependencies":["props.tone"],"expression":"props.tone","expressionKind":"member","kind":"dynamic","staticEvaluation":{"attempted":true,"reason":"expression depends on runtime or unresolved source bindings","status":"unresolved"}}}],"emissionHints":[],"plugins":[],"residuals":[{"hint":"review plugin output","kind":"plugin-transform","text":"custom-shadow()"}],"rules":[{"children":[],"conditions":[],"declarations":[{"conditions":[],"property":"margin","value":{"kind":"literal","value":0}}],"kind":"global","order":1,"selector":"body"},{"children":[],"conditions":[],"declarations":[{"conditions":[],"property":"color","value":{"authored":"$brand","kind":"token","ref":"color.brand","resolved":"#2563eb"}},{"conditions":[],"property":"padding","value":{"kind":"literal","value":8}},{"conditions":[],"property":"backgroundColor","value":{"dependencies":["props.tone"],"expression":"props.tone","expressionKind":"member","kind":"dynamic","staticEvaluation":{"attempted":true,"reason":"expression depends on runtime or unresolved source bindings","status":"unresolved"}}}],"kind":"style","order":2,"selector":".card"}],"schema":"pandwind.style-program/4","source":{"adapter":"stylex","file":"src/Card.tsx","pattern":"stylex.create"},"sourceMap":[{"adapter":"stylex","file":"src/Card.tsx","pattern":"stylex.create"}],"themes":[{"authored":"$brand","path":"color.brand","resolved":"#2563eb"}]}"`,
		);
	});

	test("encodes and decodes a portable artifact with a deterministic fingerprint", () => {
		const artifact = StyleProgramCore.encode(program);
		const roundTrip = StyleProgramCore.decode(JSON.parse(JSON.stringify(artifact)));

		expect(artifact.schema).toBe(STYLE_PROGRAM_ARTIFACT_SCHEMA);
		expect(artifact.coreVersion).toBe(STYLE_PROGRAM_CORE_VERSION);
		expect(artifact.fingerprint).toMatch(/^sp-[a-z0-9]+$/);
		expect(roundTrip).toEqual(artifact.program);
		expect(StyleProgramCore.fingerprint(roundTrip)).toBe(artifact.fingerprint);
		expect(artifact).toMatchInlineSnapshot(`
			{
			  "coreVersion": "1",
			  "fingerprint": "sp-1alcb40",
			  "program": {
			    "canonicalization": undefined,
			    "compositions": [],
			    "declarations": [
			      {
			        "conditions": [],
			        "property": "color",
			        "value": {
			          "authored": "$brand",
			          "kind": "token",
			          "ref": "color.brand",
			          "resolved": "#2563eb",
			        },
			      },
			      {
			        "conditions": [],
			        "property": "padding",
			        "value": {
			          "kind": "literal",
			          "value": 8,
			        },
			      },
			      {
			        "conditions": [],
			        "property": "backgroundColor",
			        "value": {
			          "dependencies": [
			            "props.tone",
			          ],
			          "expression": "props.tone",
			          "expressionKind": "member",
			          "kind": "dynamic",
			          "staticEvaluation": {
			            "attempted": true,
			            "reason": "expression depends on runtime or unresolved source bindings",
			            "status": "unresolved",
			          },
			        },
			      },
			    ],
			    "emissionHints": [],
			    "plugins": [],
			    "residuals": [
			      {
			        "hint": "review plugin output",
			        "kind": "plugin-transform",
			        "text": "custom-shadow()",
			      },
			    ],
			    "rules": [
			      {
			        "children": [],
			        "conditions": [],
			        "declarations": [
			          {
			            "conditions": [],
			            "property": "margin",
			            "value": {
			              "kind": "literal",
			              "value": 0,
			            },
			          },
			        ],
			        "kind": "global",
			        "order": 1,
			        "selector": "body",
			      },
			      {
			        "children": [],
			        "conditions": [],
			        "declarations": [
			          {
			            "conditions": [],
			            "property": "color",
			            "value": {
			              "authored": "$brand",
			              "kind": "token",
			              "ref": "color.brand",
			              "resolved": "#2563eb",
			            },
			          },
			          {
			            "conditions": [],
			            "property": "padding",
			            "value": {
			              "kind": "literal",
			              "value": 8,
			            },
			          },
			          {
			            "conditions": [],
			            "property": "backgroundColor",
			            "value": {
			              "dependencies": [
			                "props.tone",
			              ],
			              "expression": "props.tone",
			              "expressionKind": "member",
			              "kind": "dynamic",
			              "staticEvaluation": {
			                "attempted": true,
			                "reason": "expression depends on runtime or unresolved source bindings",
			                "status": "unresolved",
			              },
			            },
			          },
			        ],
			        "kind": "style",
			        "order": 2,
			        "selector": ".card",
			      },
			    ],
			    "runtime": undefined,
			    "schema": "pandwind.style-program/4",
			    "source": {
			      "adapter": "stylex",
			      "file": "src/Card.tsx",
			      "pattern": "stylex.create",
			    },
			    "sourceMap": [
			      {
			        "adapter": "stylex",
			        "file": "src/Card.tsx",
			        "pattern": "stylex.create",
			      },
			    ],
			    "themes": [
			      {
			        "authored": "$brand",
			        "path": "color.brand",
			        "resolved": "#2563eb",
			      },
			    ],
			  },
			  "schema": "pandwind.style-program-artifact/1",
			}
		`);
	});

	test("rejects malformed and tampered artifacts explicitly", () => {
		const malformed = StyleProgramCore.validate({
			schema: "pandwind.style-program/4",
			rules: [{ kind: "not-a-rule", declarations: [], children: [], conditions: [] }],
			declarations: [],
			residuals: [],
		});

		expect(malformed).toMatchInlineSnapshot(`
			{
			  "issues": [
			    {
			      "message": "unknown rule kind",
			      "path": "rules[0].kind",
			    },
			    {
			      "message": "must be a finite number",
			      "path": "rules[0].order",
			    },
			  ],
			  "valid": false,
			}
		`);
		expect(() => StyleProgramCore.decode({ schema: STYLE_PROGRAM_ARTIFACT_SCHEMA })).toThrow(
			"unsupported StyleProgram core version",
		);
		const artifact = StyleProgramCore.encode(program);
		expect(() => StyleProgramCore.decode({ ...artifact, fingerprint: "sp-tampered" })).toThrow(
			"fingerprint does not match",
		);
	});

	test("negotiates supported core ranges without accepting ambiguous ranges", () => {
		const current = StyleProgramCompatibility.current();

		expect(StyleProgramCompatibility.negotiate(current)).toMatchObject({
			supported: true,
			currentVersion: STYLE_PROGRAM_CORE_VERSION,
		});
		expect(
			StyleProgramCompatibility.negotiate({ ...current, versionRange: ">=1 <2" }),
		).toMatchObject({ supported: true });
		expect(StyleProgramCompatibility.negotiate({ ...current, versionRange: "^2" })).toMatchObject({
			supported: false,
			reason: "plugin core version range does not include the current core",
		});
		expect(
			StyleProgramCompatibility.negotiate({ ...current, versionRange: "latest" }),
		).toMatchObject({ supported: false });
	});

	test("normalizes a replaceable frontend before the target adapter sees it", () => {
		const builtin = createBuiltinCodemodCatalog();
		const emotion = builtin.registry.get(CodemodAdapterId.Emotion)!;
		const stylex = builtin.registry.get(CodemodAdapterId.StyleX)!;
		let received: typeof program | undefined;
		const source = {
			...emotion,
			parse(sourceText: string, context: Parameters<typeof emotion.parse>[1]) {
				const parsed = emotion.parse(sourceText, context);
				return {
					...parsed,
					matches: parsed.matches.map((match) => ({
						...match,
						program: {
							...match.program,
							schema: "stale-schema" as typeof match.program.schema,
							declarations: [],
						},
					})),
				};
			},
		};
		const target = {
			...stylex,
			emit(
				styleProgram: Parameters<typeof stylex.emit>[0],
				context: Parameters<typeof stylex.emit>[1],
			) {
				received = styleProgram as typeof program;
				return stylex.emit(styleProgram, context);
			},
		};

		const result = runAdapterMigration(
			'import { css } from "@emotion/css";\nconst card = css({ color: "red" });',
			{
				from: CodemodAdapterId.Emotion,
				to: CodemodAdapterId.StyleX,
				file: "Card.tsx",
				readFile: () => undefined,
				adapterRegistry: createStyleAdapterRegistry([source, target]),
			},
		);

		expect(result.residuals).toEqual([]);
		expect(result.converted).toBe(1);
		expect(received).toBeDefined();
		expect(StyleProgramCore.validate(received)).toEqual({ valid: true, issues: [] });
		expect(received?.declarations.length).toBeGreaterThan(0);
	});
});
